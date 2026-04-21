/**
 * View Transitions API helper — transição "shared element" entre rotas.
 *
 * Suporte:
 *  - Chrome/Edge ≥111, Safari ≥18 (parcial). Fallback gracioso onde indisponível.
 *  - Respeita `prefers-reduced-motion`.
 *
 * Uso:
 *   await navigateWithTransition(() => navigate(`/livro/${id}`));
 *   // BookCover do card e BookHero compartilham `view-transition-name`
 *   // → o navegador interpola posição/tamanho automaticamente.
 */

type Doc = Document & {
  startViewTransition?: (cb: () => void | Promise<void>) => {
    finished: Promise<void>;
    ready: Promise<void>;
    updateCallbackDone: Promise<void>;
  };
};

function reducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function supportsViewTransitions(): boolean {
  if (typeof document === "undefined") return false;
  return typeof (document as Doc).startViewTransition === "function";
}

/**
 * Executa `update` dentro de uma View Transition. Sem suporte (ou
 * reduced-motion), apenas roda o callback imediatamente.
 */
export async function viewTransition(update: () => void | Promise<void>): Promise<void> {
  if (!supportsViewTransitions() || reducedMotion()) {
    await update();
    return;
  }
  const doc = document as Doc;
  const transition = doc.startViewTransition!(update);
  try {
    await transition.finished;
  } catch {
    /* navegador cancela em hot-reload ou navegação interrompida — silencioso */
  }
}

/** Nome único e estável por livro — usado em ambas as telas para casar o elemento. */
export function bookCoverTransitionName(bookId?: string | null): string | undefined {
  if (!bookId) return undefined;
  // CSS-safe: alfanumérico + hífen
  return `book-cover-${bookId.replace(/[^a-zA-Z0-9-]/g, "")}`;
}
