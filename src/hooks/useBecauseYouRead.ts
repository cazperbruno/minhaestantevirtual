/**
 * "Porque você leu X" — prateleira contextual.
 *
 * Pega o livro lido mais recentemente pelo usuário e busca livros similares
 * (mesmas categorias, mesmo autor) que ele ainda não tem na biblioteca.
 *
 * Cache PERSONAL: muda quando o user finaliza uma leitura.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CACHE } from "@/lib/query-client";
import type { Book } from "@/types/book";

export interface BecauseYouReadShelf {
  /** Livro de referência (o "porque"). */
  seed: Book;
  /** Sugestões — sempre fora da biblioteca do usuário. */
  books: Book[];
}

export function useBecauseYouRead(limit = 12) {
  const { user } = useAuth();
  return useQuery<BecauseYouReadShelf | null>({
    queryKey: ["because-you-read", user?.id, limit],
    enabled: !!user,
    ...CACHE.PERSONAL,
    queryFn: async () => {
      if (!user) return null;

      // 1) último livro lido
      const { data: lastRead } = await supabase
        .from("user_books")
        .select("finished_at, book:books(*)")
        .eq("user_id", user.id)
        .eq("status", "read")
        .not("finished_at", "is", null)
        .order("finished_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const seed = (lastRead?.book ?? null) as Book | null;
      if (!seed) return null;

      // 2) IDs já na biblioteca do user — para excluir das sugestões
      const { data: ownedRows } = await supabase
        .from("user_books")
        .select("book_id")
        .eq("user_id", user.id);
      const owned = new Set((ownedRows ?? []).map((r: any) => r.book_id as string));
      owned.add(seed.id);

      const cats = (seed.categories ?? []).filter(Boolean).slice(0, 3);
      const author = seed.authors?.[0];

      // 3) busca por categorias OU mesmo autor (até 40 candidatos)
      let query = supabase.from("books").select("*").neq("id", seed.id).limit(40);
      if (cats.length > 0) {
        query = query.overlaps("categories", cats);
      } else if (author) {
        query = query.contains("authors", [author]);
      } else {
        return { seed, books: [] };
      }

      const { data: candidates } = await query;
      const books = ((candidates as Book[]) ?? [])
        .filter((b) => !owned.has(b.id))
        .slice(0, limit);

      return { seed, books };
    },
  });
}
