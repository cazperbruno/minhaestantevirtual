// Cron diário: garante desafios ativos por usuário.
// Endpoint privilegiado: somente worker interno autenticado com service_role.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { requireServiceRole } from "../_shared/service-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const serviceAuth = requireServiceRole(req);
  if (!serviceAuth.ok) {
    return new Response(JSON.stringify({ error: serviceAuth.error }), {
      status: serviceAuth.status ?? 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const url = new URL(req.url);
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { /* sem body */ }
    }

    const bodyUserId = typeof body.user_id === "string" ? body.user_id : null;
    const targetUserId = bodyUserId || url.searchParams.get("user_id");

    let userIds: string[] = [];
    if (targetUserId) {
      userIds = [targetUserId];
    } else {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, updated_at")
        .gte("updated_at", new Date(Date.now() - 30 * 86400_000).toISOString())
        .limit(5000);
      if (error) throw error;
      userIds = (data || []).map((p) => p.id);
    }

    let assigned = 0;
    let recomputed = 0;

    for (const uid of userIds) {
      const { data: aData, error: assignError } = await supabase.rpc(
        "assign_daily_challenges",
        { _user_id: uid },
      );
      if (assignError) throw assignError;

      const { data: rData, error: recomputeError } = await supabase.rpc(
        "recompute_challenge_progress",
        { _user_id: uid },
      );
      if (recomputeError) throw recomputeError;

      assigned += Number(aData ?? 0);
      recomputed += Number(rData ?? 0);
    }

    return new Response(
      JSON.stringify({ ok: true, users: userIds.length, assigned, recomputed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("generate-challenges error", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
