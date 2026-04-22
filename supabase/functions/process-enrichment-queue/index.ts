// deno-lint-ignore-file no-explicit-any
// =====================================================================
// process-enrichment-queue — Drena fila em batch (cron 5 min)
// Pega até N pending, marca como processing, chama enrich-book interno,
// atualiza status. Backoff exponencial em falhas.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { requireAdminOrCron } from "../_shared/admin-guard.ts";

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
    return new Response(JSON.stringify({ error: guard.error }), {
      status: guard.status ?? 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = guard.sb;

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
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Marca como processing (otimistic — uma rodada por vez via cron 5min, sem race)
  await sb
    .from("enrichment_queue")
    .update({ status: "processing" })
    .in("id", jobs.map((j) => j.id));

  let okCount = 0, failCount = 0, skipCount = 0;

  for (const job of jobs) {
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/enrich-book`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify({ book_id: job.book_id }),
      });
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
      } else {
        throw new Error(j.error || `HTTP ${r.status}`);
      }
    } catch (e) {
      failCount++;
      const attempts = (job.attempts ?? 0) + 1;
      const giveUp = attempts >= MAX_ATTEMPTS;
      const backoffMin = Math.pow(2, attempts) * 5; // 10,20,40,80 min
      await sb.from("enrichment_queue").update({
        status: giveUp ? "failed" : "pending",
        attempts,
        last_error: (e as Error).message.slice(0, 500),
        next_attempt_at: new Date(Date.now() + backoffMin * 60_000).toISOString(),
      }).eq("id", job.id);
    }
  }

  return new Response(JSON.stringify({
    ok: true, processed: jobs.length, success: okCount, skipped: skipCount, failed: failCount,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
