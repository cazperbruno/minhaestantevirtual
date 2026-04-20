import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

/**
 * Service Worker / PWA registration guard.
 * O vite-plugin-pwa registra o SW automaticamente em produção (autoUpdate),
 * mas dentro do iframe do preview do Lovable e em hosts de preview o SW
 * causa cache poluído + interferência de navegação. Aqui:
 *   1) Detectamos iframe e hosts de preview.
 *   2) Se for preview/iframe, desregistramos QUALQUER SW existente.
 *   3) Em produção real (publicado), o registro do plugin PWA segue normalmente.
 */
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();

const host = window.location.hostname;
const isPreviewHost =
  host.includes("id-preview--") ||
  host.includes("lovableproject.com") ||
  host === "localhost" ||
  host === "127.0.0.1";

if ((isPreviewHost || isInIframe) && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  }).catch(() => { /* noop */ });
}

createRoot(document.getElementById("root")!).render(<App />);
