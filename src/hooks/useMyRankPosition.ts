import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CACHE, qk } from "@/lib/query-client";

export interface RankPosition {
  global: { position: number; xp: number; level: number; xpToNext: number | null } | null;
  weekly: { position: number; weekly_xp: number; xpToNext: number | null } | null;
}

/** Posição do usuário nos rankings global + semanal, com XP até o próximo. */
export function useMyRankPosition(userId: string | undefined) {
  return useQuery<RankPosition>({
    queryKey: qk.myRank(userId),
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return { global: null, weekly: null };

      const [{ data: globalRow }, { data: weeklyRow }] = await Promise.all([
        supabase
          .from("ranking_view")
          .select("position, xp, level")
          .eq("id", userId)
          .maybeSingle(),
        supabase
          .from("weekly_ranking_view")
          .select("position, weekly_xp")
          .eq("id", userId)
          .maybeSingle(),
      ]);

      // XP de quem está uma posição acima (para mostrar quanto falta)
      const above = await Promise.all([
        globalRow?.position && globalRow.position > 1
          ? supabase
              .from("ranking_view")
              .select("xp")
              .eq("position", globalRow.position - 1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        weeklyRow?.position && weeklyRow.position > 1
          ? supabase
              .from("weekly_ranking_view")
              .select("weekly_xp")
              .eq("position", weeklyRow.position - 1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      return {
        global: globalRow
          ? {
              position: Number(globalRow.position),
              xp: globalRow.xp ?? 0,
              level: globalRow.level ?? 1,
              xpToNext:
                above[0].data && "xp" in (above[0].data as any)
                  ? Math.max(0, ((above[0].data as any).xp ?? 0) - (globalRow.xp ?? 0) + 1)
                  : null,
            }
          : null,
        weekly: weeklyRow
          ? {
              position: Number(weeklyRow.position),
              weekly_xp: weeklyRow.weekly_xp ?? 0,
              xpToNext:
                above[1].data && "weekly_xp" in (above[1].data as any)
                  ? Math.max(
                      0,
                      ((above[1].data as any).weekly_xp ?? 0) - (weeklyRow.weekly_xp ?? 0) + 1,
                    )
                  : null,
            }
          : null,
      };
    },
    ...CACHE.SOCIAL,
  });
}
