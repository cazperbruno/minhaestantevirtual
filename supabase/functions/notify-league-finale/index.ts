// =====================================================================
// notify-league-finale — Cron domingo 18h Brasília
// Cria notificações personalizadas avisando posição na divisão.
// Cron: service_role. Execução manual: admin + CSRF via guard central.
// =====================================================================
import { requireAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-csrf-token",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const guard = await requireAdmin(req);
  if (!guard.ok) {
    return new Response(JSON.stringify({ error: guard.status === 401 ? "unauthorized" : "forbidden" }), {
      status: guard.status ?? 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const startedAt = Date.now();
  const { data, error } = await guard.sb.rpc("create_league_finale_notifications");

  if (error) {
    console.error("[notify-league-finale] rpc error", error.code, error.message);
    return new Response(JSON.stringify({ error: "notification_job_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const created = (data as number) ?? 0;
  console.log(`[notify-league-finale] created=${created} duration_ms=${Date.now() - startedAt}`);

  return new Response(JSON.stringify({ ok: true, created }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
