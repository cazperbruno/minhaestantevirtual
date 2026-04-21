import { useEffect, useState } from "react";
import { CheckCircle2, CloudOff, Loader2, WifiOff } from "lucide-react";
import { getOfflineQueueSize, replayOfflineQueue } from "@/lib/offline-queue";

/**
 * Smart banner: handles offline/online + offline queue sync status.
 *
 * States:
 *   - offline: shows red WifiOff banner
 *   - online + queue > 0: shows syncing indicator
 *   - online + just-synced: shows quick success (3s)
 *   - online + queue empty: hidden
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [queueSize, setQueueSize] = useState(getOfflineQueueSize());
  const [syncing, setSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);

  useEffect(() => {
    const refresh = () => setQueueSize(getOfflineQueueSize());
    const goOnline = async () => {
      setOnline(true);
      const initial = getOfflineQueueSize();
      if (initial > 0) {
        setSyncing(true);
        const res = await replayOfflineQueue();
        setSyncing(false);
        refresh();
        if (res.ok > 0) {
          setJustSynced(true);
          setTimeout(() => setJustSynced(false), 3000);
        }
      }
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    // Poll queue size lightly (when actions are queued from other code paths)
    const id = setInterval(refresh, 2500);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(id);
    };
  }, []);

  if (!online) {
    return (
      <Banner role="status" tone="offline">
        <WifiOff className="h-4 w-4 shrink-0" />
        <span className="leading-tight">
          Você está offline.
          {queueSize > 0 && <strong className="ml-1">{queueSize} {queueSize === 1 ? "ação aguardando" : "ações aguardando"}</strong>}
        </span>
      </Banner>
    );
  }

  if (syncing) {
    return (
      <Banner role="status" tone="syncing">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        <span className="leading-tight">Sincronizando suas alterações…</span>
      </Banner>
    );
  }

  if (justSynced) {
    return (
      <Banner role="status" tone="success">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span className="leading-tight">Tudo sincronizado!</span>
      </Banner>
    );
  }

  return null;
}

function Banner({ children, tone, role }: { children: React.ReactNode; tone: "offline" | "syncing" | "success"; role?: string }) {
  const bg =
    tone === "offline" ? "bg-destructive/10 text-destructive border-destructive/40"
    : tone === "syncing" ? "bg-primary/10 text-primary border-primary/40"
    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/40";
  return (
    <div
      role={role}
      aria-live="polite"
      className={`fixed left-1/2 -translate-x-1/2 top-3 z-[60] w-[min(92vw,420px)]
                  rounded-full border ${bg} backdrop-blur shadow-lg
                  px-4 py-2 flex items-center gap-2 text-sm
                  animate-in fade-in slide-in-from-top-2`}
    >
      {children}
    </div>
  );
}

// Re-export for callers that want the icon
export { CloudOff };
