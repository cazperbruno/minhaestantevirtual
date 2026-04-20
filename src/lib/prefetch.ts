import { supabase } from "@/integrations/supabase/client";
import { CACHE, qk, queryClient } from "@/lib/query-client";

/**
 * Prefetch de telas — chamado no hover/focus dos links da BottomNav.
 * Tudo respeita os staleTimes: se já está fresco, não refaz.
 */
export const prefetch = {
  library: (userId?: string) => {
    if (!userId) return;
    queryClient.prefetchQuery({
      queryKey: qk.library(userId),
      queryFn: async () => {
        const { data } = await supabase
          .from("user_books")
          .select("*, book:books(*)")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false });
        return data || [];
      },
      ...CACHE.PERSONAL,
    });
  },

  ranking: () => {
    queryClient.prefetchQuery({
      queryKey: qk.ranking(),
      queryFn: async () => {
        const { data } = await supabase
          .from("ranking_view")
          .select("*")
          .order("position", { ascending: true })
          .limit(50);
        return data || [];
      },
      ...CACHE.SOCIAL,
    });
  },

  feed: () => {
    queryClient.prefetchQuery({
      queryKey: qk.feed(),
      queryFn: async () => {
        const { data } = await supabase
          .from("activities")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20);
        return data || [];
      },
      ...CACHE.SOCIAL,
    });
  },

  profile: (userId: string) => {
    queryClient.prefetchQuery({
      queryKey: qk.profile(userId),
      queryFn: async () => {
        const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
        return data;
      },
      ...CACHE.SOCIAL,
    });
  },
};
