import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// VAPID public key gerada no setup (segura para client).
const VAPID_PUBLIC_KEY =
  "BF2xbHxZQ1MNV0sZZ5QZ8sWHfugbLhwEsXvTl7iO1Fp-u6dqcxELBN9JNHzSq6rYhxi0GTQS0tcifmMTYPICcPk";

const SW_URL = "/push-sw.js";

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

export type PushState = "unsupported" | "denied" | "default" | "granted-subscribed" | "granted-unsubscribed" | "loading";

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
      const reg = await navigator.serviceWorker.getRegistration(SW_URL);
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "granted-subscribed" : "granted-unsubscribed");
    } catch {
      setState("granted-unsubscribed");
    }
  }, [supported]);

  useEffect(() => { refresh(); }, [refresh]);

  const subscribe = useCallback(async () => {
    if (!supported || !user) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { await refresh(); return; }

      const reg = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
      await navigator.serviceWorker.ready;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      const json = sub.toJSON() as any;
      await supabase.from("push_subscriptions").upsert({
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent.slice(0, 200),
      }, { onConflict: "endpoint" });

      await refresh();
    } finally {
      setBusy(false);
    }
  }, [supported, user, refresh]);

  const unsubscribe = useCallback(async () => {
    if (!supported || !user) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_URL);
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [supported, user, refresh]);

  return { state, busy, supported, subscribe, unsubscribe };
}
