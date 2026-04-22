import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CACHE, qk } from "@/lib/query-client";
import { refineShelf } from "@/lib/shelf-quality";
import type { Book } from "@/types/book";

export interface FollowingReadItem {
  book: Book;
  reader_count: number;
  recent_at: string | null;
  reader_avatars: string[];
  reader_names: string[];
}

/**
 * Prateleira "Lidos por quem você segue".
 * Combina follows + user_books pra mostrar livros que sua rede leu (e você ainda não tem).
 * Cada item traz até 5 avatares dos leitores recentes + contagem total.
 *
 * Refino: dedupe + qualidade (PT-BR + capa) + diversidade por autor.
 * O score base é proporcional ao número de leitores (sinal social forte).
 */
export function useFollowingReads(limit = 18) {
  const { user } = useAuth();
  return useQuery<FollowingReadItem[]>({
    queryKey: [...qk.followingReads(user?.id), limit],
    enabled: !!user,
    ...CACHE.SOCIAL,
    queryFn: async () => {
      if (!user) return [];
      // Pede 2x pra ter folga depois do refino.
      const { data: rows, error } = await supabase.rpc("books_read_by_following", {
        _user_id: user.id,
        _limit: Math.max(limit * 2, 30),
      });
      if (error) throw error;
      const list = (rows ?? []) as Array<{
        book_id: string;
        reader_count: number;
        recent_at: string | null;
        reader_avatars: (string | null)[] | null;
        reader_names: (string | null)[] | null;
      }>;
      if (!list.length) return [];

      const ids = list.map((r) => r.book_id);
      const { data: books } = await supabase.from("books").select("*").in("id", ids);
      const bookMap = new Map((books ?? []).map((b: any) => [b.id, b as Book]));

      const enriched = list
        .map((r) => {
          const book = bookMap.get(r.book_id);
          if (!book) return null;
          return {
            book,
            reader_count: r.reader_count,
            recent_at: r.recent_at,
            reader_avatars: (r.reader_avatars ?? []).filter(Boolean) as string[],
            reader_names: (r.reader_names ?? []).filter(Boolean) as string[],
          } satisfies FollowingReadItem;
        })
        .filter(Boolean) as FollowingReadItem[];

      const refined = refineShelf(enriched, (i) => i.book, {
        baseScore: (i) => i.reader_count, // reader_count vira o ranking principal
        maxPerAuthor: 2,
      });

      return refined.slice(0, limit);
    },
  });
}
