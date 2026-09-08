import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { setupOfflineSync } from "@/lib/offline-queue";
import { checkForceUpdate } from "@/lib/force-update";
import readifyMarkUrl from "@/assets/readify-mark-v8.webp";

// LCP optimization: preload da marca usada na tela de entrada.
(() => {
  try {
    if (typeof document === "undefined") return;
    if (document.querySelector('link[rel="preload"][as="image"][data-lcp="readify-mark"]')) return;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = readifyMarkUrl;
    link.type = "image/webp";
    link.setAttribute("fetchpriority", "high");
    link.setAttribute("data-lcp", "readify-mark");
    document.head.appendChild(link);
  } catch { /* noop */ }
})();

// Remove o cache legado que armazenava respostas autenticadas do Supabase por URL.
// A configuração atual do Workbox não cria nem reutiliza este cache.
if (typeof window !== "undefined" && "caches" in window) {
  void caches.delete("supabase-api").catch(() => false);
}

// Initialize offline action sync (replays only the authenticated user's queue).
setupOfflineSync();

// Kill switch: força atualização para todos quando minVersion remoto sobe.
void checkForceUpdate();

/**
 * Service Worker / PWA registration guard.
 * Em preview/iframe não mantemos SW nem CacheStorage persistentes.
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

  if ("caches" in window) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => { /* noop */ });
  }
}

createRoot(document.getElementById("root")!).render(<App />);
