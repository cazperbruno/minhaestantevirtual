import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Política unificada de scroll para todas as rotas:
 *
 *  1. PUSH / REPLACE → topo (0,0). Sempre. Inclui navegações disparadas via
 *     `viewTransition()` (ver `src/lib/view-transitions.ts`), porque o reset
 *     acontece dentro do callback de atualização da View Transition — o
 *     navegador "fotografa" a página antiga e revela a nova já no topo.
 *
 *  2. POP (back/forward) → restaura a posição que o usuário tinha naquela
 *     entrada do histórico (gerenciado por nós, não pelo browser).
 *
 *  3. Hash (#âncora) → não interfere; o browser cuida.
 *
 *  Desativa `history.scrollRestoration` nativo para evitar conflitos em
 *  Safari/Chrome quando combinado com View Transitions.
 */

type Pos = { x: number; y: number };

const positions = new Map<string, Pos>();

function key(loc: { pathname: string; search: string }) {
  return loc.pathname + loc.search;
}

const ScrollToTop = () => {
  const location = useLocation();
  const navType = useNavigationType(); // "PUSH" | "REPLACE" | "POP"
  const prevKeyRef = useRef<string | null>(null);

  // Desliga restauração nativa uma única vez — nós controlamos.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("scrollRestoration" in window.history) {
      try { window.history.scrollRestoration = "manual"; } catch { /* noop */ }
    }
  }, []);

  // Antes de cada mudança, salva a posição da rota anterior (para POP).
  useEffect(() => {
    return () => {
      if (prevKeyRef.current) {
        positions.set(prevKeyRef.current, { x: window.scrollX, y: window.scrollY });
      }
    };
  }, [location]);

  // Aplica a política de scroll de forma síncrona ANTES da pintura,
  // evitando "flash" no meio de uma View Transition.
  useLayoutEffect(() => {
    const k = key(location);

    // hash → deixa o browser navegar até a âncora
    if (location.hash) {
      prevKeyRef.current = k;
      return;
    }

    if (navType === "POP") {
      const saved = positions.get(k);
      window.scrollTo(saved?.x ?? 0, saved?.y ?? 0);
    } else {
      // PUSH / REPLACE → topo, instantâneo (compatível com View Transitions)
      window.scrollTo(0, 0);
    }

    prevKeyRef.current = k;
  }, [location, navType]);

  return null;
};

export default ScrollToTop;
