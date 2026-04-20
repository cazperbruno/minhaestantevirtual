import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CACHE, qk } from "@/lib/query-client";

export interface InviteData {
  code: string;
  signups_count: number;
  xp_earned: number;
}

export interface Ambassador {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  signups_count: number;
  xp_earned: number;
  tier: string;
  position: number;
}

export function useInvite(userId: string | undefined) {
  return useQuery<InviteData | null>({
    queryKey: userId ? qk.invite(userId) : ["invite", "anon"],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return null;
      // Garantir que existe
      await supabase.rpc("ensure_invite", { _user_id: userId });
      const { data } = await supabase
        .from("invites")
        .select("code, signups_count, xp_earned")
        .eq("user_id", userId)
        .maybeSingle();
      return (data as InviteData) ?? null;
    },
    ...CACHE.PERSONAL,
  });
}

export function useAmbassadors(limit = 50) {
  return useQuery<Ambassador[]>({
    queryKey: [...qk.ambassadors(), limit],
    queryFn: async () => {
      const { data } = await supabase
        .from("ambassadors_view")
        .select("*")
        .order("position")
        .limit(limit);
      return (data as Ambassador[]) || [];
    },
    ...CACHE.SOCIAL,
  });
}
