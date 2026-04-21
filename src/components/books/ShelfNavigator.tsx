import { useEffect, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ShelfNavState } from "@/hooks/useShelfNavigation";

interface Props {
  shelfTitle?: string;
  index: number;
  total: number;
  prevId?: string;
  nextId?: string;
  /** Conteúdo do detalhe (BookHero + resto). Recebe handlers para swipe mobile. */
  children: ReactNode;
}

/**
 * Wrapper do BookDetail que dá:
 *  - setas flutuantes (desktop) com dica do título da prateleira
 *  - indicador "X de Y" + nome da prateleira
 *  - navegação por teclado ← →
 *  - swipe horizontal (mobile) — só dispara em gesto claramente horizontal e amplo,
 *    para não conflitar com scroll vertical da página.
 */
export function ShelfNavigator({ shelfTitle, index, total, prevId, nextId, children }: Props) {
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);

  // Lê o shelfId atual do history.state — sobrevive ao remount entre transições.
  const shelfIdFromHistory = (): string | undefined => {
    try {
      return (window.history.state?.usr?.shelfId as string | undefined) ?? undefined;
    } catch {
      return undefined;
    }
  };

  const goTo = (id?: string) => {
    if (!id) return;
    const shelfId = shelfIdFromHistory();
    const state: ShelfNavState = { shelfId, shelfTitle };
    navigate(`/livro/${id}`, { state });
  };

  // Atalhos de teclado (desktop)
  useEffect(() => {
    if (total <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "ArrowLeft" && prevId) {
        e.preventDefault();
        goTo(prevId);
      } else if (e.key === "ArrowRight" && nextId) {
        e.preventDefault();
        goTo(nextId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevId, nextId, total]);

  // Swipe horizontal (mobile)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || total <= 1) return;

    let startX = 0;
    let startY = 0;
    let startT = 0;
    let active = false;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      active = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startT = Date.now();
    };
    const onEnd = (e: TouchEvent) => {
      if (!active) return;
      active = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const dt = Date.now() - startT;
      // Critérios: gesto rápido (<700ms), horizontal claro, amplo (>70px)
      if (dt > 700) return;
      if (Math.abs(dx) < 70) return;
      if (Math.abs(dy) > Math.abs(dx) * 0.6) return;
      if (dx < 0 && nextId) goTo(nextId);
      else if (dx > 0 && prevId) goTo(prevId);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevId, nextId, total]);

  if (total <= 1) {
    return <>{children}</>;
  }

  return (
    <div ref={wrapRef} className="relative animate-fade-in">
      {/* Pílula de contexto (topo) */}
      {shelfTitle && (
        <div className="sticky top-2 z-30 flex justify-center pointer-events-none px-4">
          <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-background/85 backdrop-blur-md border border-border/60 px-3 py-1.5 text-xs shadow-elevated animate-slide-down">
            <span className="text-muted-foreground">De</span>
            <span className="font-semibold text-foreground truncate max-w-[55vw]">{shelfTitle}</span>
            <span className="text-muted-foreground tabular-nums">· {index + 1}/{total}</span>
          </div>
        </div>
      )}

      {/* Setas flutuantes — só desktop */}
      <button
        type="button"
        aria-label="Livro anterior"
        onClick={() => goTo(prevId)}
        disabled={!prevId}
        className={cn(
          "hidden md:flex fixed left-4 top-1/2 -translate-y-1/2 z-40 w-12 h-12 rounded-full items-center justify-center",
          "bg-background/90 backdrop-blur-md border border-border shadow-elevated",
          "transition-all duration-200 hover:scale-110 hover:bg-primary hover:text-primary-foreground active:scale-95",
          !prevId && "opacity-30 cursor-not-allowed hover:scale-100 hover:bg-background/90 hover:text-foreground",
        )}
      >
        <ChevronLeft className="w-6 h-6" />
      </button>
      <button
        type="button"
        aria-label="Próximo livro"
        onClick={() => goTo(nextId)}
        disabled={!nextId}
        className={cn(
          "hidden md:flex fixed right-4 top-1/2 -translate-y-1/2 z-40 w-12 h-12 rounded-full items-center justify-center",
          "bg-background/90 backdrop-blur-md border border-border shadow-elevated",
          "transition-all duration-200 hover:scale-110 hover:bg-primary hover:text-primary-foreground active:scale-95",
          !nextId && "opacity-30 cursor-not-allowed hover:scale-100 hover:bg-background/90 hover:text-foreground",
        )}
      >
        <ChevronRight className="w-6 h-6" />
      </button>

      {children}
    </div>
  );
}
