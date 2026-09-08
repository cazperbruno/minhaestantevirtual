// Gamificação segura do cliente.
// O frontend nunca escolhe user_id, quantidade nem evidência de XP.
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { queryClient, qk } from "@/lib/query-client";
import { emitXpBurst } from "@/components/gamification/XpBurstHost";
import { goldenBurst } from "@/lib/confetti";

export type XpSource =
  | "add_book" | "finish_book" | "rate_book" | "scan_book"
  | "write_review" | "like_review" | "comment_review"
  | "follow" | "club_message" | "club_reaction_received" | "club_mention" | "loan_book"
  | "open_app" | "challenge" | "streak_milestone" | "invite_signup" | "invite_welcome" | "misc";

const CLIENT_AWARDABLE = new Set<XpSource>([
  "add_book",
  "finish_book",
  "rate_book",
  "scan_book",
  "write_review",
  "like_review",
  "comment_review",
  "follow",
  "club_message",
  "loan_book",
  "open_app",
]);

interface AwardOptions {
  silent?: boolean;
  meta?: Record<string, unknown>;
  /** @deprecated O cliente não controla mais quantidade de XP. */
  amount?: number;
}

/**
 * Pede ao banco para premiar a ação persistida mais recente e ainda não premiada
 * da própria conta. `userId` permanece apenas para invalidação de cache; nunca é
 * enviado ao servidor. `opts.amount`/`opts.meta` não participam da autorização.
 */
export async function awardXp(
  userId: string,
  source: XpSource,
  _opts: AwardOptions = {},
): Promise<{ leveledUp: boolean; newLevel: number; amount: number } | null> {
  if (!CLIENT_AWARDABLE.has(source)) {
    const { error } = await supabase.rpc("recompute_my_challenge_progress" as any);
    if (error) console.error("recompute_my_challenge_progress", error);
    return null;
  }

  const { data, error } = await supabase.rpc("award_my_xp" as any, {
    _source: source,
  });

  if (error || !data || !(data as any[])[0]) {
    console.error("award_my_xp", error);
    return null;
  }

  const result = (data as any[])[0] as {
    new_xp: number;
    new_level: number;
    leveled_up: boolean;
    awarded_amount: number;
  };

  const amount = Math.max(0, Number(result.awarded_amount) || 0);
  if (amount > 0) {
    emitXpBurst({ amount, label: labelFor(source), variant: "xp" });
  }

  if (result.leveled_up) {
    emitXpBurst({ amount: result.new_level, variant: "level", label: "Subiu de nível!" });
    goldenBurst();
    toast.success(`🎉 Nível ${result.new_level}!`, {
      description: "Você evoluiu como leitor",
      duration: 4000,
    });
  }

  void supabase.rpc("recompute_my_challenge_progress" as any).then(({ error: recomputeError }: any) => {
    if (recomputeError) console.error("recompute_my_challenge_progress", recomputeError);
    void queryClient.invalidateQueries({ queryKey: qk.challenges(userId) });
  });

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["profile", userId] }),
    queryClient.invalidateQueries({ queryKey: qk.ranking() }),
  ]);

  return {
    leveledUp: result.leveled_up,
    newLevel: result.new_level,
    amount,
  };
}

function labelFor(source: XpSource): string {
  const map: Partial<Record<XpSource, string>> = {
    add_book: "Livro adicionado",
    finish_book: "Leitura concluída",
    rate_book: "Avaliação registrada",
    scan_book: "Scanner usado",
    write_review: "Resenha publicada",
    like_review: "Curtida no feed",
    comment_review: "Comentário no feed",
    follow: "Novo leitor seguido",
    club_message: "Mensagem no clube",
    loan_book: "Empréstimo registrado",
    open_app: "Visita diária",
  };
  return map[source] ?? "+XP";
}

/** Atualiza streak diário da própria conta. */
export async function tickStreak(_userId: string) {
  const { data, error } = await supabase.rpc("update_my_streak" as any);
  if (error || !data || !(data as any[])[0]) return null;

  const { current_days, milestone_hit, bonus_xp } = (data as any[])[0];
  if (milestone_hit > 0) {
    emitXpBurst({ amount: milestone_hit, variant: "streak", label: "dias de ofensiva!" });
    toast.success(`🔥 ${milestone_hit} dias de ofensiva!`, {
      description: `+${bonus_xp} XP de bônus`,
      duration: 5000,
    });
  }

  return { current_days, milestone_hit, bonus_xp };
}
