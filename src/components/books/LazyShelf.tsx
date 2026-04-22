import { ReactNode } from "react";
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
 */
export function LazyShelf({ children, rootMargin = "400px 0px" }: Props) {
  const { ref, inView } = useInView<HTMLDivElement>({ rootMargin });
  return (
    <div ref={ref} className="min-h-[280px]">
      {inView ? children : <ShelfSkeleton />}
    </div>
  );
}
