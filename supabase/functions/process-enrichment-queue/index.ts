// deno-lint-ignore-file no-explicit-any
// =====================================================================
// process-enrichment-queue — Drena fila em batch (cron 5 min)
// Inclui: recuperação de jobs travados, classificação de erros (auth/rate/...),
// retry específico para 401 sem consumir tentativas, e logs detalhados.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { requireAdminOrCron } from "../_shared/admin-guard.ts";
import { startRun, finishRun } from "../_shared/automation-runs.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-csrf-token",
};

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 4;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const guard = await requireAdminOrCron(req);
  if (!guard.ok) {
    console.error("[process-enrichment-queue] guard rejected", {
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

  // ---- Recover stuck jobs (processing > 15 min) — evita travar progresso ----
  const stuckCutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data: stuck, error: stuckErr } = await sb
    .from("enrichment_queue")
    .update({
      status: "pending",
      next_attempt_at: new Date().toISOString(),
      last_error: "auto-recovered: stuck in processing > 15min",
    })
    .eq("status", "processing")
    .lt("enqueued_at", stuckCutoff)
    .select("id");
  if (stuck && stuck.length > 0) {
    console.warn(`[process-enrichment-queue] recovered ${stuck.length} stuck jobs`);
  }
  if (stuckErr) {
    console.error("[process-enrichment-queue] stuck recovery error", stuckErr.message);
  }

  // Pega lote
  const { data: jobs, error } = await sb
    .from("enrichment_queue")
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

  // Marca como processing (otimistic — uma rodada por vez via cron 5min, sem race)
  await sb
    .from("enrichment_queue")
    .update({ status: "processing" })
    .in("id", jobs.map((j) => j.id));

  let okCount = 0, failCount = 0, skipCount = 0, authFailCount = 0;

  for (const job of jobs) {
    let httpStatus = 0;
    let errMsg = "";
    let errKind: "auth" | "rate" | "server" | "network" | "app" = "app";
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/enrich-book`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE}`,
          // O Supabase Gateway exige `apikey` ou rejeita 401 antes da função executar
          apikey: SERVICE_ROLE,
        },
        body: JSON.stringify({ book_id: job.book_id }),
      });
      httpStatus = r.status;
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) {
        const filled = (j.fields_filled as string[]) || [];
        if (filled.length === 0) {
          skipCount++;
          await sb.from("enrichment_queue").update({
            status: "skipped",
            processed_at: new Date().toISOString(),
            fields_filled: [],
          }).eq("id", job.id);
        } else {
          okCount++;
          await sb.from("enrichment_queue").update({
            status: "done",
            processed_at: new Date().toISOString(),
            fields_filled: filled,
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
      // Auth: NÃO consome tentativa (problema de config, não do job)
      // e re-enfileira rápido para o próximo cron.
      let giveUp = false;
      let backoffMin: number;
      let nextAttempts = attempts;
      if (errKind === "auth") {
        nextAttempts = job.attempts ?? 0;
        backoffMin = 2;
      } else if (errKind === "rate") {
        backoffMin = 15;
      } else {
        giveUp = attempts >= MAX_ATTEMPTS;
        backoffMin = Math.pow(2, attempts) * 5; // 10,20,40,80 min
      }

      const taggedError = `[${errKind}${httpStatus ? ` ${httpStatus}` : ""}] ${errMsg}`.slice(0, 500);
      console.error("[process-enrichment-queue] job failed", {
        job_id: job.id,
        book_id: job.book_id,
        kind: errKind,
        status: httpStatus,
        attempts: nextAttempts,
        giveUp,
        msg: errMsg.slice(0, 200),
      });

      await sb.from("enrichment_queue").update({
        status: giveUp ? "failed" : "pending",
        attempts: nextAttempts,
        last_error: taggedError,
        next_attempt_at: new Date(Date.now() + backoffMin * 60_000).toISOString(),
      }).eq("id", job.id);
    }
  }

  const allAuthFailed = authFailCount > 0 && authFailCount === jobs.length;
  if (allAuthFailed) {
    console.error("[process-enrichment-queue] ALL jobs failed with auth — verifique config de auth de enrich-book");
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
