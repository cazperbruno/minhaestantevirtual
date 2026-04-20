import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CACHE, qk, queryClient } from "@/lib/query-client";
import { toast } from "sonner";
import { goldenBurst } from "@/lib/confetti";

export interface UserChallenge {
  id: string;
  template_code: string;
  category: "daily" | "weekly" | "epic";
  progress: number;
  target: number;
  xp_reward: number;
  status: "active" | "completed" | "claimed" | "expired";
  expires_at: string;
  template: {
    title: string;
    description: string;
    icon: string;
    metric: string;
  };
}

/** Garante que o usuário tem desafios ativos e devolve a lista. */
export function useChallenges(userId: string | undefined) {
  return useQuery<UserChallenge[]>({
    queryKey: userId ? qk.challenges(userId) : ["challenges", "anon"],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return [];
      // Garantir desafios ativos
      await supabase.rpc("assign_daily_challenges", { _user_id: userId });
      // Recompute progresso
      await supabase.rpc("recompute_challenge_progress", { _user_id: userId });
      // Buscar
      const { data, error } = await supabase
        .from("user_challenges")
        .select("*, template:challenge_templates(title, description, icon, metric)")
        .eq("user_id", userId)
        .in("status", ["active", "completed"])
        .gt("expires_at", new Date().toISOString())
        .order("category")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
    ...CACHE.PERSONAL,
  });
}

export function useClaimChallenge(userId: string) {
  return useMutation({
    mutationFn: async (challengeId: string) => {
      const { data, error } = await supabase.rpc("claim_challenge", {
        _user_id: userId,
        _challenge_id: challengeId,
      });
      if (error) throw error;
      const result = (data as any)?.[0];
      if (!result?.success) throw new Error(result?.message || "claim_failed");
      return result;
    },
    onSuccess: (result) => {
      toast.success(`+${result.xp_granted} XP coletado!`, {
        description: "Próximo desafio te espera",
      });
      queryClient.invalidateQueries({ queryKey: qk.challenges(userId) });
      queryClient.invalidateQueries({ queryKey: ["profile", userId] });
      queryClient.invalidateQueries({ queryKey: qk.ranking() });
    },
    onError: () => toast.error("Não foi possível coletar a recompensa"),
  });
}
