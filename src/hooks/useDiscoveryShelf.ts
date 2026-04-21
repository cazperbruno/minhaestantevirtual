import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CACHE } from "@/lib/query-client";
import type { Book } from "@/types/book";

export interface DiscoveryItem {
  book: Book;
  score: number;
  reason: string | null;
}

/**
 * Prateleira de descoberta — usa a função `recommend_for_user` do banco
 * (mistura colaborativa + conteúdo + tendência) e devolve livros que o
 * usuário ainda NÃO tem na biblioteca, com metadados completos.
 *
 * Cache: SOCIAL (5min). Ideal para topo/rodapé da biblioteca.
 */
export function useDiscoveryShelf(limit = 18) {
  const { user } = useAuth();
  return useQuery<DiscoveryItem[]>({
    queryKey: ["discovery", user?.id, limit],
    enabled: !!user,
    ...CACHE.SOCIAL,
    queryFn: async () => {
      if (!user) return [];
      const { data: recs, error } = await supabase.rpc("recommend_for_user", {
        _user_id: user.id,
        _limit: limit,
      });
      if (error) throw error;
      const list = recs || [];
      if (!list.length) return [];

      const ids = list.map((r: any) => r.id);
      const { data: books } = await supabase
        .from("books")
        .select("*")
        .in("id", ids);

      const bookMap = new Map((books || []).map((b: any) => [b.id, b as Book]));
      // preserva a ordem de score do RPC
      return list
        .map((r: any) => {
          const book = bookMap.get(r.id);
          return book ? { book, score: r.score, reason: r.reason } : null;
        })
        .filter(Boolean) as DiscoveryItem[];
    },
  });
}
