import { useEffect, useState, useCallback } from "react";

const LS_KEY = "page_tutorials_seen_v1";

function readSeen(): Record<string, true> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeSeen(map: Record<string, true>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch {
    /* noop */
  }
}

/**
 * Controla a exibição de um tutorial spotlight por página.
 * Persiste em localStorage uma vez por chave (`pageKey`).
 *
 * Uso:
 *   const { open, close, reopen } = usePageTutorial("library");
 *   <SpotlightTutorial open={open} steps={...} onClose={close} />
 */
export function usePageTutorial(pageKey: string, opts: { delay?: number; enabled?: boolean } = {}) {
  const { delay = 700, enabled = true } = opts;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled || !pageKey) return;
    const seen = readSeen();
    if (seen[pageKey]) return;
    const t = setTimeout(() => setOpen(true), delay);
    return () => clearTimeout(t);
  }, [pageKey, delay, enabled]);

  const close = useCallback(() => {
    setOpen(false);
    const seen = readSeen();
    seen[pageKey] = true;
    writeSeen(seen);
  }, [pageKey]);

  const reopen = useCallback(() => setOpen(true), []);

  return { open, close, reopen };
}

/** Reset programático (debug/configurações). */
export function resetPageTutorial(pageKey?: string) {
  if (!pageKey) {
    localStorage.removeItem(LS_KEY);
    return;
  }
  const seen = readSeen();
  delete seen[pageKey];
  writeSeen(seen);
}
