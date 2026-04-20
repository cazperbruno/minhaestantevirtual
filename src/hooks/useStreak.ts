import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CACHE, qk } from "@/lib/query-client";

export interface StreakData {
  current_days: number;
  longest_days: number;
  last_active_date: string | null;
  next_milestone: number;
}

export function useStreak(userId: string | undefined) {
  return useQuery<StreakData | null>({
    queryKey: userId ? qk.streak(userId) : ["streak", "anon"],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from("user_streaks")
        .select("current_days, longest_days, last_active_date, next_milestone")
        .eq("user_id", userId)
        .maybeSingle();
      return (data as StreakData) ?? { current_days: 0, longest_days: 0, last_active_date: null, next_milestone: 7 };
    },
    ...CACHE.PERSONAL,
  });
}
