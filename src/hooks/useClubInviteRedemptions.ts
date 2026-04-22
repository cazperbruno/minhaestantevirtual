import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { queryClient } from "@/lib/query-client";

export interface InviteRedemption {
  id: string;
  invite_link_id: string;
  club_id: string;
  user_id: string;
  redeemed_at: string;
  profile?: {
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  };
}

const qk = (clubId: string) => ["club-invite-redemptions", clubId] as const;

/**
 * Lista quem entrou no clube via link de convite — somente o dono enxerga.
 * Realtime para refletir novos resgates instantaneamente.
 */
export function useClubInviteRedemptions(clubId: string | undefined, isOwner: boolean) {
  useEffect(() => {
    if (!clubId || !isOwner) return;
    const ch = supabase
      .channel(`invite-redeem:${clubId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "club_invite_redemptions",
          filter: `club_id=eq.${clubId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: qk(clubId) }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [clubId, isOwner]);

  return useQuery<InviteRedemption[]>({
    queryKey: qk(clubId || ""),
    enabled: !!clubId && isOwner,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("club_invite_redemptions")
        .select("*")
        .eq("club_id", clubId!)
        .order("redeemed_at", { ascending: false })
        .limit(50);
      const list = (rows as InviteRedemption[]) || [];
      const ids = [...new Set(list.map((r) => r.user_id))];
      if (!ids.length) return list;
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,display_name,username,avatar_url")
        .in("id", ids);
      const m = new Map((profs || []).map((p) => [p.id, p]));
      return list.map((r) => ({ ...r, profile: m.get(r.user_id) ?? undefined }));
    },
  });
}
