import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CACHE, qk } from "@/lib/query-client";
import { toast } from "sonner";

export type SurpriseRarity = "common" | "rare" | "epic" | "legendary";

export interface SurpriseStatus {
  available: boolean;
  last_rarity: SurpriseRarity | null;
  last_book_id: string | null;
  last_bonus_xp: number | null;
}

export interface SurpriseClaim {
  book_id: string | null;
  bonus_xp: number;
  rarity: SurpriseRarity;
  already_claimed: boolean;
  claim_date: string;
}

/** Status da caixa surpresa de hoje (sem abrir). */
export function useSurpriseStatus(userId: string | undefined) {
  return useQuery<SurpriseStatus>({
    queryKey: ["surprise-status", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.rpc("daily_surprise_status");
      const row = (data as any[])?.[0];
      return (
        row ?? { available: true, last_rarity: null, last_book_id: null, last_bonus_xp: null }
      );
    },
    ...CACHE.PERSONAL,
  });
}

/** Abre a caixa do dia. Retorna o livro + raridade + xp bônus. */
export function useOpenSurpriseBox(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<SurpriseClaim, Error, void>({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("open_daily_surprise_box");
      if (error) throw error;
      const row = (data as any[])?.[0];
      if (!row) throw new Error("empty_response");
      return row as SurpriseClaim;
    },
    onSuccess: (claim) => {
      if (!claim.already_claimed) {
        const labels: Record<SurpriseRarity, string> = {
          common: "Comum",
          rare: "Raro!",
          epic: "Épico! 🔥",
          legendary: "LENDÁRIO! 💎",
        };
        toast.success(`Caixa aberta: ${labels[claim.rarity]}`, {
          description: `+${claim.bonus_xp} XP de bônus`,
          duration: 4500,
        });
      }
      qc.invalidateQueries({ queryKey: ["surprise-status", userId] });
      if (userId) {
        qc.invalidateQueries({ queryKey: ["profile", userId] });
        qc.invalidateQueries({ queryKey: qk.ranking() });
      }
    },
  });
}
