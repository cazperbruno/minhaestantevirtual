import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

const LS_KEY = "tutorial_dismissed_session";
const OPEN_EVENT = "tutorial:open";

/**
 * Controla a exibição do tutorial cinemático de boas-vindas.
 * - Abre automaticamente no primeiro login (profiles.tutorial_completed_at == null).
 * - Pode ser reaberto manualmente via openTutorial() de qualquer página
 *   (dispara um CustomEvent que o AppShell escuta).
 * - Marca conclusão no banco para não repetir.
 */
export function useTutorial() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
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
        setTimeout(() => !cancelled && setOpen(true), 600);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Escuta pedidos de "reabrir" vindos de outras páginas
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  const finishTutorial = useCallback(async () => {
    setOpen(false);
    sessionStorage.setItem(LS_KEY, "1");
    if (!user) return;
    await supabase
      .from("profiles")
      .update({ tutorial_completed_at: new Date().toISOString() })
      .eq("id", user.id);
  }, [user]);

  const closeTutorial = useCallback(() => setOpen(false), []);

  return { open, openTutorial, closeTutorial, finishTutorial };
}

/** Dispara abertura do tutorial de qualquer lugar do app. */
export function openTutorial() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}
