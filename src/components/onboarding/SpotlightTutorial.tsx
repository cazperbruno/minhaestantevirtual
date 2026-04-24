import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, X, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

export type SpotlightStep = {
  /** Seletor CSS pra destacar (opcional — sem alvo vira card centralizado). */
  target?: string;
  title: string;
  body: string;
  /** Posicionamento preferido em relação ao alvo. */
  placement?: "top" | "bottom" | "auto";
};

interface Props {
  open: boolean;
  steps: SpotlightStep[];
  onClose: () => void;
}

const PADDING = 8;
const CARD_W = 320;

export function SpotlightTutorial({ open, steps, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Reset quando abre
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  const step = steps[index];
  const isLast = index === steps.length - 1;

  // Mede o alvo + observa resize/scroll
  useLayoutEffect(() => {
    if (!open || !step?.target) {
      setRect(null);
      return;
    }
    const measure = () => {
      const el = document.querySelector(step.target!);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        // mede após o scroll resolver
        requestAnimationFrame(() => {
          const r = (document.querySelector(step.target!) as HTMLElement | null)?.getBoundingClientRect() || null;
          setRect(r);
        });
      } else {
        setRect(null);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, step?.target, index]);

  // Trava scroll do body
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc fecha
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  if (!open || !step) return null;

  function next() {
    haptic("tap");
    if (isLast) handleClose();
    else setIndex((i) => Math.min(steps.length - 1, i + 1));
  }
  function prev() {
    haptic("tap");
    setIndex((i) => Math.max(0, i - 1));
  }
  function handleClose() {
    haptic("toggle");
    onClose();
  }

  // Posição do card
  const vw = typeof window !== "undefined" ? window.innerWidth : 360;
  const vh = typeof window !== "undefined" ? window.innerHeight : 640;
  let cardStyle: React.CSSProperties = {
    left: vw / 2 - CARD_W / 2,
    top: vh / 2 - 100,
    width: CARD_W,
  };
  if (rect) {
    const wantsBottom = step.placement === "bottom" || (step.placement !== "top" && rect.top < vh / 2);
    const left = Math.max(12, Math.min(vw - CARD_W - 12, rect.left + rect.width / 2 - CARD_W / 2));
    const top = wantsBottom ? rect.bottom + PADDING + 12 : Math.max(12, rect.top - PADDING - 180);
    cardStyle = { left, top, width: CARD_W };
  }

  // Hole spotlight
  const holePath = rect
    ? `M0 0 H${vw} V${vh} H0 Z M${rect.left - PADDING} ${rect.top - PADDING} H${rect.right + PADDING} V${rect.bottom + PADDING} H${rect.left - PADDING} Z`
    : `M0 0 H${vw} V${vh} H0 Z`;

  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[120]">
      {/* Overlay com furo */}
      <svg width="100%" height="100%" className="absolute inset-0 pointer-events-auto" onClick={handleClose}>
        <defs>
          <filter id="spot-blur">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>
        <path d={holePath} fillRule="evenodd" fill="hsl(var(--background) / 0.85)" />
        {rect && (
          <rect
            x={rect.left - PADDING}
            y={rect.top - PADDING}
            width={rect.width + PADDING * 2}
            height={rect.height + PADDING * 2}
            rx={12}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            className="animate-pulse"
            style={{ pointerEvents: "none" }}
          />
        )}
      </svg>

      {/* Card */}
      <div
        ref={cardRef}
        className="absolute glass rounded-2xl border border-primary/30 shadow-2xl p-5 animate-fade-in"
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-primary font-bold">
              Dica {index + 1}/{steps.length}
            </span>
          </div>
          <button onClick={handleClose} aria-label="Fechar tutorial" className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <h3 className="font-display text-lg font-semibold leading-tight mb-1.5">{step.title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/40">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === index ? "w-6 bg-primary" : "w-1.5 bg-foreground/20",
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {index > 0 && (
              <Button size="sm" variant="ghost" onClick={prev}>
                Voltar
              </Button>
            )}
            <Button size="sm" variant="hero" onClick={next} className="gap-1.5">
              {isLast ? (
                <>
                  Entendi <ArrowRight className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  Próxima <ChevronRight className="w-3.5 h-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
