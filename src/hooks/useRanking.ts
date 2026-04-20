import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CACHE, qk } from "@/lib/query-client";

export interface RankRow {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  xp: number;
  level: number;
  books_read: number;
  reviews_count: number;
  position: number;
}

/** Ranking global — cache SOCIAL (5min). */
export function useRanking(limit = 100) {
  return useQuery<RankRow[]>({
    queryKey: [...qk.ranking(), limit],
    queryFn: async () => {
      const { data } = await supabase
        .from("ranking_view")
        .select("*")
        .order("position")
        .limit(limit);
      return (data as RankRow[]) || [];
    },
    ...CACHE.SOCIAL,
  });
}
