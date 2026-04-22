// deno-lint-ignore-file no-explicit-any
/**
 * admin-user-action — Ações administrativas sobre usuários.
 *
 * Body: { action: "promote_admin" | "demote_admin", user_id: string }
 *
 * Auth: admin com CSRF (via requireAdmin). Service role NÃO é aceito aqui
 * para forçar trilha humana auditável.
 *
 * Salva no book_audit_log (process="admin-user-action") com before/after.
 */
import { requireAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-csrf-token",
};

const json = (b: any, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return json({ error: guard.error }, guard.status ?? 403);
    if (guard.isService) return json({ error: "Forbidden: human admin required" }, 403);
    const sb = guard.sb;
    const actorId = guard.userId!;

    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const userId = body?.user_id;
    if (!action || typeof userId !== "string" || !UUID_RE.test(userId)) {
      return json({ error: "Invalid action or user_id" }, 400);
    }
    if (userId === actorId && action === "demote_admin") {
      return json({ error: "Você não pode remover seu próprio admin" }, 400);
    }

    if (action === "promote_admin") {
      const { error } = await sb
        .from("user_roles")
        .insert({ user_id: userId, role: "admin" });
      // Idempotente: ignora unique violation
      if (error && error.code !== "23505") {
        return json({ error: error.message }, 500);
      }
    } else if (action === "demote_admin") {
      const { error } = await sb
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", "admin");
      if (error) return json({ error: error.message }, 500);
    } else {
      return json({ error: "Unknown action" }, 400);
    }

    await sb.from("book_audit_log").insert({
      process: "admin-user-action",
      action,
      fields_changed: ["role"],
      details: { actor_id: actorId, target_user_id: userId },
    });

    return json({ ok: true, action, user_id: userId });
  } catch (e) {
    console.error("admin-user-action error", e);
    return json({ error: e instanceof Error ? e.message : "Erro" }, 500);
  }
});
