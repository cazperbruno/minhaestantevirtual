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
 * Importante: depois de montar, observa se o filho realmente renderizou
 * algo. Se ele retornar `null` (ex: usuário sem amigos seguindo), colapsa
 * o espaço reservado para evitar "buracos" visuais entre prateleiras.
 */
export function LazyShelf({ children, rootMargin = "400px 0px" }: Props) {
  const { ref, inView } = useInView<HTMLDivElement>({ rootMargin });
  const innerRef = useRef<HTMLDivElement>(null);
  const [hasContent, setHasContent] = useState(true);

  useEffect(() => {
    if (!inView) return;
    // Verifica em cada animation frame se o filho terminou de renderizar.
    // Damos algumas tentativas pra dar tempo de queries assíncronas resolverem.
    let tries = 0;
    let raf = 0;
    const check = () => {
      const node = innerRef.current;
      if (!node) return;
      const empty = node.childElementCount === 0 || node.offsetHeight < 8;
      setHasContent(!empty);
      tries++;
      if (tries < 40) raf = requestAnimationFrame(check);
    };
    raf = requestAnimationFrame(check);
    return () => cancelAnimationFrame(raf);
  }, [inView]);

  return (
    <div
      ref={ref}
      className={!inView ? "min-h-[280px]" : hasContent ? "" : "min-h-0"}
    >
      {inView ? <div ref={innerRef}>{children}</div> : <ShelfSkeleton />}
    </div>
  );
}
