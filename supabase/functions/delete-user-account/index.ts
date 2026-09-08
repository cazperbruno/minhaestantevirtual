// deno-lint-ignore-file no-explicit-any
/**
 * delete-user-account — LGPD / Google Play account deletion.
 *
 * Requer confirmação explícita via body { confirm: "DELETE" } e autenticação do
 * próprio usuário. A limpeza dos dados públicos é feita por uma única função
 * PostgreSQL transacional; o auth user só é removido depois de a purga concluir.
 */
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== "DELETE") {
      return json({ error: "confirmation_required" }, 400);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "missing_auth" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const sbAuth = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: userErr } = await sbAuth.auth.getUser();
    if (userErr || !user) return json({ error: "invalid_auth" }, 401);

    const sb = createClient(url, service);
    const uid = user.id;

    // One PostgreSQL transaction. Any SQL failure rolls the entire public-data
    // purge back, so we never continue to auth deletion after a partial cleanup.
    const { data: purge, error: purgeErr } = await sb.rpc("purge_user_data", {
      _user_id: uid,
    });

    if (purgeErr) {
      console.error("[delete-user-account] purge failed", purgeErr.code, purgeErr.message);
      return json({ error: "deletion_failed" }, 500);
    }

    const { error: delErr } = await sb.auth.admin.deleteUser(uid);
    if (delErr) {
      // Public data is already gone. The operation is intentionally idempotent:
      // retrying account deletion can safely attempt auth deletion again.
      console.error("[delete-user-account] auth deletion failed", delErr.message);
      return json({ error: "auth_deletion_failed", purge_completed: true }, 500);
    }

    // Do not write a post-delete audit row containing the deleted user's UUID.
    return json({
      ok: true,
      transferred_clubs: (purge as any)?.transferred_clubs ?? 0,
      deleted_empty_clubs: (purge as any)?.deleted_empty_clubs ?? 0,
    });
  } catch (e: any) {
    console.error("[delete-user-account] fatal", e?.message || e);
    return json({ error: "internal_error" }, 500);
  }
});
