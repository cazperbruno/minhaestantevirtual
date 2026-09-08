import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Chave VAPID pública — pode ser entregue ao cliente.
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

  const refresh = useCallback(async () => {
    if (!supported) return setState("unsupported");
    if (Notification.permission === "denied") return setState("denied");
    if (Notification.permission === "default") return setState("default");

    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "granted-subscribed" : "granted-unsubscribed");
    } catch {
      setState("granted-unsubscribed");
    }
  }, [supported]);

  useEffect(() => { void refresh(); }, [refresh]);

  const subscribe = useCallback(async () => {
    if (!supported || !user) return;
    setBusy(true);
    let createdSubscription: PushSubscription | null = null;

    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        await refresh();
        return;
      }

      // O vite-plugin-pwa é o único responsável por registrar o SW do scope '/'.
      // `ready` devolve essa registration; não criamos um segundo worker.
      const reg = await navigator.serviceWorker.ready;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        createdSubscription = sub;
      }

      const json = sub.toJSON() as {
        keys?: { p256dh?: string; auth?: string };
      };
      if (!json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("invalid_push_subscription");
      }

      const { error } = await supabase.from("push_subscriptions").upsert({
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent.slice(0, 200),
      }, { onConflict: "endpoint" });

      if (error) {
        // Não deixa uma subscription ativa que o servidor não conseguiu associar.
        if (createdSubscription) await createdSubscription.unsubscribe().catch(() => false);
        throw error;
      }

      await refresh();
    } catch (error) {
      console.error("push subscribe failed", error);
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [supported, user, refresh]);

  const unsubscribe = useCallback(async () => {
    if (!supported || !user) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const { error } = await supabase
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", sub.endpoint)
          .eq("user_id", user.id);
        if (error) throw error;

        const ok = await sub.unsubscribe();
        if (!ok) throw new Error("push_unsubscribe_failed");
      }
      await refresh();
    } catch (error) {
      console.error("push unsubscribe failed", error);
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [supported, user, refresh]);

  return { state, busy, supported, subscribe, unsubscribe };
}
