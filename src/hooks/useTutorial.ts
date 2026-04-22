import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

const LS_KEY = "tutorial_dismissed_session";

/**
 * Controla a exibição do tutorial cinemático de boas-vindas.
 * - Abre automaticamente no primeiro login (profiles.tutorial_completed_at == null).
 * - Pode ser reaberto manualmente via openTutorial().
 * - Marca conclusão no banco para não repetir.
 */
export function useTutorial() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loadingFlag, setLoadingFlag] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoadingFlag(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("tutorial_completed_at")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const dismissed = sessionStorage.getItem(LS_KEY) === "1";
      if (!data?.tutorial_completed_at && !dismissed) {
        // Pequeno delay pra não brigar com a animação inicial da página
        setTimeout(() => !cancelled && setOpen(true), 600);
      }
      setLoadingFlag(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const finishTutorial = useCallback(async () => {
    setOpen(false);
    sessionStorage.setItem(LS_KEY, "1");
    if (!user) return;
    await supabase
      .from("profiles")
      .update({ tutorial_completed_at: new Date().toISOString() })
      .eq("id", user.id);
  }, [user]);

  const openTutorial = useCallback(() => setOpen(true), []);
  const closeTutorial = useCallback(() => setOpen(false), []);

  return { open, openTutorial, closeTutorial, finishTutorial, loadingFlag };
}
