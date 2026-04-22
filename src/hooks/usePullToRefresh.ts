import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";

interface Options {
  onRefresh: () => Promise<unknown> | unknown;
  /** Distância (px) para disparar o refresh. */
  threshold?: number;
  /** Distância máxima (px) que o indicador pode ser puxado. */
  maxPull?: number;
  /** Desabilita o gesto (ex: durante modais). */
  disabled?: boolean;
}

/**
 * Pull-to-refresh nativo mobile.
 * - Só ativa quando o scroll está no topo.
 * - Resistência elástica + haptic feedback ao atingir threshold e ao disparar.
 * - Retorna `pull` (px) e `refreshing` para o componente desenhar o indicador.
 */
export function usePullToRefresh<T extends HTMLElement = HTMLDivElement>({
  onRefresh,
  threshold = 70,
  maxPull = 120,
  disabled = false,
}: Options) {
  const ref = useRef<T | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const armed = useRef(false);
  const reachedThreshold = useRef(false);

  useEffect(() => {
    if (disabled) return;
    const el = ref.current ?? (typeof window !== "undefined" ? (document.scrollingElement as T | null) : null);
    if (!el) return;

    const isAtTop = () => {
      const sc = ref.current ?? document.scrollingElement;
      return (sc?.scrollTop ?? 0) <= 1;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing || !isAtTop()) return;
      startY.current = e.touches[0].clientY;
      armed.current = true;
      reachedThreshold.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!armed.current || startY.current == null || refreshing) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        setPull(0);
        return;
      }
      // resistência elástica
      const resisted = Math.min(maxPull, dy * 0.5);
      setPull(resisted);
      if (resisted > 8 && e.cancelable) e.preventDefault();
      if (!reachedThreshold.current && resisted >= threshold) {
        reachedThreshold.current = true;
        haptic("toggle");
      } else if (reachedThreshold.current && resisted < threshold) {
        reachedThreshold.current = false;
      }
    };

    const onTouchEnd = async () => {
      if (!armed.current) return;
      armed.current = false;
      const triggered = pull >= threshold;
      if (triggered && !refreshing) {
        setRefreshing(true);
        haptic("success");
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
          setPull(0);
        }
      } else {
        setPull(0);
      }
      startY.current = null;
    };

    const target = ref.current ?? window;
    target.addEventListener("touchstart", onTouchStart as EventListener, { passive: true });
    target.addEventListener("touchmove", onTouchMove as EventListener, { passive: false });
    target.addEventListener("touchend", onTouchEnd as EventListener, { passive: true });
    target.addEventListener("touchcancel", onTouchEnd as EventListener, { passive: true });

    return () => {
      target.removeEventListener("touchstart", onTouchStart as EventListener);
      target.removeEventListener("touchmove", onTouchMove as EventListener);
      target.removeEventListener("touchend", onTouchEnd as EventListener);
      target.removeEventListener("touchcancel", onTouchEnd as EventListener);
    };
  }, [onRefresh, threshold, maxPull, disabled, pull, refreshing]);

  return { ref, pull, refreshing, threshold };
}
