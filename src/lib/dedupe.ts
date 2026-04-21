import type { Book } from "@/types/book";

/**
 * Deduplica uma lista mantendo apenas a primeira ocorrência de cada livro
 * "logicamente igual". Critério (ordem de prioridade):
 *  1. ISBN-13
 *  2. ISBN-10
 *  3. (título normalizado + primeiro autor normalizado)
 *
 * Usado em prateleiras de descoberta/sugestão para nunca repetir o mesmo
 * livro dentro de UMA prateleira — porém o mesmo livro PODE aparecer em
 * prateleiras diferentes (regra global do app).
 */
export function dedupeByIsbn<T>(items: T[], extract: (item: T) => Book | null | undefined): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const book = extract(item);
    const key = bookDedupeKey(book);
    if (!key) {
      out.push(item);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function bookDedupeKey(book: Book | null | undefined): string | null {
  if (!book) return null;
  if (book.isbn_13) return `i13:${book.isbn_13}`;
  if (book.isbn_10) return `i10:${book.isbn_10}`;
  const title = normalize(book.title);
  const author = normalize(book.authors?.[0] || "");
  if (!title) return null;
  return `ta:${title}|${author}`;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
