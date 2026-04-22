import { useEffect, useRef, useState } from "react";

/**
 * Observa um elemento e devolve `true` quando ele entra (ou JÁ entrou) na viewport.
 * Uma vez que vira `true`, permanece `true` (lazy mount, não desmonta).
 *
 * Usado para montar prateleiras inteiras só quando o usuário rola até elas —
 * economia massiva em queries paralelas no carregamento inicial da Library.
 */
export function useInView<T extends Element = HTMLDivElement>(
  options: IntersectionObserverInit = { rootMargin: "300px 0px" },
) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView || !ref.current) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        obs.disconnect();
      }
    }, options);
    obs.observe(ref.current);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView]);

  return { ref, inView } as const;
}
