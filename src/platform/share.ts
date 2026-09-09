import { Share } from "@capacitor/share";
import { isNativePlatform } from "@/platform/runtime";
import { toPublicUrl } from "@/platform/urls";

export interface SharePayload {
  title?: string;
  text?: string;
  path?: string;
  url?: string;
}

export type ShareResult = "shared" | "copied" | "cancelled" | "unsupported";

/** Share sheet nativa com fallback web/clipboard. */
export async function shareReadify(payload: SharePayload): Promise<ShareResult> {
  const url = payload.url || (payload.path ? toPublicUrl(payload.path) : undefined);

  if (isNativePlatform()) {
    try {
      const capability = await Share.canShare();
      if (!capability.value) return "unsupported";
      await Share.share({
        title: payload.title,
        text: payload.text,
        url,
        dialogTitle: payload.title || "Compartilhar pelo Readify",
      });
      return "shared";
    } catch (error) {
      // Capacitor rejeita a Promise quando o usuário cancela em algumas plataformas.
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (message.includes("cancel")) return "cancelled";
      throw error;
    }
  }

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: payload.title, text: payload.text, url });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      throw error;
    }
  }

  const fallback = url || payload.text;
  if (fallback && typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(fallback);
    return "copied";
  }

  return "unsupported";
}
