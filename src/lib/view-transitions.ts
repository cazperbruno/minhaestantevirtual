/**
 * View Transitions API helper — transição "shared element" entre rotas.
 *
 * Suporte:
 *  - Chrome/Edge ≥111, Safari ≥18 (parcial). Fallback gracioso onde indisponível.
 *  - Respeita `prefers-reduced-motion`.
 *
 * Política de scroll: o reset para o topo da nova rota fica a cargo do
 * componente global `ScrollToTop` (montado uma vez no `BrowserRouter`).
 * Como ele usa `useLayoutEffect`, o reset acontece dentro da janela de
 * atualização da View Transition — a página nova é revelada já no topo,
 * sem "flash".
 *
 * Para garantir o mesmo comportamento em browsers SEM View Transitions
 * (fallback), forçamos um `scrollTo(0,0)` imediatamente após o callback,
 * antes do React commit, eliminando qualquer corrida.
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
 * reduced-motion), apenas roda o callback imediatamente. Em ambos os casos
 * o `ScrollToTop` global garante topo da página em PUSH/REPLACE.
 */
export async function viewTransition(update: () => void | Promise<void>): Promise<void> {
  if (!supportsViewTransitions() || reducedMotion()) {
    await update();
    return;
  }
  const doc = document as Doc;
  const transition = doc.startViewTransition!(async () => {
    await update();
  });
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
