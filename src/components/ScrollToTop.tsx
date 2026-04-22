import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Scrolla para o topo a cada mudança de rota (pathname).
 * Preserva navegação por âncora (#) e back/forward (POP) com scroll restoration nativo.
 */
const ScrollToTop = () => {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) return; // âncora: deixa o browser cuidar
    // Usa "auto" para evitar conflito com View Transitions (shared element)
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname, hash]);

  return null;
};

export default ScrollToTop;
