import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CACHE, qk } from "@/lib/query-client";

const PAGE = 30;

export interface XpEvent {
  id: string;
  amount: number;
  source: string;
  meta: any;
  created_at: string;
}

/** Histórico paginado de XP do usuário, mais recente primeiro. */
export function useXpHistory(userId: string | undefined) {
  return useInfiniteQuery({
    queryKey: userId ? qk.xpHistory(userId) : ["xp-history", "anon"],
    enabled: !!userId,
    queryFn: async ({ pageParam = 0 }) => {
      if (!userId) return [];
      const from = pageParam * PAGE;
      const to = from + PAGE - 1;
      const { data, error } = await supabase
        .from("xp_events")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return (data as XpEvent[]) || [];
    },
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length < PAGE ? undefined : all.length),
    ...CACHE.PERSONAL,
  });
}

/** Agrupa eventos por dia (YYYY-MM-DD), preservando ordem. */
export function groupByDay(events: XpEvent[]) {
  const groups = new Map<string, { total: number; events: XpEvent[] }>();
  for (const e of events) {
    const day = e.created_at.slice(0, 10);
    const g = groups.get(day) ?? { total: 0, events: [] };
    g.total += e.amount;
    g.events.push(e);
    groups.set(day, g);
  }
  return Array.from(groups.entries()).map(([day, g]) => ({ day, ...g }));
}
