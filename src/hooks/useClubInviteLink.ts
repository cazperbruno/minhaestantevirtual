import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryClient } from "@/lib/query-client";
import { toast } from "sonner";

const qk = (clubId: string) => ["club-invite-link", clubId] as const;

export interface ClubInviteLink {
  id: string;
  club_id: string;
  token: string;
  created_by: string;
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
  revoked: boolean;
  created_at: string;
}

/** Link de convite ativo (não revogado) do clube — visão do dono. */
export function useClubInviteLink(clubId: string | undefined, isOwner: boolean) {
  return useQuery<ClubInviteLink | null>({
    queryKey: qk(clubId || ""),
    enabled: !!clubId && isOwner,
    queryFn: async () => {
      const { data } = await supabase
        .from("club_invite_links")
        .select("*")
        .eq("club_id", clubId!)
        .eq("revoked", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as ClubInviteLink) || null;
    },
  });
}

/** Cria (ou rotaciona) um link de convite. */
export function useCreateInviteLink(clubId: string) {
  return useMutation({
    mutationFn: async (opts: { expires_in_days?: number; max_uses?: number | null } = {}) => {
      const { data, error } = await supabase.rpc("create_club_invite_link", {
        _club_id: clubId,
        _expires_in_days: opts.expires_in_days ?? null,
        _max_uses: opts.max_uses ?? null,
      });
      if (error) throw error;
      return data as { token: string };
    },
    onSuccess: () => {
      toast.success("Link de convite criado");
      queryClient.invalidateQueries({ queryKey: qk(clubId) });
    },
    onError: (e: any) => toast.error(e?.message || "Não consegui criar o link"),
  });
}

/** Revoga o link atual. */
export function useRevokeInviteLink(clubId: string) {
  return useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase
        .from("club_invite_links")
        .update({ revoked: true })
        .eq("id", linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Link revogado");
      queryClient.invalidateQueries({ queryKey: qk(clubId) });
    },
  });
}

/** Resgata um token: entra no clube. */
export function useRedeemInviteToken() {
  return useMutation({
    mutationFn: async (token: string) => {
      const { data, error } = await supabase.rpc("redeem_club_invite_token", { _token: token });
      if (error) throw error;
      const row = (data as any[])?.[0];
      if (!row?.success) throw new Error(row?.message || "Convite inválido");
      return row.club_id as string;
    },
  });
}
