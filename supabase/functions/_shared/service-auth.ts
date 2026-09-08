// Internal service-to-service authentication helper.
// Never use anon/publishable keys for privileged workers.

export interface ServiceAuthResult {
  ok: boolean;
  status?: number;
  error?: string;
}

function readBearerToken(authHeader: string | null): string {
  return (authHeader || "").replace(/^Bearer\s+/i, "").trim();
}

/**
 * Accepts only the exact service-role credential supplied by Supabase secrets.
 * This helper deliberately does not decode JWT payloads and does not accept anon keys.
 */
export function requireServiceRole(req: Request): ServiceAuthResult {
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!serviceRole) {
    console.error("[service-auth] SUPABASE_SERVICE_ROLE_KEY is not configured");
    return { ok: false, status: 500, error: "server_auth_not_configured" };
  }

  const bearer = readBearerToken(req.headers.get("Authorization"));
  const apiKey = (req.headers.get("apikey") || "").trim();
  const ok = bearer === serviceRole || apiKey === serviceRole;

  if (!ok) {
    return { ok: false, status: 401, error: "service_role_required" };
  }

  return { ok: true };
}
