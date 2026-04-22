import { ReactNode, useEffect, useRef, useState } from "react";
import { useInView } from "@/hooks/useInView";
import { ShelfSkeleton } from "@/components/ui/skeletons";

interface Props {
  children: ReactNode;
  /** Margem extra antes de montar (default: 400px). */
  rootMargin?: string;
}

/**
 * Wrapper que adia a montagem do conteúdo até a prateleira entrar
 * (ou estar próxima de entrar) na viewport. Reduz queries paralelas
 * no carregamento inicial da Library/Discover.
 *
 * Comportamento:
 *  - Antes de inView: renderiza um placeholder magro (8px) — não cria "buraco".
 *  - Após inView: monta o filho. Se o filho não renderizar nada (return null),
 *    o wrapper colapsa naturalmente para 0px (sem min-height fixo).
 *  - Quando o filho está montando/buscando dados, ele mesmo mostra seu skeleton.
 */
export function LazyShelf({ children, rootMargin = "400px 0px" }: Props) {
  const { ref, inView } = useInView<HTMLDivElement>({ rootMargin });
  const innerRef = useRef<HTMLDivElement>(null);
  const [hasContent, setHasContent] = useState(false);

  // Observa se o filho efetivamente renderizou algo após montar.
  useEffect(() => {
    if (!inView) return;
    const el = innerRef.current;
    if (!el) return;
    const check = () => setHasContent(el.offsetHeight > 4);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [inView]);

  return (
    <div ref={ref} className={inView ? "" : "h-2"}>
      {inView && (
        <div ref={innerRef}>
          {children}
        </div>
      )}
    </div>
  );
}
