// deno-lint-ignore-file no-explicit-any
// =====================================================================
// process-normalization-queue — Drena fila de normalização IA (cron)
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

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
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await sb.from("metadata_normalization_queue")
    .update({ status: "processing" })
    .in("id", jobs.map((j) => j.id));

  let okCount = 0, failCount = 0, skipCount = 0;

  for (const job of jobs) {
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/normalize-book-meta`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify({ book_id: job.book_id }),
      });
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
      } else {
        throw new Error(j.error || `HTTP ${r.status}`);
      }
    } catch (e) {
      failCount++;
      const attempts = (job.attempts ?? 0) + 1;
      const giveUp = attempts >= MAX_ATTEMPTS;
      const backoffMin = Math.pow(2, attempts) * 10; // 20, 40, 80 min
      await sb.from("metadata_normalization_queue").update({
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
