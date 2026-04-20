/**
 * Re-rank de resultados de busca por afinidade do usuário.
 * Mantém ordem para queries muito específicas (match exato no título),
 * mas reordena os demais por gosto.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Book } from "@/types/book";

export async function rerankByTaste(books: Book[], userId: string, query: string): Promise<Book[]> {
  if (books.length <= 2 || !userId) return books;

  const { data: taste } = await supabase.rpc("user_taste", { _user_id: userId });
  const tasteMap = new Map<string, number>();
  (taste || []).forEach((t: any) => tasteMap.set(t.category, t.weight));
  if (tasteMap.size === 0) return books;

  const q = query.toLowerCase().trim();

  return [...books]
    .map((b, idx) => {
      // Match exato no título → prioridade máxima (mantém posição original boostada)
      const titleMatch = b.title?.toLowerCase() === q ? 1000 : 0;
      // Afinidade por categorias
      let affinity = 0;
      (b.categories || []).forEach((c) => (affinity += tasteMap.get(c) || 0));
      // Score: prioriza título exato, depois afinidade, com leve peso pela ordem original
      const originalScore = (books.length - idx) * 0.1;
      return { b, s: titleMatch + affinity + originalScore };
    })
    .sort((a, b) => b.s - a.s)
    .map(({ b }) => b);
}
