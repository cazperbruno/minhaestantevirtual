import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { startNativeLinkBridge } from "@/platform/links";

export const NATIVE_AUTH_CALLBACK_EVENT = "readify:native-auth-callback";

/** Liga App Links/Universal Links ao React Router sem contaminar páginas. */
export function useNativeDeepLinks() {
  const navigate = useNavigate();

  useEffect(() => {
    let dispose: (() => Promise<void>) | undefined;
    let cancelled = false;

    void startNativeLinkBridge({
      onRoute: (path) => navigate(path),
      onAuthCallback: (url) => {
        if (cancelled) return;
        window.dispatchEvent(
          new CustomEvent(NATIVE_AUTH_CALLBACK_EVENT, { detail: { url } }),
        );
      },
    }).then((cleanup) => {
      if (cancelled) void cleanup();
      else dispose = cleanup;
    });

    return () => {
      cancelled = true;
      if (dispose) void dispose();
    };
  }, [navigate]);
}
