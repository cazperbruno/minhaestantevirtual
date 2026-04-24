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

  // Lê estado de navegação do history.state — sobrevive ao remount entre transições.
  const stateFromHistory = (): { shelfId?: string; bookIds?: string[] } => {
    try {
      const usr = window.history.state?.usr || {};
      return {
        shelfId: usr.shelfId as string | undefined,
        bookIds: usr.bookIds as string[] | undefined,
      };
    } catch {
      return {};
    }
  };

  const goTo = (id?: string) => {
    if (!id) return;
    const { shelfId, bookIds } = stateFromHistory();
    const state: ShelfNavState = { shelfId, shelfTitle, bookIds };
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

  // Swipe horizontal (mobile) — critérios calibrados para dedos reais.
  // Threshold de 60px (15% de tela 411px), até 800ms de duração, e bloqueio
  // somente em controles que realmente conflitam (input/select/scroll-x).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || total <= 1) return;

    let startX = 0;
    let startY = 0;
    let startT = 0;
    let active = false;
    let blocked = false;

    /**
     * Bloqueia o swipe SÓ quando o toque inicia em controles que claramente
     * conflitam: input/textarea/select, scroll horizontal real, ou opt-out
     * explícito via data-no-shelf-swipe. Botões e links normais NÃO bloqueiam
     * — eles só não disparam o swipe se o gesto for muito curto (tap).
     */
    const isBlockedTarget = (target: EventTarget | null): boolean => {
      let node = target as HTMLElement | null;
      while (node && node !== el) {
        const tag = node.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
        if (node.dataset?.noShelfSwipe !== undefined) return true;
        if (node.getAttribute?.("role") === "slider") return true;
        // overflow-x scrollable e com conteúdo maior que o container
        const style = window.getComputedStyle(node);
        const ox = style.overflowX;
        if ((ox === "auto" || ox === "scroll") && node.scrollWidth > node.clientWidth + 4) {
          return true;
        }
        node = node.parentElement;
      }
      return false;
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      blocked = isBlockedTarget(e.target);
      active = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startT = Date.now();
    };
    const onEnd = (e: TouchEvent) => {
      if (!active) return;
      active = false;
      if (blocked) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const dt = Date.now() - startT;
      // Critérios calibrados: gesto até 800ms, distância >60px (15% de 411),
      // razão dy/dx <0.6 (gesto majoritariamente horizontal).
      if (dt > 800) return;
      if (Math.abs(dx) < 60) return;
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
          <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-background/85 backdrop-blur-md border border-border/60 px-3 py-1.5 text-xs shadow-elevated animate-fade-in">
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
