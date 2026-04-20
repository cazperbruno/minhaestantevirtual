// Cron diário: garante 3 daily, 3 weekly e 2 epic ativos por usuário.
// Pode ser chamado manualmente (?user_id=...) ou em massa (sem args, processa todos).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const url = new URL(req.url);
    let body: any = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { /* ignore */ }
    }
    const targetUserId = body.user_id || url.searchParams.get("user_id");

    let userIds: string[] = [];
    if (targetUserId) {
      userIds = [targetUserId];
    } else {
      // Todos os usuários ativos nos últimos 30 dias (otimização de custo)
      const { data } = await supabase
        .from("profiles")
        .select("id, updated_at")
        .gte("updated_at", new Date(Date.now() - 30 * 86400_000).toISOString())
        .limit(5000);
      userIds = (data || []).map((p) => p.id);
    }

    let assigned = 0;
    let recomputed = 0;
    for (const uid of userIds) {
      const { data: aData } = await supabase.rpc("assign_daily_challenges", { _user_id: uid });
      const { data: rData } = await supabase.rpc("recompute_challenge_progress", { _user_id: uid });
      assigned += Number(aData ?? 0);
      recomputed += Number(rData ?? 0);
    }

    return new Response(
      JSON.stringify({ ok: true, users: userIds.length, assigned, recomputed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("generate-challenges error", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
