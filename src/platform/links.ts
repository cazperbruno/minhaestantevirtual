import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { isNativePlatform } from "@/platform/runtime";
import { getPublicWebOrigin, isSafeInternalPath } from "@/platform/urls";

export type IncomingAppLink =
  | { type: "route"; path: string }
  | { type: "auth-callback"; url: string }
  | { type: "ignored" };

const READIFY_SCHEME = "readify:";

/**
 * Converte somente URLs confiáveis em ações internas.
 * Nunca entrega uma URL externa diretamente ao React Router.
 */
export function parseIncomingAppUrl(rawUrl: string): IncomingAppLink {
  try {
    const url = new URL(rawUrl);

    if (url.protocol === READIFY_SCHEME) {
      if (url.hostname === "auth" && url.pathname === "/callback") {
        return { type: "auth-callback", url: rawUrl };
      }

      if (url.hostname === "open") {
        const path = url.searchParams.get("path") || "/";
        return isSafeInternalPath(path)
          ? { type: "route", path }
          : { type: "ignored" };
      }

      return { type: "ignored" };
    }

    const publicOrigin = getPublicWebOrigin();
    if (url.origin !== publicOrigin) return { type: "ignored" };

    const path = `${url.pathname}${url.search}${url.hash}` || "/";
    return isSafeInternalPath(path)
      ? { type: "route", path }
      : { type: "ignored" };
  } catch {
    return { type: "ignored" };
  }
}

export interface NativeLinkBridgeHandlers {
  onRoute: (path: string) => void;
  onAuthCallback?: (url: string) => void | Promise<void>;
}

/**
 * Registra App Links/Universal Links/custom scheme somente no container nativo.
 * Retorna cleanup idempotente.
 */
export async function startNativeLinkBridge(
  handlers: NativeLinkBridgeHandlers,
): Promise<() => Promise<void>> {
  if (!isNativePlatform()) return async () => {};

  const handle = async (rawUrl: string) => {
    const parsed = parseIncomingAppUrl(rawUrl);
    if (parsed.type === "route") {
      handlers.onRoute(parsed.path);
      return;
    }
    if (parsed.type === "auth-callback") {
      try { await Browser.close(); } catch { /* browser may already be closed */ }
      await handlers.onAuthCallback?.(parsed.url);
    }
  };

  const listener = await App.addListener("appUrlOpen", ({ url }) => {
    void handle(url);
  });

  const launch = await App.getLaunchUrl().catch(() => undefined);
  if (launch?.url) await handle(launch.url);

  return async () => {
    await listener.remove();
  };
}
