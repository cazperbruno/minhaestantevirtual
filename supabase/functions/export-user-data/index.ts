// deno-lint-ignore-file no-explicit-any
/**
 * export-user-data — LGPD Art. 18 (portabilidade).
 *
 * Retorna um JSON com todos os dados do usuário autenticado:
 * perfil, biblioteca, reviews, recomendações, clubes, follows, conquistas, XP, sessões.
 *
 * Auth: JWT do usuário (não admin). Cada user só pode exportar os próprios dados.
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

    // Cliente service role para coletar tudo do usuário (RLS bypass).
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const uid = user.id;
    const [profile, library, reviews, recs, follows, achievements, goals, notes, xpHistory] =
      await Promise.all([
        sb.from("profiles").select("*").eq("id", uid).maybeSingle(),
        sb.from("user_books").select("*").eq("user_id", uid),
        sb.from("reviews").select("*").eq("user_id", uid),
        sb.from("book_recommendations").select("*").eq("user_id", uid),
        sb.from("follows").select("*").or(`follower_id.eq.${uid},following_id.eq.${uid}`),
        sb.from("user_achievements").select("*").eq("user_id", uid),
        sb.from("reading_goals").select("*").eq("user_id", uid),
        sb.from("book_notes").select("*").eq("user_id", uid),
        sb.from("xp_events").select("*").eq("user_id", uid),
      ]);

    const payload = {
      generated_at: new Date().toISOString(),
      user: { id: uid, email: user.email, created_at: user.created_at },
      profile: profile.data,
      library: library.data ?? [],
      reviews: reviews.data ?? [],
      recommendations: recs.data ?? [],
      follows: follows.data ?? [],
      achievements: achievements.data ?? [],
      reading_goals: goals.data ?? [],
      notes: notes.data ?? [],
      xp_history: xpHistory.data ?? [],
    };

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="readify-export-${uid}.json"`,
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "internal" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
