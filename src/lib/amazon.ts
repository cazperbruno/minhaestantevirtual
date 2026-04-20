/**
 * Helpers de afiliados Amazon — Brasil.
 *
 * Toda CTA "Comprar na Amazon" passa por aqui para:
 *  1) Aplicar a tag de afiliados (env: VITE_AMAZON_AFFILIATE_TAG, opcional)
 *  2) Registrar a interação (`kind: 'click'`, meta.target='amazon') para alimentar o
 *     motor de IA — clique em comprar é forte sinal de intenção/afinidade.
 *
 * Usar `openAmazon(book)` em vez de construir URLs manualmente nos componentes.
 */
import type { Book } from "@/types/book";
import { track } from "@/lib/track";

/** Tag de afiliados Amazon BR — pode ser sobrescrita via env VITE_AMAZON_AFFILIATE_TAG. */
const AFFILIATE_TAG =
  (import.meta.env.VITE_AMAZON_AFFILIATE_TAG as string | undefined) || "cazperbruno-20";

/** Constrói URL de busca Amazon BR com fallback ISBN → título+autor. */
export function amazonSearchUrl(book: Pick<Book, "title" | "authors" | "isbn_13" | "isbn_10">): string {
  const term =
    book.isbn_13 ||
    book.isbn_10 ||
    `${book.title}${book.authors?.[0] ? ` ${book.authors[0]}` : ""}`;
  const params = new URLSearchParams({ k: term });
  if (AFFILIATE_TAG) params.set("tag", AFFILIATE_TAG);
  return `https://www.amazon.com.br/s?${params.toString()}`;
}

/** Abre Amazon em nova aba e registra a interação (não bloqueia se tracking falhar). */
export function openAmazon(book: Pick<Book, "id" | "title" | "authors" | "isbn_13" | "isbn_10">) {
  const url = amazonSearchUrl(book);
  try { track("click", book.id, { target: "amazon" }); } catch { /* silent */ }
  window.open(url, "_blank", "noopener,noreferrer");
}
