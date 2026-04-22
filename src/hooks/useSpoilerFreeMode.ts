import { useCallback, useEffect, useState } from "react";

/**
 * Modo "sem spoiler" — preferência por clube, persistida em localStorage.
 * Quando ativo, TODAS as mensagens com `spoiler_page` ficam ocultas atrás de
 * blur (independente da página atual do leitor), até serem reveladas uma a uma.
 *
 * Sincroniza entre abas via `storage` event.
 */
const KEY = (clubId: string) => `readify:spoiler-free:${clubId}`;

function read(clubId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY(clubId)) === "1";
  } catch {
    return false;
  }
}

export function useSpoilerFreeMode(clubId: string | undefined) {
  const [enabled, setEnabled] = useState<boolean>(() =>
    clubId ? read(clubId) : false,
  );

  // Atualiza quando o clube muda
  useEffect(() => {
    setEnabled(clubId ? read(clubId) : false);
  }, [clubId]);

  // Sync entre abas
  useEffect(() => {
    if (!clubId) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY(clubId)) setEnabled(e.newValue === "1");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [clubId]);

  const toggle = useCallback(() => {
    if (!clubId) return;
    setEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(KEY(clubId), next ? "1" : "0");
      } catch {/* ignore */}
      return next;
    });
  }, [clubId]);

  return { enabled, toggle };
}
