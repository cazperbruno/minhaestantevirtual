// deno-lint-ignore-file no-explicit-any
/**
 * delete-user-account — LGPD Art. 18 (eliminação).
 *
 * Apaga completamente a conta do usuário autenticado.
 * Requer confirmação explícita via body { confirm: "DELETE" }.
 *
 * Estratégia:
 *  1. Apagar dados nas tabelas públicas (a maioria já cascata via FK).
 *  2. Apagar o usuário em auth.users → cascata para o resto.
 *
 * Auth: JWT do próprio usuário. Cada user só pode apagar a si mesmo.
 */
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== "DELETE") {
      return new Response(
        JSON.stringify({ error: 'confirmation required: { confirm: "DELETE" }' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sbAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: { user }, error: userErr } = await sbAuth.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "invalid auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const uid = user.id;
    // Limpar tabelas onde a FK pode não estar com cascade. Defensivo.
    await Promise.allSettled([
      sb.from("user_books").delete().eq("user_id", uid),
      sb.from("reviews").delete().eq("user_id", uid),
      sb.from("review_comments").delete().eq("user_id", uid),
      sb.from("review_likes").delete().eq("user_id", uid),
      sb.from("book_recommendations").delete().eq("user_id", uid),
      sb.from("recommendation_comments").delete().eq("user_id", uid),
      sb.from("recommendation_likes").delete().eq("user_id", uid),
      sb.from("activities").delete().eq("user_id", uid),
      sb.from("activity_comments").delete().eq("user_id", uid),
      sb.from("activity_likes").delete().eq("user_id", uid),
      sb.from("follows").delete().or(`follower_id.eq.${uid},following_id.eq.${uid}`),
      sb.from("notifications").delete().eq("user_id", uid),
      sb.from("push_subscriptions").delete().eq("user_id", uid),
      sb.from("club_members").delete().eq("user_id", uid),
      sb.from("club_messages").delete().eq("user_id", uid),
      sb.from("user_achievements").delete().eq("user_id", uid),
      sb.from("reading_goals").delete().eq("user_id", uid),
      sb.from("book_notes").delete().eq("user_id", uid),
      sb.from("profiles").delete().eq("id", uid),
    ]);

    // Apagar do auth → cascata para o resto.
    const { error: delErr } = await sb.auth.admin.deleteUser(uid);
    if (delErr) {
      return new Response(JSON.stringify({ error: delErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Audit log (não-bloqueante)
    sb.from("admin_audit_log").insert({
      actor_id: uid,
      action: "user.self_delete",
      target_id: uid,
      target_type: "user",
      ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      user_agent: req.headers.get("user-agent")?.slice(0, 500) || null,
    }).then(() => {}, () => {});

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "internal" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
