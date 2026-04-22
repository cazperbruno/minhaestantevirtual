import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface PresenceUser {
  user_id: string;
  display_name?: string;
  avatar_url?: string | null;
}

/**
 * Realtime presence para o chat do clube via Supabase Realtime.
 * Retorna a lista de usuários atualmente conectados ao canal.
 */
export function useClubChatPresence(
  clubId: string | undefined,
  user: { id: string; display_name?: string; avatar_url?: string | null } | null,
) {
  const [online, setOnline] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!clubId || !user?.id) {
      setOnline([]);
      return;
    }

    const channel = supabase.channel(`club-presence:${clubId}`, {
      config: { presence: { key: user.id } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceUser>();
        const flat = Object.values(state).flatMap((arr) => arr);
        // Dedup por user_id mantendo o mais recente
        const map = new Map<string, PresenceUser>();
        for (const p of flat) map.set(p.user_id, p);
        setOnline(Array.from(map.values()));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: user.id,
            display_name: user.display_name,
            avatar_url: user.avatar_url,
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clubId, user?.id, user?.display_name, user?.avatar_url]);

  return online;
}
