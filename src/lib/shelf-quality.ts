import type { Book } from "@/types/book";

/**
 * Sistema unificado de qualidade/diversidade para prateleiras.
 *
 * Princípios:
 *  - Livros sem capa NUNCA aparecem antes de livros com capa.
 *  - Edições em PT-BR ganham boost (preferência global do app).
 *  - Diversificamos por autor (no máx. 2 do mesmo autor seguidos no topo).
 *  - Dedup por chave lógica (ISBN ou título+autor).
 */

const PT_LANG = new Set(["pt", "pt-br", "pt_br", "ptbr", "por"]);

/** True se a edição está em PT (pt, pt-BR, pt_BR, por). */
export function isPortugueseEdition(b: Book | null | undefined): boolean {
  if (!b?.language) return false;
  return PT_LANG.has(String(b.language).toLowerCase());
}

/** Score 0-100 — puramente do livro, ignorando o usuário. */
export function bookQualityScore(b: Book | null | undefined): number {
  if (!b) return 0;
  let s = 0;
  if (b.cover_url) s += 35;
  if (isPortugueseEdition(b)) s += 25;
  if (b.description && b.description.length > 80) s += 10;
  if (b.published_year && b.published_year > 1900) s += 5;
  if (b.page_count && b.page_count > 0) s += 5;
  if (b.publisher) s += 3;
  if ((b.authors?.length ?? 0) > 0) s += 3;
  if ((b.categories?.length ?? 0) > 0) s += 4;
  return Math.min(100, s);
}

/**
 * Reordena uma lista priorizando qualidade SEM destruir o sinal original.
 * Usa o score original (`baseScore`) como peso principal e adiciona o
 * quality score como tiebreaker / pequeno boost.
 */
export function rankByQuality<T>(
  items: T[],
  getBook: (i: T) => Book | null | undefined,
  getBaseScore: (i: T) => number = () => 0,
): T[] {
  return items
    .slice()
    .map((item, idx) => ({
      item,
      score: getBaseScore(item) + bookQualityScore(getBook(item)) * 0.01,
      idx,
    }))
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .map((x) => x.item);
}

/**
 * Diversifica por autor: garante que entre os primeiros N itens, nenhum autor
 * apareça mais que `maxPerAuthor` vezes. Empurra o excesso para o final
 * preservando a ordem relativa.
 */
export function diversifyByAuthor<T>(
  items: T[],
  getBook: (i: T) => Book | null | undefined,
  maxPerAuthor = 2,
): T[] {
  const counts = new Map<string, number>();
  const promoted: T[] = [];
  const demoted: T[] = [];
  for (const item of items) {
    const author = getBook(item)?.authors?.[0]?.toLowerCase().trim() ?? "";
    if (!author) {
      promoted.push(item);
      continue;
    }
    const c = counts.get(author) ?? 0;
    if (c < maxPerAuthor) {
      counts.set(author, c + 1);
      promoted.push(item);
    } else {
      demoted.push(item);
    }
  }
  return [...promoted, ...demoted];
}

/**
 * Garante que livros sem capa fiquem ao final (nunca no topo de uma prateleira).
 */
export function pushNoCoverDown<T>(items: T[], getBook: (i: T) => Book | null | undefined): T[] {
  const withCover: T[] = [];
  const noCover: T[] = [];
  for (const i of items) {
    if (getBook(i)?.cover_url) withCover.push(i);
    else noCover.push(i);
  }
  return [...withCover, ...noCover];
}

/**
 * Pipeline padrão para qualquer prateleira de descoberta:
 *  1) qualidade  2) diversidade por autor  3) sem-capa pra baixo
 */
export function refineShelf<T>(
  items: T[],
  getBook: (i: T) => Book | null | undefined,
  opts: { baseScore?: (i: T) => number; maxPerAuthor?: number } = {},
): T[] {
  const ranked = rankByQuality(items, getBook, opts.baseScore);
  const diverse = diversifyByAuthor(ranked, getBook, opts.maxPerAuthor ?? 2);
  return pushNoCoverDown(diverse, getBook);
}
