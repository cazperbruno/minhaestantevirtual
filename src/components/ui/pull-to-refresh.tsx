import { ReactNode } from "react";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { Loader2, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onRefresh: () => Promise<unknown> | unknown;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}

/**
 * Wrapper que adiciona pull-to-refresh nativo mobile.
 * - Indicador visual com seta que rotaciona ao atingir o threshold.
 * - Apenas em telas touch; desktop ignora.
 */
export function PullToRefresh({ onRefresh, children, disabled, className }: Props) {
  const { pull, refreshing, threshold } = usePullToRefresh({ onRefresh, disabled });
  const progress = Math.min(1, pull / threshold);
  const reached = pull >= threshold;

  return (
    <div className={cn("relative", className)}>
      {/* Indicador (sai do topo) */}
      <div
        aria-hidden
        className="pointer-events-none fixed left-0 right-0 top-0 z-40 flex justify-center"
        style={{
          transform: `translateY(${Math.max(0, pull - 32)}px)`,
          opacity: pull > 4 || refreshing ? 1 : 0,
          transition: refreshing || pull === 0 ? "transform 220ms ease, opacity 200ms ease" : "none",
        }}
      >
        <div
          className={cn(
            "mt-3 flex h-9 w-9 items-center justify-center rounded-full border shadow-lg backdrop-blur",
            "bg-card/90 border-border/50",
            reached || refreshing ? "text-primary" : "text-muted-foreground",
          )}
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowDown
              className="h-4 w-4 transition-transform"
              style={{ transform: `rotate(${reached ? 180 : progress * 180}deg)` }}
            />
          )}
        </div>
      </div>

      {/* Conteúdo deslocado durante o gesto */}
      <div
        style={{
          transform: refreshing ? "translateY(40px)" : `translateY(${pull}px)`,
          transition: refreshing || pull === 0 ? "transform 220ms ease" : "none",
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}
