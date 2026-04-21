import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CACHE } from "@/lib/query-client";

export type Division = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export interface LeagueData {
  division: Division;
  division_label: string;
  weekly_xp: number;
  position_global: number;
  position_in_division: number;
  total_in_division: number;
  promotion_threshold: number;
  demotion_threshold: number;
}

/** Liga semanal do usuário corrente (Bronze→Diamante). */
export function useWeeklyLeague() {
  const { user } = useAuth();
  return useQuery<LeagueData | null>({
    queryKey: ["weekly-league", user?.id],
    enabled: !!user,
    ...CACHE.SOCIAL,
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.rpc("weekly_league_for_user", { _user_id: user.id });
      if (error) throw error;
      const row = (data ?? [])[0] as LeagueData | undefined;
      return row ?? null;
    },
  });
}

export interface SeasonalChallenge {
  code: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  metric: string;
  target: number;
  xp_reward: number;
  tags: string[] | null;
}

/** Missões sazonais ativas no mês corrente. */
export function useSeasonalChallenges() {
  return useQuery<SeasonalChallenge[]>({
    queryKey: ["seasonal-challenges"],
    ...CACHE.SOCIAL,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("active_seasonal_challenges");
      if (error) throw error;
      return (data ?? []) as SeasonalChallenge[];
    },
  });
}
