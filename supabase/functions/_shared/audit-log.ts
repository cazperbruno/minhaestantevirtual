// deno-lint-ignore-file no-explicit-any
/**
 * audit-log — Helper compartilhado para registrar ações administrativas
 * sensíveis na tabela `admin_audit_log`.
 *
 * Diferente de `book_audit_log` (focado em mudanças de catálogo), este loga
 * eventos de SEGURANÇA: promoção/rebaixamento de admin, deleção de usuário,
 * mudanças de role, ações destrutivas em massa.
 *
 * Insert é fire-and-forget — não falha o request se o log falhar.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

export interface AuditEntry {
  actorId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, any>;
}

/** Extrai IP e User-Agent do request para forense. */
function extractClientInfo(req: Request): { ip: string | null; ua: string | null } {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0]?.trim() ?? null : null;
  const ua = req.headers.get("user-agent");
  return { ip, ua };
}

/**
 * Registra uma ação administrativa. Silencioso em caso de erro — não devemos
 * derrubar a operação principal por causa do log.
 */
export async function writeAuditLog(
  sb: SupabaseClient,
  req: Request,
  entry: AuditEntry,
): Promise<void> {
  const { ip, ua } = extractClientInfo(req);
  try {
    await sb.from("admin_audit_log").insert({
      actor_id: entry.actorId,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      ip_address: ip,
      user_agent: ua,
      metadata: entry.metadata ?? null,
    });
  } catch (e) {
    console.error("[audit-log] failed to write:", e);
  }
}
