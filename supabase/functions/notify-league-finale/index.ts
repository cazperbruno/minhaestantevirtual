// =====================================================================
// notify-league-finale — Cron domingo 18h Brasília (~3h antes do fim da liga)
// Cria notificações personalizadas avisando posição na divisão.
// Aceita: cron (bearer service-role) OU admin manual.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  if (!SERVICE_ROLE || !SUPABASE_URL) {
    return new Response(JSON.stringify({ error: "missing service config" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const isService = token === SERVICE_ROLE;

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  if (!isService) {
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await sb.rpc("has_role", {
      _user_id: u.user.id, _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const startedAt = Date.now();
  const { data, error } = await sb.rpc("create_league_finale_notifications");

  if (error) {
    console.error("[notify-league-finale] rpc error", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const created = (data as number) ?? 0;
  console.log(`[notify-league-finale] created=${created} duration_ms=${Date.now() - startedAt}`);

  return new Response(JSON.stringify({ ok: true, created }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
