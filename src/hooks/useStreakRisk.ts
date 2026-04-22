import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CACHE } from "@/lib/query-client";

export interface StreakRisk {
  at_risk: boolean;
  current_days: number;
  freezes_available: number;
}

/** Detecta se o streak do usuário está em risco hoje (ainda não leu). */
export function useStreakRisk(userId: string | undefined) {
  return useQuery<StreakRisk>({
    queryKey: ["streak-risk", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.rpc("my_streak_at_risk");
      const row = (data as any[])?.[0];
      return row ?? { at_risk: false, current_days: 0, freezes_available: 0 };
    },
    ...CACHE.PERSONAL,
  });
}
