import { supabase } from "@/integrations/supabase/client";
import { resolveCover, invalidateCover } from "@/lib/cover-fallback";
import type { Book } from "@/types/book";

export interface RefreshResult {
  ok: boolean;
  fields_filled: string[];
  patch?: Partial<Book>;
  sourcesTried?: string[];
  cover_updated?: boolean;
}

/**
 * Reprocessa um livro: roda a cascade pública de fontes + busca de capa,
 * mescla apenas dados melhores no registro do banco. Idempotente.
 *
 * Banco interno é a fonte de verdade — esta função apenas COMPLEMENTA.
 */
export async function refreshBookData(bookId: string, currentCover?: string | null): Promise<RefreshResult> {
  // 1) Reprocessamento de metadados via cascade
  const { data: meta, error } = await supabase.functions.invoke("refresh-book", {
    body: { book_id: bookId },
  });
  if (error) throw new Error(error.message || "Falha ao reprocessar livro");

  let coverUpdated = false;

  // 2) Se não tem capa (no banco), tenta resolver+persistir via cover-search
  if (!currentCover && !meta?.patch?.cover_url) {
    const found = await resolveCover(
      { id: bookId, cover_url: null, isbn_10: null, isbn_13: null, title: "", authors: [] },
      { persist: true },
    );
    if (found) coverUpdated = true;
  }

  // Invalida cache local de capa para forçar re-render
  invalidateCover({ id: bookId, cover_url: null, isbn_10: null, isbn_13: null, title: "", authors: [] });

  return {
    ok: !!meta?.ok,
    fields_filled: meta?.fields_filled || [],
    patch: meta?.patch,
    sourcesTried: meta?.sourcesTried,
    cover_updated: coverUpdated,
  };
}
