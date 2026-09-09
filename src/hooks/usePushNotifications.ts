import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getRuntimeCapabilities } from "@/platform/runtime";
import { toast } from "sonner";

// VAPID public key — por definição pode ser distribuída ao cliente.
const VAPID_PUBLIC_KEY =
  "BF2xbHxZQ1MNV0sZZ5QZ8sWHfugbLhwEsXvTl7iO1Fp-u6dqcxELBN9JNHzSq6rYhxi0GTQS0tcifmMTYPICcPk";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushState =
  | "unsupported"
  | "native-pending"
  | "denied"
  | "default"
  | "granted-subscribed"
  | "granted-unsubscribed"
  | "loading";

/**
 * Web Push adapter.
 *
 * Native Android/iOS intentionally do not fall back to Web Push inside the
 * Capacitor WebView. They will use the native APNs/FCM adapter, keeping the
 * notification model deterministic across stores.
 */
export function usePushNotifications() {
  const { user } = useAuth();
  const capabilities = useMemo(() => getRuntimeCapabilities(), []);
  const [state, setState] = useState<PushState>(
    capabilities.native ? "native-pending" : "loading",
  );
  const [busy, setBusy] = useState(false);

  const supported = capabilities.webPush;

  const getPwaRegistration = useCallback(async () => {
    if (!supported) return undefined;
    return navigator.serviceWorker.getRegistration("/");
  }, [supported]);

  const refresh = useCallback(async () => {
    if (capabilities.native) {
      setState("native-pending");
      return;
    }
    if (!supported) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") return setState("denied");
    if (Notification.permission === "default") return setState("default");

    try {
      const reg = await getPwaRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "granted-subscribed" : "granted-unsubscribed");
    } catch {
      setState("granted-unsubscribed");
    }
  }, [capabilities.native, supported, getPwaRegistration]);

  useEffect(() => { void refresh(); }, [refresh]);

  const subscribe = useCallback(async () => {
    if (!supported || !user) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        await refresh();
        return;
      }

      // O SW é registrado exclusivamente pelo vite-plugin-pwa/usePwaUpdate.
      const reg = (await getPwaRegistration()) ?? await navigator.serviceWorker.ready;

      let sub = await reg.pushManager.getSubscription();
      let createdNow = false;
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        createdNow = true;
      }

      const data = sub.toJSON() as any;
      const p256dh = data.keys?.p256dh;
      const auth = data.keys?.auth;
      if (!p256dh || !auth) throw new Error("push_keys_missing");

      const { error } = await supabase.from("push_subscriptions").upsert({
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh,
        auth,
        user_agent: navigator.userAgent.slice(0, 200),
      }, { onConflict: "endpoint" });

      if (error) {
        if (createdNow) await sub.unsubscribe().catch(() => false);
        throw error;
      }

      await refresh();
    } catch (error) {
      console.error("[push] subscribe failed", error);
      toast.error("Não foi possível ativar as notificações");
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [supported, user, refresh, getPwaRegistration]);

  const unsubscribe = useCallback(async () => {
    if (!supported || !user) return;
    setBusy(true);
    try {
      const reg = await getPwaRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const { error } = await supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", user.id)
          .eq("endpoint", sub.endpoint);
        if (error) throw error;
        await sub.unsubscribe();
      }
      await refresh();
    } catch (error) {
      console.error("[push] unsubscribe failed", error);
      toast.error("Não foi possível desativar as notificações");
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [supported, user, refresh, getPwaRegistration]);

  return {
    state,
    busy,
    supported,
    native: capabilities.native,
    platform: capabilities.platform,
    subscribe,
    unsubscribe,
  };
}
