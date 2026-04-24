import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CACHE, qk } from "@/lib/query-client";
import { toast } from "@/hooks/use-toast";

export interface StreakData {
  current_days: number;
  longest_days: number;
  last_active_date: string | null;
  next_milestone: number;
  freezes_available: number;
  last_freeze_used_date: string | null;
}

/**
 * Carrega os dados de streak (sequência diária de leitura) do usuário.
 *
 * Retorna defaults sensatos (0 dias, 1 freeze disponível) se o usuário ainda
 * não tem registro — evita componentes precisarem tratar null no primeiro acesso.
 *
 * @param userId ID do usuário; passa undefined em SSR/loading e o hook fica idle.
 */
export function useStreak(userId: string | undefined) {
  return useQuery<StreakData | null>({
    queryKey: userId ? qk.streak(userId) : ["streak", "anon"],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from("user_streaks")
        .select(
          "current_days, longest_days, last_active_date, next_milestone, freezes_available, last_freeze_used_date",
        )
        .eq("user_id", userId)
        .maybeSingle();
      return (
        (data as StreakData) ?? {
          current_days: 0,
          longest_days: 0,
          last_active_date: null,
          next_milestone: 7,
          freezes_available: 1,
          last_freeze_used_date: null,
        }
      );
    },
    ...CACHE.PERSONAL,
  });
}

/** Consome 1 freeze pra proteger o streak quando o usuário esqueceu de ler. */
export function useStreakFreeze(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("not_authenticated");
      const { data, error } = await supabase.rpc("use_streak_freeze", { _user_id: userId });
      if (error) throw error;
      const row = (data ?? [])[0] as { success: boolean; message: string; freezes_left: number } | undefined;
      if (!row?.success) throw new Error(row?.message ?? "freeze_failed");
      return row;
    },
    onSuccess: (row) => {
      toast({
        title: "🧊 Streak protegido!",
        description: `Sequência mantida. Restam ${row.freezes_left} freezes.`,
      });
      if (userId) qc.invalidateQueries({ queryKey: qk.streak(userId) });
    },
    onError: (err: Error) => {
      const map: Record<string, string> = {
        no_freezes: "Sem freezes disponíveis. Ganhe 1 a cada 7 dias.",
        no_streak: "Você ainda não tem streak ativo.",
        forbidden: "Não autorizado.",
      };
      toast({
        title: "Não foi possível usar o freeze",
        description: map[err.message] ?? err.message,
        variant: "destructive",
      });
    },
  });
}
