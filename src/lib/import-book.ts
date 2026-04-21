/**
 * Importa um livro/mangá externo (id "ext_*") para o catálogo interno
 * antes de adicionar à biblioteca do usuário.
 *
 * Quando o livro vier de uma fonte externa (AniList, Google Books, etc), seu
 * `id` ainda não existe no Postgres — chamamos o endpoint `search-books?action=save`
 * que dedupa por (source, source_id) ou ISBN, persiste a `series` quando aplicável,
 * e devolve o `Book` real com UUID.
 */
import { saveBook } from "@/lib/books-api";
import { trackEvent } from "@/lib/track";
import type { Book } from "@/types/book";
import type { AnilistManga } from "@/lib/anilist-api";

/** UUID v4-ish check — a real internal book id is always a UUID. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Considera "externo" qualquer item que ainda NÃO está persistido no banco
 * interno como UUID. Inclui resultados crus de Google/OpenLibrary/AniList
 * (sem `id` ou com `id` no formato `ext_*`/`source_id`), garantindo que ao
 * clicar no card a busca unificada o salve antes de navegar para o detalhe.
 */
export function isExternal(book: Pick<Book, "id">): boolean {
  if (!book?.id || typeof book.id !== "string") return true;
  if (book.id.startsWith("ext_")) return true;
  return !UUID_RE.test(book.id);
}

/**
 * Garante que o livro existe no banco. Retorna o `Book` persistido (com UUID).
 * Se já é interno, devolve o input. Se a persistência falhar, devolve null.
 */
export async function ensurePersistedBook(book: Book | (Book & Partial<AnilistManga>)): Promise<Book | null> {
  if (!isExternal(book)) return book;
  const t0 = performance.now();
  const { id: _ignore, ...payload } = book as any;
  const saved = await saveBook(payload);
  trackEvent(saved ? "import_external_book_ok" : "import_external_book_failed", {
    source: book.source ?? null,
    source_id: book.source_id ?? null,
    title: book.title,
    latency_ms: Math.round(performance.now() - t0),
  });
  return saved ?? null;
}
