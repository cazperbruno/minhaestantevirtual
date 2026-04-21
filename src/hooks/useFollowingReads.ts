import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CACHE } from "@/lib/query-client";
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
 */
export function useFollowingReads(limit = 18) {
  const { user } = useAuth();
  return useQuery<FollowingReadItem[]>({
    queryKey: ["following-reads", user?.id, limit],
    enabled: !!user,
    ...CACHE.SOCIAL,
    queryFn: async () => {
      if (!user) return [];
      const { data: rows, error } = await supabase.rpc("books_read_by_following", {
        _user_id: user.id,
        _limit: limit,
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

      return list
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
    },
  });
}
