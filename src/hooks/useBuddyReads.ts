/**
 * useBuddyReads — gestão de sessões de Buddy Reading.
 * Combina queries (lista + detalhe + mensagens) e mutations (criar, aceitar,
 * recusar, atualizar progresso, enviar mensagem).
 */
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface BuddyReadSummary {
  id: string;
  status: "pending" | "active" | "completed" | "cancelled" | "declined";
  book_id: string;
  book_title: string;
  book_cover: string | null;
  partner_id: string;
  partner_name: string | null;
  partner_avatar: string | null;
  my_percent: number;
  partner_percent: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  is_initiator: boolean;
}

export function useBuddyReads() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["buddy-reads", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<BuddyReadSummary[]> => {
      const { data, error } = await supabase.rpc("get_my_buddy_reads");
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useBuddyRead(buddyId?: string) {
  return useQuery({
    queryKey: ["buddy-read", buddyId],
    enabled: !!buddyId,
    queryFn: async () => {
      const { data: br, error } = await supabase
        .from("buddy_reads")
        .select("*, books(id,title,cover_url,page_count,authors)")
        .eq("id", buddyId!)
        .maybeSingle();
      if (error) throw error;
      const { data: parts } = await supabase
        .from("buddy_read_participants")
        .select("*, profiles:profiles!buddy_read_participants_user_id_fkey(display_name,avatar_url,username)" as any)
        .eq("buddy_read_id", buddyId!);
      // profiles join may not exist via FK; fallback fetch profiles separately
      let participants = parts ?? [];
      if (participants.length && !(participants[0] as any).profiles) {
        const ids = participants.map((p: any) => p.user_id);
        const { data: profs } = await supabase
          .from("profiles").select("id,display_name,avatar_url,username")
          .in("id", ids);
        participants = participants.map((p: any) => ({
          ...p,
          profiles: profs?.find((x) => x.id === p.user_id) ?? null,
        }));
      }
      return { buddy: br, participants };
    },
  });
}

export function useBuddyMessages(buddyId?: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["buddy-messages", buddyId],
    enabled: !!buddyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buddy_read_messages")
        .select("*")
        .eq("buddy_read_id", buddyId!)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Realtime
  useEffect(() => {
    if (!buddyId) return;
    const ch = supabase
      .channel(`buddy-${buddyId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "buddy_read_messages", filter: `buddy_read_id=eq.${buddyId}` },
        () => qc.invalidateQueries({ queryKey: ["buddy-messages", buddyId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "buddy_read_participants", filter: `buddy_read_id=eq.${buddyId}` },
        () => qc.invalidateQueries({ queryKey: ["buddy-read", buddyId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [buddyId, qc]);

  return query;
}

export function useCreateBuddyRead() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { book_id: string; invitee_id: string; message?: string; target_finish_date?: string }) => {
      if (!user?.id) throw new Error("Faça login");
      const { data, error } = await supabase.from("buddy_reads").insert({
        book_id: input.book_id,
        initiator_id: user.id,
        invitee_id: input.invitee_id,
        message: input.message ?? null,
        target_finish_date: input.target_finish_date ?? null,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Convite enviado!");
      qc.invalidateQueries({ queryKey: ["buddy-reads"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao convidar"),
  });
}

export function useAcceptBuddyRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (buddyId: string) => {
      const { data, error } = await supabase.rpc("accept_buddy_read", { _buddy_id: buddyId });
      if (error) throw error;
      const r = (data as any)?.[0];
      if (!r?.success) throw new Error(r?.message ?? "Erro");
      return r;
    },
    onSuccess: () => {
      toast.success("Leitura iniciada!");
      qc.invalidateQueries({ queryKey: ["buddy-reads"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeclineBuddyRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (buddyId: string) => {
      const { error } = await supabase.rpc("decline_buddy_read", { _buddy_id: buddyId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["buddy-reads"] }),
  });
}

export function useUpdateBuddyProgress(buddyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { current_page: number; percent: number }) => {
      const { data, error } = await supabase.rpc("update_buddy_progress", {
        _buddy_id: buddyId,
        _current_page: input.current_page,
        _percent: input.percent,
      });
      if (error) throw error;
      return (data as any)?.[0];
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["buddy-read", buddyId] });
      qc.invalidateQueries({ queryKey: ["buddy-reads"] });
      if (r?.both_finished) toast.success("Vocês terminaram juntos! 🎉 Badge desbloqueado.");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useSendBuddyMessage(buddyId: string) {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (content: string) => {
      if (!user?.id || !content.trim()) return;
      const { error } = await supabase.from("buddy_read_messages").insert({
        buddy_read_id: buddyId, user_id: user.id, content: content.trim(),
      });
      if (error) throw error;
    },
    onError: (e: any) => toast.error(e.message),
  });
}
