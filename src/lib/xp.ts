// Gamificação segura do cliente.
// XP não é concedido diretamente pelo frontend: recompensas precisam ser derivadas
// de ações verificadas no servidor para impedir adulteração de amount/source.
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { queryClient, qk } from "@/lib/query-client";
import { emitXpBurst } from "@/components/gamification/XpBurstHost";

export type XpSource =
  | "add_book" | "finish_book" | "rate_book" | "scan_book"
  | "write_review" | "like_review" | "comment_review"
  | "follow" | "club_message" | "club_reaction_received" | "club_mention" | "loan_book"
  | "open_app" | "challenge" | "streak_milestone" | "invite_signup" | "invite_welcome" | "misc";

interface AwardOptions {
  silent?: boolean;
  meta?: Record<string, unknown>;
  amount?: number;
}

/**
 * Compatibilidade temporária durante o hardening P0.
 *
 * O frontend NÃO escolhe mais quantidade/origem de XP. A função permanece com a
 * mesma assinatura para não quebrar os chamadores existentes e apenas solicita
 * recomputação dos desafios a partir dos dados reais já persistidos.
 *
 * Uma onda posterior substituirá esta compatibilidade por comandos server-side
 * idempotentes que validam a ação e calculam a recompensa no servidor.
 */
export async function awardXp(
  userId: string,
  _source: XpSource,
  _opts: AwardOptions = {},
): Promise<{ leveledUp: boolean; newLevel: number; amount: number } | null> {
  const { error } = await supabase.rpc("recompute_challenge_progress", {
    _user_id: userId,
  });

  if (error) {
    console.error("recompute challenge progress", error);
    return null;
  }

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.challenges(userId) }),
    queryClient.invalidateQueries({ queryKey: ["profile", userId] }),
    queryClient.invalidateQueries({ queryKey: qk.ranking() }),
  ]);

  // Sem feedback visual de XP: nenhum XP foi concedido nesta chamada.
  return null;
}

/** Atualiza streak diário ao abrir o app. Chamar 1x por sessão. */
export async function tickStreak(userId: string) {
  const { data, error } = await supabase.rpc("update_streak", { _user_id: userId });
  if (error || !data || !data[0]) return null;

  const { current_days, milestone_hit, bonus_xp } = data[0];
  if (milestone_hit > 0) {
    emitXpBurst({ amount: milestone_hit, variant: "streak", label: "dias de ofensiva!" });
    toast.success(`🔥 ${milestone_hit} dias de ofensiva!`, {
      description: `+${bonus_xp} XP de bônus`,
      duration: 5000,
    });
  }

  return { current_days, milestone_hit, bonus_xp };
}
