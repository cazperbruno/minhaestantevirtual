import { isNativePlatform } from "@/platform/runtime";

const FALLBACK_PUBLIC_ORIGIN = "https://readifybook.lovable.app";
const NATIVE_SCHEME = "readify";

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/**
 * URL pública canônica do Readify. Pode ser trocada por domínio próprio sem
 * alterar componentes, deep links ou páginas legais.
 */
export function getPublicWebOrigin(): string {
  const configured = import.meta.env.VITE_PUBLIC_APP_URL as string | undefined;
  if (configured?.trim()) return normalizeOrigin(configured);

  if (typeof window !== "undefined" && /^https?:$/.test(window.location.protocol)) {
    return normalizeOrigin(window.location.origin);
  }

  return FALLBACK_PUBLIC_ORIGIN;
}

/** Callback web usado enquanto o bridge OAuth nativo ainda não está ativado. */
export function getWebAuthRedirectUri(): string {
  return `${getPublicWebOrigin()}/auth`;
}

/**
 * Callback reservado para os containers Android/iOS. Só deve ser ativado no
 * fluxo OAuth depois que @capacitor/app + browser/deep-link bridge estiverem
 * configurados e o provedor autorizar este redirect.
 */
export function getNativeAuthCallbackUri(): string {
  return `${NATIVE_SCHEME}://auth/callback`;
}

export function getPreferredAuthRedirectUri(): string {
  return isNativePlatform() ? getNativeAuthCallbackUri() : getWebAuthRedirectUri();
}

/** Converte path interno em URL pública compartilhável. */
export function toPublicUrl(path = "/"): string {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `${getPublicWebOrigin()}${safePath}`;
}

export function isSafeInternalPath(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  try {
    const parsed = new URL(value, getPublicWebOrigin());
    return parsed.origin === getPublicWebOrigin();
  } catch {
    return false;
  }
}
