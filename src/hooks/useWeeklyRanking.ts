import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CACHE, qk } from "@/lib/query-client";

const PAGE = 25;

export interface WeeklyRankRow {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  weekly_xp: number;
  level: number;
  position: number;
}

export interface AmbassadorRow {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  signups_count: number;
  xp_earned: number;
  tier: string;
  position: number;
}

/** Ranking semanal com paginação infinita (25 por página). */
export function useWeeklyRankingInfinite() {
  return useInfiniteQuery({
    queryKey: qk.weeklyRanking(),
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * PAGE;
      const to = from + PAGE - 1;
      const { data, error } = await supabase
        .from("weekly_ranking_view")
        .select("*")
        .order("position")
        .range(from, to);
      if (error) throw error;
      return (data as WeeklyRankRow[]) || [];
    },
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length < PAGE ? undefined : all.length),
    ...CACHE.SOCIAL,
  });
}

/** Embaixadores (top convidadores). */
export function useAmbassadors(limit = 50) {
  return useQuery<AmbassadorRow[]>({
    queryKey: [...qk.ambassadors(), limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ambassadors_view")
        .select("*")
        .order("position")
        .limit(limit);
      if (error) throw error;
      return (data as AmbassadorRow[]) || [];
    },
    ...CACHE.SOCIAL,
  });
}
