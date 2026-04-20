import { useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";

/**
 * Hook que registra o Service Worker (em produção) e expõe estado de
 * "nova versão disponível". Estratégia:
 *  - autoUpdate: o SW gerado já chama skipWaiting/clientsClaim
 *  - polling a cada 60s para detectar nova versão sem reload
 *  - se houver nova versão → setNeedRefresh(true) → UI mostra prompt
 *  - applyUpdate() ativa o novo SW e dá reload automático
 *
 * Em iframes/preview do Lovable o registro é pulado em main.tsx (já desregistra SWs).
 */
export function usePwaUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateSW, setUpdateSW] = useState<((reload?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    // Não registrar em iframe/preview (mesma checagem do main.tsx)
    const inIframe = (() => {
      try { return window.self !== window.top; } catch { return true; }
    })();
    const host = window.location.hostname;
    const isPreview =
      host.includes("id-preview--") ||
      host.includes("lovableproject.com") ||
      host === "localhost" ||
      host === "127.0.0.1";
    if (inIframe || isPreview) return;

    const update = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedRefresh(true);
      },
      onRegisteredSW(_swUrl, registration) {
        // Polling: a cada 60s pergunta ao SW se há nova versão
        if (registration) {
          setInterval(() => {
            registration.update().catch(() => { /* offline ok */ });
          }, 60 * 1000);
        }
      },
      onRegisterError(err) {
        console.warn("[PWA] SW registration error", err);
      },
    });

    setUpdateSW(() => update);
  }, []);

  const applyUpdate = async () => {
    if (!updateSW) {
      window.location.reload();
      return;
    }
    await updateSW(true); // true = reload automático após ativar novo SW
  };

  const dismiss = () => setNeedRefresh(false);

  return { needRefresh, applyUpdate, dismiss };
}
