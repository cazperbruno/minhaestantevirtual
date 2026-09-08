import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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

function isPreviewHost() {
  const h = typeof window !== "undefined" ? window.location.hostname : "";
  return h.includes("id-preview--") || h.includes("lovableproject.com");
}

export type PushState =
  | "unsupported"
  | "denied"
  | "default"
  | "granted-subscribed"
  | "granted-unsubscribed"
  | "loading";

export function usePushNotifications() {
  const { user } = useAuth();
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);

  const supported = typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window
    && !isPreviewHost();

  const getPwaRegistration = useCallback(async () => {
    if (!supported) return undefined;
    return navigator.serviceWorker.getRegistration("/");
  }, [supported]);

  const refresh = useCallback(async () => {
    if (!supported) return setState("unsupported");
    if (Notification.permission === "denied") return setState("denied");
    if (Notification.permission === "default") return setState("default");

    try {
      const reg = await getPwaRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "granted-subscribed" : "granted-unsubscribed");
    } catch {
      setState("granted-unsubscribed");
    }
  }, [supported, getPwaRegistration]);

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
      // Nunca registre um segundo worker no scope '/'.
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
        // Se criamos uma subscription que o servidor não conseguiu persistir,
        // removê-la evita estado local enganoso de "ativado".
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

  return { state, busy, supported, subscribe, unsubscribe };
}
