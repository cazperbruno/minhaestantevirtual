import { lovable } from "@/integrations/lovable";
import { getRuntimePlatform, isNativePlatform } from "@/platform/runtime";

export type SocialAuthProvider = "google" | "apple";

export interface SocialAuthAvailability {
  provider: SocialAuthProvider;
  available: boolean;
  reason?: "native_provider_not_configured";
}

/**
 * O broker OAuth legado do Lovable permanece encapsulado SOMENTE para a web.
 * Android/iOS terão implementação nativa/PKCE própria antes da publicação.
 */
export function getSocialAuthAvailability(
  provider: SocialAuthProvider,
): SocialAuthAvailability {
  if (isNativePlatform()) {
    return { provider, available: false, reason: "native_provider_not_configured" };
  }
  return { provider, available: true };
}

export async function signInWithSocialProvider(provider: SocialAuthProvider) {
  const availability = getSocialAuthAvailability(provider);
  if (!availability.available) {
    throw new Error(`${getRuntimePlatform()}_social_auth_not_configured`);
  }

  return lovable.auth.signInWithOAuth(provider, {
    redirect_uri: window.location.origin,
  });
}
