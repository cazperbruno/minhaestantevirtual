import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ClubCategory } from "@/lib/club-categories";

export interface CategorySummary {
  category: ClubCategory;
  clubs_count: number;
  members_count: number;
  online_count: number;
}

/** Sumário agregado por categoria — usado na home de clubes. */
export function useClubCategoriesSummary() {
  return useQuery({
    queryKey: ["clubs", "categories-summary"],
    queryFn: async (): Promise<CategorySummary[]> => {
      const { data, error } = await supabase.rpc("clubs_categories_summary");
      if (error) throw error;
      return (data || []).map((r: { category: string; clubs_count: number; members_count: number; online_count: number }) => ({
        category: r.category as ClubCategory,
        clubs_count: Number(r.clubs_count) || 0,
        members_count: Number(r.members_count) || 0,
        online_count: Number(r.online_count) || 0,
      }));
    },
    staleTime: 60_000,
    refetchInterval: 60_000, // atualiza online a cada 1min
  });
}
