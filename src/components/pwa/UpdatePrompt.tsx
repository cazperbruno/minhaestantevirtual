import { usePwaUpdate } from "@/hooks/usePwaUpdate";
import { Button } from "@/components/ui/button";
import { RefreshCw, X } from "lucide-react";

/**
 * Toast persistente no canto inferior quando uma nova versão do app é detectada.
 * Mobile-first: ocupa largura segura, fica acima da BottomNav.
 */
export function UpdatePrompt() {
  const { needRefresh, applyUpdate, dismiss } = usePwaUpdate();

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-6 z-[60] w-[min(92vw,420px)]
                 rounded-2xl border border-border bg-background/95 backdrop-blur shadow-lg
                 p-4 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4"
    >
      <div className="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
        <RefreshCw className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground leading-tight">Nova versão disponível</p>
        <p className="text-xs text-muted-foreground">Atualize para ver as últimas melhorias.</p>
      </div>
      <Button size="sm" onClick={applyUpdate} className="shrink-0">
        Atualizar
      </Button>
      <button
        onClick={dismiss}
        aria-label="Dispensar"
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
