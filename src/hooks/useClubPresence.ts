import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Heartbeat de presença para um clube.
 * Marca `last_seen_at` ao montar e a cada 2 minutos enquanto a aba estiver ativa.
 */
export function useClubPresence(clubId: string | undefined, isMember: boolean) {
  useEffect(() => {
    if (!clubId || !isMember) return;

    const ping = () => {
      // Fire-and-forget; ignora erros (RLS / offline).
      supabase.rpc("touch_club_presence", { _club_id: clubId }).then(() => undefined);
    };

    ping();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") ping();
    }, 120_000);

    const onVis = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [clubId, isMember]);
}
