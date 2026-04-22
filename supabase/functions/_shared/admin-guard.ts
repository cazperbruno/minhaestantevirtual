// deno-lint-ignore-file no-explicit-any
/**
 * admin-guard — Verificação de acesso administrativo + anti-CSRF.
 *
 * Modelo de segurança em camadas:
 *  1. Authorization JWT obrigatório (a menos que seja service_role).
 *  2. Usuário precisa ter role 'admin' (RPC has_role).
 *  3. Origin/Referer precisa bater com lista de origens confiáveis
 *     (defesa adicional contra CSRF cross-origin).
 *  4. Header `X-CSRF-Token` precisa bater com um token ativo emitido
 *     por `admin-csrf-token` para esse user_id, e dentro do TTL.
 *
 * Service role chamando entre funções (cron interno) ignora 3 e 4.
 */
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

export interface AdminGuardResult {
  ok: boolean;
  status?: number;
  error?: string;
  isService?: boolean;
  userId?: string;
  sb: SupabaseClient;
}

const TRUSTED_ORIGIN_SUFFIXES = [
  ".lovable.app",
  ".lovableproject.com",
  ".sandbox.lovable.dev",
];
const TRUSTED_ORIGINS_EXACT = new Set<string>([
  "https://readifybook.lovable.app",
]);

function isTrustedOrigin(rawOrigin: string | null): boolean {
  if (!rawOrigin) return false;
  try {
    const u = new URL(rawOrigin);
    if (u.protocol !== "https:" && u.hostname !== "localhost") return false;
    const origin = `${u.protocol}//${u.host}`;
    if (TRUSTED_ORIGINS_EXACT.has(origin)) return true;
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    return TRUSTED_ORIGIN_SUFFIXES.some((sfx) => u.hostname.endsWith(sfx));
  } catch {
    return false;
  }
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time string compare (prevents timing leaks on token hash). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Use this at the top of every admin-only edge function.
 * Returns either { ok: true, ... } or { ok: false, status, error }.
 */
export async function requireAdmin(req: Request): Promise<AdminGuardResult> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  const authHeader = req.headers.get("Authorization") || "";
  const apiKey = req.headers.get("apikey") || "";
  const isService =
    authHeader === `Bearer ${SERVICE_ROLE}` || apiKey === SERVICE_ROLE;

  // Service role: chamadas server-to-server (cron, fan-out interno).
  // Não passa por CSRF nem por Origin (não há browser envolvido).
  if (isService) {
    return { ok: true, isService: true, sb };
  }

  // ---- Camada 1: JWT obrigatório ----
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Unauthorized: missing JWT", sb };
  }
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: u, error: uErr } = await userClient.auth.getUser();
  if (uErr || !u?.user) {
    return { ok: false, status: 401, error: "Unauthorized: invalid JWT", sb };
  }

  // ---- Camada 2: role admin ----
  const { data: isAdmin, error: roleErr } = await sb.rpc("has_role", {
    _user_id: u.user.id,
    _role: "admin",
  });
  if (roleErr || isAdmin !== true) {
    return { ok: false, status: 403, error: "Forbidden: admin only", sb };
  }

  // ---- Camada 3: Origin/Referer trust ----
  const origin = req.headers.get("Origin");
  const referer = req.headers.get("Referer");
  const sourceOk = isTrustedOrigin(origin) || isTrustedOrigin(referer);
  if (!sourceOk) {
    return {
      ok: false,
      status: 403,
      error: "CSRF: untrusted origin",
      sb,
    };
  }

  // ---- Camada 4: token CSRF ----
  const csrfToken = req.headers.get("X-CSRF-Token") || "";
  if (!csrfToken || csrfToken.length < 32 || csrfToken.length > 256) {
    return { ok: false, status: 403, error: "CSRF: missing token", sb };
  }
  const tokenHash = await sha256Hex(csrfToken);

  const { data: row, error: tErr } = await sb
    .from("admin_csrf_tokens")
    .select("id, user_id, token_hash, expires_at")
    .eq("user_id", u.user.id)
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (tErr || !row || !timingSafeEqual(row.token_hash, tokenHash)) {
    return { ok: false, status: 403, error: "CSRF: invalid token", sb };
  }

  // touch last_used_at (best-effort, não bloqueia)
  void sb
    .from("admin_csrf_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id);

  return { ok: true, isService: false, userId: u.user.id, sb };
}

/** Helper para shape padronizado de resposta JSON com CORS. */
export function jsonError(
  message: string,
  status: number,
  corsHeaders: Record<string, string>,
) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export { sha256Hex };
