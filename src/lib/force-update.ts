/**
 * Kill switch global de versão.
 *
 * Lê /app-version.json (sempre fresh, fora do cache do SW). Se `minVersion`
 * remoto > versão local salva no localStorage, executa um wipe completo:
 *   1. unregister de todos os Service Workers
 *   2. delete em todos os CacheStorage
 *   3. reload com query string anti-cache
 *
 * Isso permite forçar atualização de TODOS os usuários (mesmo os que estão
 * presos em SW antigo que não responde a `registration.update()`), bastando
 * incrementar `minVersion` no JSON e fazer deploy.
 *
 * O JSON é buscado com `cache: "no-store"` + `?t=` para garantir que o
 * próprio SW antigo não devolva versão em cache.
 */
const STORAGE_KEY = "readify:app-version";
const VERSION_URL = "/app-version.json";

async function wipeAndReload() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch (e) {
    console.warn("[force-update] wipe failed", e);
  } finally {
    const url = new URL(window.location.href);
    url.searchParams.set("_v", Date.now().toString());
    window.location.replace(url.toString());
  }
}

export async function checkForceUpdate(): Promise<void> {
  // Não rodar em iframe/preview
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

  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
      cache: "no-store",
      credentials: "omit",
    });
    if (!res.ok) return;
    const data = (await res.json()) as { minVersion?: number };
    const remote = Number(data?.minVersion ?? 0);
    if (!Number.isFinite(remote) || remote <= 0) return;

    const localRaw = localStorage.getItem(STORAGE_KEY);
    const local = Number(localRaw ?? 0);

    if (remote > local) {
      // Marca a nova versão ANTES de wipe (sobrevive porque localStorage
      // não é tocado pelo CacheStorage clear). Evita loop de reload.
      localStorage.setItem(STORAGE_KEY, String(remote));
      // Se nunca tinha registrado (primeiro acesso), só salva e segue.
      if (localRaw === null) return;
      console.info(`[force-update] ${local} → ${remote} — wipe + reload`);
      await wipeAndReload();
    }
  } catch {
    // offline ou JSON ausente: ignorar
  }
}
