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
import type { Book } from "@/types/book";
import type { AnilistManga } from "@/lib/anilist-api";

export function isExternal(book: Pick<Book, "id">): boolean {
  return typeof book.id === "string" && book.id.startsWith("ext_");
}

/**
 * Garante que o livro existe no banco. Retorna o `Book` persistido (com UUID).
 * Se já é interno, devolve o input. Se a persistência falhar, devolve null.
 */
export async function ensurePersistedBook(book: Book | (Book & Partial<AnilistManga>)): Promise<Book | null> {
  if (!isExternal(book)) return book;
  const { id: _ignore, ...payload } = book as any;
  const saved = await saveBook(payload);
  return saved ?? null;
}
