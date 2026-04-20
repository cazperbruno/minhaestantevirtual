import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryClient } from "@/lib/query-client";
import { toast } from "sonner";

export type ClubRequest = {
  id: string;
  club_id: string;
  user_id: string;
  status: "pending" | "approved" | "rejected";
  message: string | null;
  created_at: string;
  profile?: { display_name: string | null; username: string | null; avatar_url: string | null } | null;
};

export type ClubInvitation = {
  id: string;
  club_id: string;
  invitee_id: string;
  invited_by: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
  club?: { id: string; name: string; cover_url: string | null } | null;
};

const qkClubReq = (clubId: string) => ["club-requests", clubId] as const;
const qkClubInv = (clubId: string) => ["club-invitations", clubId] as const;
const qkMyClubInv = (userId?: string) => ["my-club-invitations", userId] as const;
const qkMyClubReq = (userId?: string, clubId?: string) =>
  ["my-club-request", userId, clubId] as const;

/** Pedidos pendentes do clube (visão do dono). */
export function useClubJoinRequests(clubId: string | undefined, isOwner: boolean) {
  return useQuery<ClubRequest[]>({
    queryKey: qkClubReq(clubId || ""),
    enabled: !!clubId && isOwner,
    queryFn: async () => {
      const { data: reqs } = await supabase
        .from("club_join_requests")
        .select("*")
        .eq("club_id", clubId!)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      const ids = [...new Set((reqs || []).map((r: any) => r.user_id))];
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id,display_name,username,avatar_url").in("id", ids)
        : { data: [] as any[] };
      const map = new Map((profs || []).map((p: any) => [p.id, p]));
      return (reqs || []).map((r: any) => ({ ...r, profile: map.get(r.user_id) || null }));
    },
  });
}

/** Convites enviados (visão do dono/membro). */
export function useClubInvitations(clubId: string | undefined, isOwner: boolean) {
  return useQuery<ClubInvitation[]>({
    queryKey: qkClubInv(clubId || ""),
    enabled: !!clubId && isOwner,
    queryFn: async () => {
      const { data } = await supabase
        .from("club_invitations")
        .select("*")
        .eq("club_id", clubId!)
        .order("created_at", { ascending: false });
      return (data || []) as ClubInvitation[];
    },
  });
}

/** Estado da minha solicitação para um clube. */
export function useMyJoinRequest(userId: string | undefined, clubId: string | undefined) {
  return useQuery<ClubRequest | null>({
    queryKey: qkMyClubReq(userId, clubId),
    enabled: !!userId && !!clubId,
    queryFn: async () => {
      const { data } = await supabase
        .from("club_join_requests")
        .select("*")
        .eq("club_id", clubId!)
        .eq("user_id", userId!)
        .maybeSingle();
      return (data as ClubRequest) || null;
    },
  });
}

/** Convites recebidos pelo usuário. */
export function useMyInvitations(userId: string | undefined) {
  return useQuery<ClubInvitation[]>({
    queryKey: qkMyClubInv(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("club_invitations")
        .select("*, club:book_clubs(id,name,cover_url)")
        .eq("invitee_id", userId!)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      return (data || []) as ClubInvitation[];
    },
  });
}

export function useRequestJoin(clubId: string, userId?: string) {
  return useMutation({
    mutationFn: async (message: string | null) => {
      if (!userId) throw new Error("not_authenticated");
      const { error } = await supabase
        .from("club_join_requests")
        .insert({ club_id: clubId, user_id: userId, message: message || null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação enviada!", { description: "O administrador será notificado." });
      queryClient.invalidateQueries({ queryKey: qkMyClubReq(userId, clubId) });
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível solicitar"),
  });
}

export function useApproveRequest(clubId: string) {
  return useMutation({
    mutationFn: async (requestId: string) => {
      const { data, error } = await supabase.rpc("approve_club_request", { _request_id: requestId });
      if (error) throw error;
      const row = (data as any[])?.[0];
      if (!row?.success) throw new Error(row?.message || "Erro");
    },
    onSuccess: () => {
      toast.success("Pedido aprovado!");
      queryClient.invalidateQueries({ queryKey: qkClubReq(clubId) });
      queryClient.invalidateQueries({ queryKey: ["club-detail", clubId] });
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao aprovar"),
  });
}

export function useRejectRequest(clubId: string) {
  return useMutation({
    mutationFn: async (requestId: string) => {
      const { data, error } = await supabase.rpc("reject_club_request", { _request_id: requestId });
      if (error) throw error;
      const row = (data as any[])?.[0];
      if (!row?.success) throw new Error(row?.message || "Erro");
    },
    onSuccess: () => {
      toast.success("Pedido recusado");
      queryClient.invalidateQueries({ queryKey: qkClubReq(clubId) });
    },
  });
}

export function useInviteToClub(clubId: string, invitedBy?: string) {
  return useMutation({
    mutationFn: async (inviteeId: string) => {
      if (!invitedBy) throw new Error("not_authenticated");
      const { error } = await supabase
        .from("club_invitations")
        .insert({ club_id: clubId, invitee_id: inviteeId, invited_by: invitedBy });
      if (error) throw error;
      // Notificação ao convidado
      await supabase.from("notifications").insert({
        user_id: inviteeId,
        kind: "club_invitation",
        title: "Você foi convidado para um clube",
        body: "Aceite o convite para participar das discussões.",
        link: `/clubes/${clubId}`,
      });
    },
    onSuccess: () => {
      toast.success("Convite enviado!");
      queryClient.invalidateQueries({ queryKey: qkClubInv(clubId) });
    },
    onError: (e: any) => {
      const msg = e?.message?.includes("duplicate") ? "Esse leitor já foi convidado" : (e?.message || "Erro");
      toast.error(msg);
    },
  });
}

export function useAcceptInvitation(userId?: string) {
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const { data, error } = await supabase.rpc("accept_club_invitation", { _invitation_id: invitationId });
      if (error) throw error;
      const row = (data as any[])?.[0];
      if (!row?.success) throw new Error(row?.message || "Erro");
      return row.club_id as string;
    },
    onSuccess: () => {
      toast.success("Você entrou no clube!");
      queryClient.invalidateQueries({ queryKey: qkMyClubInv(userId) });
    },
  });
}

export function useDeclineInvitation(userId?: string) {
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await supabase.rpc("decline_club_invitation", { _invitation_id: invitationId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qkMyClubInv(userId) });
    },
  });
}
