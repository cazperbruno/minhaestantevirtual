import { useEffect, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";

/**
 * Hook que registra o Service Worker (apenas em produção real) e expõe
 * o estado de "nova versão disponível".
 *
 * Estratégia (registerType: "prompt"):
 *  1. SW é instalado em background mas NÃO ativa sozinho.
 *  2. Polling a cada 60s pede `registration.update()` para detectar deploys.
 *  3. Quando há nova versão → `onNeedRefresh` → UI mostra prompt.
 *  4. `applyUpdate()` chama `updateSW(true)`:
 *      - envia SKIP_WAITING para o SW novo,
 *      - escuta `controllerchange` → faz reload de todas as abas.
 *  5. Se o usuário tem uma versão MUITO antiga em cache cujos chunks JS já
 *     não existem (causa "Failed to fetch dynamically imported module"),
 *     o LazyErrorBoundary captura e força reload — pegando o novo SW.
 *
 * Em iframes/preview do Lovable o registro é pulado em main.tsx.
 */
export function usePwaUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const updateRef = useRef<((reload?: boolean) => Promise<void>) | null>(null);

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
        // Auto-aplica após 8s se o usuário não interagir — garante que
        // ninguém fique preso em versão antiga por dias.
        setTimeout(() => {
          if (updateRef.current) {
            void updateRef.current(true).catch(() => window.location.reload());
          }
        }, 8000);
      },
      onOfflineReady() {
        // Primeira instalação — app pronto para uso offline. Sem prompt.
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        // Polling agressivo: a cada 30s checa por nova versão
        const interval = setInterval(() => {
          registration.update().catch(() => { /* offline ok */ });
        }, 30 * 1000);
        // Também checa quando o usuário volta à aba (PWA aberto após dias)
        const onVisible = () => {
          if (document.visibilityState === "visible") {
            registration.update().catch(() => { /* offline ok */ });
          }
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
          clearInterval(interval);
          document.removeEventListener("visibilitychange", onVisible);
        };
      },
      onRegisterError(err) {
        console.warn("[PWA] SW registration error", err);
      },
    });

    updateRef.current = update;
  }, []);

  const applyUpdate = async () => {
    if (!updateRef.current) {
      window.location.reload();
      return;
    }
    // updateSW(true) envia SKIP_WAITING ao novo SW e recarrega quando
    // ele toma controle (controllerchange) — garante que o usuário sempre
    // veja a versão mais recente após clicar em "Atualizar".
    await updateRef.current(true);
  };

  const dismiss = () => setNeedRefresh(false);

  return { needRefresh, applyUpdate, dismiss };
}
