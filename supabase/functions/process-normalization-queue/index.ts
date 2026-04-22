// deno-lint-ignore-file no-explicit-any
// =====================================================================
// process-normalization-queue — Drena fila de normalização IA (cron)
// Inclui: recuperação de jobs travados, classificação de erros e retry
// inteligente para 401 sem consumir tentativas.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { requireAdminOrCron } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-csrf-token",
};

const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const guard = await requireAdminOrCron(req);
  if (!guard.ok) {
    console.error("[process-normalization-queue] guard rejected", {
      status: guard.status,
      error: guard.error,
    });
    return new Response(JSON.stringify({ error: guard.error }), {
      status: guard.status ?? 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = guard.sb;

  // Recover stuck jobs (processing > 20 min)
  const stuckCutoff = new Date(Date.now() - 20 * 60_000).toISOString();
  const { data: stuck } = await sb
    .from("metadata_normalization_queue")
    .update({
      status: "pending",
      next_attempt_at: new Date().toISOString(),
      last_error: "auto-recovered: stuck in processing > 20min",
    })
    .eq("status", "processing")
    .lt("enqueued_at", stuckCutoff)
    .select("id");
  if (stuck && stuck.length > 0) {
    console.warn(`[process-normalization-queue] recovered ${stuck.length} stuck jobs`);
  }

  const { data: jobs, error } = await sb
    .from("metadata_normalization_queue")
    .select("id,book_id,attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("enqueued_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!jobs || jobs.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0, recovered: stuck?.length ?? 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await sb.from("metadata_normalization_queue")
    .update({ status: "processing" })
    .in("id", jobs.map((j) => j.id));

  let okCount = 0, failCount = 0, skipCount = 0, authFailCount = 0;

  for (const job of jobs) {
    let httpStatus = 0;
    let errMsg = "";
    let errKind: "auth" | "rate" | "server" | "network" | "app" = "app";
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/normalize-book-meta`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE}`,
          apikey: SERVICE_ROLE,
        },
        body: JSON.stringify({ book_id: job.book_id }),
      });
      httpStatus = r.status;
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) {
        const changed = (j.fields_changed as string[]) || [];
        if (changed.length === 0) {
          skipCount++;
          await sb.from("metadata_normalization_queue").update({
            status: "skipped",
            processed_at: new Date().toISOString(),
            fields_changed: [],
          }).eq("id", job.id);
        } else {
          okCount++;
          await sb.from("metadata_normalization_queue").update({
            status: "done",
            processed_at: new Date().toISOString(),
            fields_changed: changed,
          }).eq("id", job.id);
        }
        continue;
      }
      errMsg = j.error || `HTTP ${r.status}`;
      if (r.status === 401 || r.status === 403) errKind = "auth";
      else if (r.status === 429) errKind = "rate";
      else if (r.status >= 500) errKind = "server";
      throw new Error(errMsg);
    } catch (e) {
      if (!errMsg) {
        errMsg = (e as Error).message || "unknown";
        errKind = "network";
      }
      failCount++;
      if (errKind === "auth") authFailCount++;

      const attempts = (job.attempts ?? 0) + 1;
      let giveUp = false;
      let backoffMin: number;
      let nextAttempts = attempts;
      if (errKind === "auth") {
        nextAttempts = job.attempts ?? 0; // não consome tentativa
        backoffMin = 5;
      } else if (errKind === "rate") {
        backoffMin = 30;
      } else {
        giveUp = attempts >= MAX_ATTEMPTS;
        backoffMin = Math.pow(2, attempts) * 10; // 20, 40, 80 min
      }

      const taggedError = `[${errKind}${httpStatus ? ` ${httpStatus}` : ""}] ${errMsg}`.slice(0, 500);
      console.error("[process-normalization-queue] job failed", {
        job_id: job.id,
        book_id: job.book_id,
        kind: errKind,
        status: httpStatus,
        attempts: nextAttempts,
        giveUp,
        msg: errMsg.slice(0, 200),
      });

      await sb.from("metadata_normalization_queue").update({
        status: giveUp ? "failed" : "pending",
        attempts: nextAttempts,
        last_error: taggedError,
        next_attempt_at: new Date(Date.now() + backoffMin * 60_000).toISOString(),
      }).eq("id", job.id);
    }
  }

  const allAuthFailed = authFailCount > 0 && authFailCount === jobs.length;
  if (allAuthFailed) {
    console.error("[process-normalization-queue] ALL jobs failed with auth — verifique config de auth de normalize-book-meta");
  }

  return new Response(JSON.stringify({
    ok: !allAuthFailed,
    processed: jobs.length,
    success: okCount,
    skipped: skipCount,
    failed: failCount,
    auth_failed: authFailCount,
    recovered: stuck?.length ?? 0,
  }), {
    status: allAuthFailed ? 502 : 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
