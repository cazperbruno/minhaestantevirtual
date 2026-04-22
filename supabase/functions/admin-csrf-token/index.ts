// deno-lint-ignore-file no-explicit-any
/**
 * admin-csrf-token — Emite/rotaciona tokens anti-CSRF para admins.
 *
 * Body: { rotate?: boolean }  // se true, descarta tokens anteriores do user
 *
 * Resposta: { token, expires_at }
 *
 * Segurança:
 *  - Requer JWT válido + role admin.
 *  - Requer Origin/Referer dentro da lista confiável.
 *  - Token = 256 bits aleatórios, em base64url.
 *  - Apenas o HASH SHA-256 é persistido (defense in depth).
 *  - TTL 2h. Tokens antigos do user são marcados como expirados (rotate=true).
 *
 * Esta função NÃO exige X-CSRF-Token (é justamente quem o emite).
 * A proteção contra CSRF aqui é feita por:
 *  - JWT obrigatório (cookies same-site não são usados pelo Supabase JS).
 *  - Origin/Referer trust check.
 */
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-csrf-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2h

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

function toBase64Url(buf: Uint8Array): string {
  let s = "";
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

const json = (b: any, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    // Origin/Referer trust check
    const origin = req.headers.get("Origin");
    const referer = req.headers.get("Referer");
    if (!isTrustedOrigin(origin) && !isTrustedOrigin(referer)) {
      return json({ error: "Untrusted origin" }, 403);
    }

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u, error: uErr } = await userClient.auth.getUser();
    if (uErr || !u?.user) return json({ error: "Unauthorized" }, 401);

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isAdmin } = await sb.rpc("has_role", {
      _user_id: u.user.id,
      _role: "admin",
    });
    if (isAdmin !== true) return json({ error: "Admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const rotate = body?.rotate === true;

    if (rotate) {
      // Apaga tokens anteriores deste admin
      await sb.from("admin_csrf_tokens").delete().eq("user_id", u.user.id);
    } else {
      // Limpa apenas expirados deste admin (mantém ativos para múltiplas abas)
      await sb
        .from("admin_csrf_tokens")
        .delete()
        .eq("user_id", u.user.id)
        .lt("expires_at", new Date().toISOString());
    }

    // Gera token novo
    const raw = new Uint8Array(32);
    crypto.getRandomValues(raw);
    const token = toBase64Url(raw);
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

    const { error: insErr } = await sb.from("admin_csrf_tokens").insert({
      user_id: u.user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });
    if (insErr) return json({ error: insErr.message }, 500);

    // limpeza global oportunista
    void sb.rpc("cleanup_expired_admin_csrf_tokens");

    return json({ token, expires_at: expiresAt });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro" }, 500);
  }
});
