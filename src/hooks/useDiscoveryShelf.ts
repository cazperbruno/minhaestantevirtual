import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CACHE } from "@/lib/query-client";
import { refineShelf } from "@/lib/shelf-quality";
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
 * Refino client-side aplica:
 *   - boost PT-BR
 *   - dedupe interno
 *   - diversidade por autor (no máx. 2 do mesmo nas primeiras posições)
 *   - sem-capa empurrado pra baixo
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
      // Buscamos o dobro pra ter folga após dedupe + filtro de qualidade.
      const { data: recs, error } = await supabase.rpc("recommend_for_user", {
        _user_id: user.id,
        _limit: Math.max(limit * 2, 30),
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
      const enriched = list
        .map((r: any) => {
          const book = bookMap.get(r.id);
          return book ? { book, score: r.score, reason: r.reason } : null;
        })
        .filter(Boolean) as DiscoveryItem[];

      // Refino: qualidade + diversidade + sem-capa-pra-baixo
      const refined = refineShelf(enriched, (i) => i.book, {
        baseScore: (i) => i.score,
        maxPerAuthor: 2,
      });

      return refined.slice(0, limit);
    },
  });
}
