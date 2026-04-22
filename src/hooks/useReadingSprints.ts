import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { awardXp } from "@/lib/xp";

export interface SprintRow {
  id: string;
  club_id: string;
  created_by: string;
  duration_minutes: number;
  starts_at: string;
  ends_at: string;
  status: "active" | "finished" | "cancelled";
  finished_at: string | null;
}

export interface SprintParticipantRow {
  sprint_id: string;
  user_id: string;
  joined_at: string;
  pages_start: number;
  pages_end: number | null;
  pages_read: number;
  profile?: {
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  };
}

/** Sprint ativa atual do clube (se houver) e seus participantes — com realtime. */
export function useActiveSprint(clubId: string | undefined) {
  const qc = useQueryClient();

  const sprintQ = useQuery({
    enabled: !!clubId,
    queryKey: ["club-sprint-active", clubId],
    queryFn: async () => {
      const { data } = await supabase
        .from("club_reading_sprints")
        .select("*")
        .eq("club_id", clubId!)
        .eq("status", "active")
        .order("starts_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as SprintRow | null) ?? null;
    },
  });

  const sprintId = sprintQ.data?.id;

  const partsQ = useQuery({
    enabled: !!sprintId,
    queryKey: ["club-sprint-parts", sprintId],
    queryFn: async () => {
      const { data: parts } = await supabase
        .from("club_reading_sprint_participants")
        .select("*")
        .eq("sprint_id", sprintId!);
      const ids = [...new Set((parts || []).map((p) => p.user_id))];
      const { data: profs } = ids.length
        ? await supabase
            .from("profiles")
            .select("id,display_name,username,avatar_url")
            .in("id", ids)
        : { data: [] };
      const m = new Map((profs || []).map((p) => [p.id, p]));
      return (parts || []).map((p) => ({
        ...p,
        profile: m.get(p.user_id) ?? undefined,
      })) as SprintParticipantRow[];
    },
  });

  // Realtime: novas sprints, atualizações de progresso
  useEffect(() => {
    if (!clubId) return;
    const ch = supabase
      .channel(`sprint-${clubId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "club_reading_sprints", filter: `club_id=eq.${clubId}` },
        () => qc.invalidateQueries({ queryKey: ["club-sprint-active", clubId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "club_reading_sprint_participants" },
        (payload) => {
          const sid =
            (payload.new as { sprint_id?: string } | undefined)?.sprint_id ??
            (payload.old as { sprint_id?: string } | undefined)?.sprint_id;
          if (sid) qc.invalidateQueries({ queryKey: ["club-sprint-parts", sid] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [clubId, qc]);

  // Auto-encerra ao expirar (apenas dispara invalidate quando o tempo acaba)
  const [, force] = useState(0);
  useEffect(() => {
    if (!sprintQ.data) return;
    const remaining = new Date(sprintQ.data.ends_at).getTime() - Date.now();
    if (remaining <= 0) return;
    const t = setTimeout(() => force((n) => n + 1), Math.min(remaining + 500, 60_000));
    return () => clearTimeout(t);
  }, [sprintQ.data]);

  return { sprint: sprintQ.data, participants: partsQ.data ?? [], loading: sprintQ.isLoading };
}

export function useStartSprint(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (duration: number) => {
      const { data, error } = await supabase.rpc("start_reading_sprint", {
        _club_id: clubId,
        _duration: duration,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      toast.success("Sprint iniciado! ⏱️", { description: "Boa leitura!" });
      qc.invalidateQueries({ queryKey: ["club-sprint-active", clubId] });
    },
    onError: (e: Error) => toast.error("Não consegui iniciar", { description: e.message }),
  });
}

export function useJoinSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sprintId, userId, pagesStart }: { sprintId: string; userId: string; pagesStart: number }) => {
      const { error } = await supabase
        .from("club_reading_sprint_participants")
        .insert({ sprint_id: sprintId, user_id: userId, pages_start: pagesStart });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["club-sprint-parts", vars.sprintId] });
    },
    onError: (e: Error) => toast.error("Não consegui entrar", { description: e.message }),
  });
}

export function useUpdateSprintProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sprintId, userId, pagesEnd }: { sprintId: string; userId: string; pagesEnd: number }) => {
      const { error } = await supabase
        .from("club_reading_sprint_participants")
        .update({ pages_end: pagesEnd })
        .eq("sprint_id", sprintId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["club-sprint-parts", vars.sprintId] });
      void awardXp(vars.userId, "club_message", { silent: true });
    },
  });
}

export function useFinishSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sprintId: string) => {
      const { error } = await supabase.rpc("finish_reading_sprint", { _sprint_id: sprintId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sprint encerrado");
      qc.invalidateQueries();
    },
  });
}
