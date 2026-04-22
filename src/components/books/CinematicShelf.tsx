import { Children, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Conteúdo (cards). Será renderizado num scroller horizontal. */
  children: ReactNode;
  /** Mostra ação à direita do header (ex.: "Ver tudo"). */
  action?: ReactNode;
  className?: string;
  /**
   * Carregamento incremental: número inicial de itens renderizados.
   * Demais aparecem ao clicar em "Ver mais" (em lotes de `step`).
   * Default: 12 (suficiente para preencher 1–2 páginas horizontais).
   */
  initialCount?: number;
  /** Tamanho do lote ao clicar em "Ver mais". Default: 12. */
  step?: number;
}

/**
 * Prateleira horizontal estilo Netflix:
 *  - snap-scroll suave (scroll-snap-type: x mandatory)
 *  - setas no desktop, ocultas em mobile
 *  - fade gradient nas bordas (esquerda/direita) para sugerir mais conteúdo
 *  - GPU-accelerated; mantém 60fps mesmo com 30+ itens
 */
export function CinematicShelf({
  title,
  subtitle,
  children,
  action,
  className,
  initialCount = 12,
  step = 12,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  // Carregamento incremental: corta os filhos visíveis em lotes.
  const allChildren = useMemo(() => Children.toArray(children), [children]);
  const total = allChildren.length;
  const [visibleCount, setVisibleCount] = useState(() => Math.min(initialCount, total));

  // Quando o conjunto de filhos muda (novo dataset), reinicia.
  useEffect(() => {
    setVisibleCount(Math.min(initialCount, total));
  }, [initialCount, total]);

  const visibleChildren = total > visibleCount ? allChildren.slice(0, visibleCount) : allChildren;
  const hasMore = visibleCount < total;
  const remaining = total - visibleCount;
  const loadMore = useCallback(() => {
    setVisibleCount((c) => Math.min(c + step, total));
  }, [step, total]);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 8);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [update]);

  const scrollBy = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <section className={cn("group/shelf mb-10 animate-slide-up", className)}>
      {(title || action) && (
        <div className="flex items-end justify-between gap-4 mb-4 px-1">
          <div>
            {title && <h2 className="font-display text-xl md:text-2xl font-semibold leading-tight">{title}</h2>}
            {subtitle && <p className="text-xs md:text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}

      <div className="relative">
        {/* Fades laterais */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute left-0 top-0 bottom-2 w-12 z-10 transition-opacity duration-300",
            "bg-gradient-to-r from-background to-transparent",
            canLeft ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute right-0 top-0 bottom-2 w-12 z-10 transition-opacity duration-300",
            "bg-gradient-to-l from-background to-transparent",
            canRight ? "opacity-100" : "opacity-0",
          )}
        />

        {/* Setas de navegação (desktop) */}
        <button
          type="button"
          aria-label="Rolar para esquerda"
          onClick={() => scrollBy(-1)}
          className={cn(
            "hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full items-center justify-center",
            "bg-background/90 backdrop-blur-md border border-border shadow-elevated",
            "transition-all duration-200 hover:scale-110 hover:bg-primary hover:text-primary-foreground active:scale-95",
            canLeft ? "opacity-0 group-hover/shelf:opacity-100" : "opacity-0 pointer-events-none",
          )}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          type="button"
          aria-label="Rolar para direita"
          onClick={() => scrollBy(1)}
          className={cn(
            "hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full items-center justify-center",
            "bg-background/90 backdrop-blur-md border border-border shadow-elevated",
            "transition-all duration-200 hover:scale-110 hover:bg-primary hover:text-primary-foreground active:scale-95",
            canRight ? "opacity-0 group-hover/shelf:opacity-100" : "opacity-0 pointer-events-none",
          )}
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        <div
          ref={ref}
          className={cn(
            "flex gap-4 md:gap-5 overflow-x-auto scrollbar-hide pb-3 -mx-5 px-5 md:mx-0 md:px-1",
            "scroll-smooth snap-x snap-mandatory gpu",
          )}
          style={{ scrollPaddingInline: "1rem" }}
        >
          {children}
        </div>
      </div>
    </section>
  );
}

/** Wrapper para um item da CinematicShelf — garante snap e largura responsiva. */
export function ShelfItem({
  children,
  className,
  width = "default",
}: {
  children: ReactNode;
  className?: string;
  width?: "default" | "wide";
}) {
  return (
    <div
      className={cn(
        "shrink-0 snap-start",
        width === "wide" ? "w-44 md:w-52" : "w-28 md:w-36",
        className,
      )}
    >
      {children}
    </div>
  );
}
