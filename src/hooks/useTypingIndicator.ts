import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface TypingUser {
  user_id: string;
  display_name: string;
  at: number;
}

/**
 * Indicador "X está digitando..." via Supabase Realtime broadcast.
 * Não persiste — apenas presença efêmera via channel.
 *
 * Uso:
 *   const { typingUsers, sendTyping } = useTypingIndicator(`club:${id}`);
 *   onChange={(e) => { setInput(e.target.value); sendTyping(); }}
 */
export function useTypingIndicator(channelKey: string, displayName?: string) {
  const { user } = useAuth();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingMapRef = useRef<Map<string, TypingUser>>(new Map());
  const lastSentRef = useRef(0);
  const listenersRef = useRef<Set<() => void>>(new Set());

  useEffect(() => {
    if (!user || !channelKey) return;

    const ch = supabase.channel(`typing:${channelKey}`, {
      config: { broadcast: { self: false } },
    });

    ch.on("broadcast", { event: "typing" }, (payload) => {
      const data = payload.payload as TypingUser;
      if (!data?.user_id || data.user_id === user.id) return;
      typingMapRef.current.set(data.user_id, { ...data, at: Date.now() });
      listenersRef.current.forEach((l) => l());
    });

    ch.subscribe();
    channelRef.current = ch;

    // Limpa entries velhas (>3.5s sem novo pulse)
    const interval = setInterval(() => {
      const now = Date.now();
      let changed = false;
      typingMapRef.current.forEach((v, k) => {
        if (now - v.at > 3500) {
          typingMapRef.current.delete(k);
          changed = true;
        }
      });
      if (changed) listenersRef.current.forEach((l) => l());
    }, 1200);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [user, channelKey]);

  const sendTyping = () => {
    if (!user || !channelRef.current) return;
    const now = Date.now();
    // throttle: 1 broadcast a cada 1.2s
    if (now - lastSentRef.current < 1200) return;
    lastSentRef.current = now;
    channelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: {
        user_id: user.id,
        display_name: displayName || "Alguém",
        at: now,
      } satisfies TypingUser,
    });
  };

  // Subscribe pra forçar re-render do componente que usa
  const subscribe = (cb: () => void) => {
    listenersRef.current.add(cb);
    return () => listenersRef.current.delete(cb);
  };

  return {
    typingUsers: Array.from(typingMapRef.current.values()),
    sendTyping,
    subscribe,
  };
}
