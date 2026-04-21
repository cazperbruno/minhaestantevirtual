import { useEffect, useState } from "react";

/**
 * Modo de visualização da biblioteca.
 * - `home`        → Modo Casa: visual simples tipo prateleira física, sem IA
 * - `interactive` → Modo Interativo: prateleiras Netflix com filtros dinâmicos
 * - `grid`        → Grade clássica
 *
 * Preferência persistida em localStorage por usuário (key estável).
 */
export type ViewMode = "home" | "interactive" | "grid";

const STORAGE_KEY = "readify:library-view-mode";
const DEFAULT_MODE: ViewMode = "interactive";

function read(): ViewMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "home" || v === "interactive" || v === "grid") return v;
  } catch { /* ignore */ }
  return DEFAULT_MODE;
}

export function useViewMode(): [ViewMode, (m: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(read);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* quota */ }
  }, [mode]);

  // Sincroniza entre abas
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === "home" || e.newValue === "interactive" || e.newValue === "grid")) {
        setMode(e.newValue);
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return [mode, setMode];
}
