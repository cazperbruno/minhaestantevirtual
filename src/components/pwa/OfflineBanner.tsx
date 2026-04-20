import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Banner discreto que aparece quando o navegador entra em modo offline.
 * Some automaticamente quando reconecta. Posicionado acima da BottomNav.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 top-3 z-[60] w-[min(92vw,420px)]
                 rounded-full border border-border bg-background/95 backdrop-blur shadow-lg
                 px-4 py-2 flex items-center gap-2 text-sm
                 animate-in fade-in slide-in-from-top-2"
    >
      <WifiOff className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-foreground/90 leading-tight">
        Você está offline. Algumas funções podem não funcionar.
      </span>
    </div>
  );
}
