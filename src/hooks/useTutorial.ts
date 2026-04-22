import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

const LS_KEY = "tutorial_dismissed_session";
const OPEN_EVENT = "tutorial:open";

type TutorialState = {
  open: boolean;
  /** Slide inicial quando o tutorial abrir (vem do banco). */
  startAt: number;
  /** Já completou alguma vez? Usado pra distinguir "primeiro login" vs "reabrindo". */
  completed: boolean;
};

/**
 * Controla a exibição do tutorial cinemático de boas-vindas.
 * - Abre automaticamente no primeiro login (profiles.tutorial_completed_at == null).
 * - Pode ser reaberto manualmente via openTutorial() de qualquer página
 *   (dispara um CustomEvent que o AppShell escuta).
 * - **Persiste a última tela vista** em `profiles.tutorial_last_step`.
 *   Quando reaberto pelo usuário, retoma daquele ponto.
 * - "Pular" salva o ponto onde parou (não reseta).
 */
export function useTutorial() {
  const { user } = useAuth();
  const [state, setState] = useState<TutorialState>({
    open: false,
    startAt: 0,
    completed: false,
  });

  // cache local para o save de step não disparar refetch
  const profileCacheRef = useRef<{ last_step: number; completed_at: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("tutorial_completed_at, tutorial_last_step")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const completed_at = (data as { tutorial_completed_at: string | null } | null)?.tutorial_completed_at ?? null;
      const last_step = (data as { tutorial_last_step: number | null } | null)?.tutorial_last_step ?? 0;
      profileCacheRef.current = { last_step, completed_at };

      const dismissedSession = sessionStorage.getItem(LS_KEY) === "1";
      if (!completed_at && !dismissedSession) {
        // Primeiro login (ou usuário nunca finalizou): abre no ponto onde parou.
        setTimeout(() => {
          if (cancelled) return;
          setState({ open: true, startAt: last_step || 0, completed: false });
        }, 600);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Escuta pedidos de "reabrir" vindos de outras páginas
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ resume?: boolean; startAt?: number }>).detail || {};
      const cache = profileCacheRef.current;
      // Quando o usuário pede pra reabrir e existe progresso salvo, retoma desse step.
      // Quando não existe progresso (ou usuário pediu reset), começa do 0.
      let startAt = 0;
      if (detail.resume && cache && (cache.last_step ?? 0) > 0) {
        startAt = cache.last_step ?? 0;
      } else if (typeof detail.startAt === "number") {
        startAt = detail.startAt;
      }
      setState({ open: true, startAt, completed: !!cache?.completed_at });
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  /** Salva o step atual no banco — chamado a cada avanço do tutorial. */
  const saveStep = useCallback(
    async (step: number) => {
      if (!user) return;
      // Atualiza cache local (otimista)
      if (profileCacheRef.current) {
        profileCacheRef.current.last_step = step;
      } else {
        profileCacheRef.current = { last_step: step, completed_at: null };
      }
      await supabase
        .from("profiles")
        .update({ tutorial_last_step: step })
        .eq("id", user.id);
    },
    [user],
  );

  /** Conclusão completa: marca completed_at e zera o step. */
  const finishTutorial = useCallback(async () => {
    setState((s) => ({ ...s, open: false }));
    sessionStorage.setItem(LS_KEY, "1");
    if (!user) return;
    const nowIso = new Date().toISOString();
    if (profileCacheRef.current) {
      profileCacheRef.current.completed_at = nowIso;
      profileCacheRef.current.last_step = 0;
    }
    await supabase
      .from("profiles")
      .update({ tutorial_completed_at: nowIso, tutorial_last_step: 0 })
      .eq("id", user.id);
  }, [user]);

  /** Pular: fecha SEM marcar como completo, mas salva o ponto onde parou. */
  const skipTutorial = useCallback(
    async (currentStep: number) => {
      setState((s) => ({ ...s, open: false }));
      sessionStorage.setItem(LS_KEY, "1");
      if (!user) return;
      if (profileCacheRef.current) {
        profileCacheRef.current.last_step = currentStep;
      }
      await supabase
        .from("profiles")
        .update({ tutorial_last_step: currentStep })
        .eq("id", user.id);
    },
    [user],
  );

  const closeTutorial = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  return {
    open: state.open,
    startAt: state.startAt,
    completed: state.completed,
    closeTutorial,
    finishTutorial,
    skipTutorial,
    saveStep,
  };
}

/**
 * Dispara abertura do tutorial de qualquer lugar do app.
 * @param opts.resume — Se true, retoma do último step salvo no banco.
 */
export function openTutorial(opts: { resume?: boolean; startAt?: number } = {}) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: opts }));
}
