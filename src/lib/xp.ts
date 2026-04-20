// Sistema unificado de XP: chama add_xp no servidor, dispara burst animado +XP, e checa level-up.
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { queryClient, qk } from "@/lib/query-client";
import { emitXpBurst } from "@/components/gamification/XpBurstHost";

export type XpSource =
  | "add_book" | "finish_book" | "rate_book" | "scan_book"
  | "write_review" | "like_review" | "comment_review"
  | "follow" | "club_message" | "loan_book"
  | "open_app" | "challenge" | "streak_milestone" | "invite_signup" | "invite_welcome" | "misc";

export const XP_TABLE: Partial<Record<XpSource, number>> = {
  add_book: 10,
  finish_book: 50,
  rate_book: 15,
  scan_book: 8,
  write_review: 30,
  like_review: 2,
  comment_review: 5,
  follow: 5,
  club_message: 3,
  loan_book: 20,
  open_app: 5,
};

interface AwardOptions {
  silent?: boolean;
  meta?: Record<string, any>;
  amount?: number;
}

/**
 * Concede XP por uma ação. Dispara toast animado e checa achievements/desafios em background.
 * Retorna true se subiu de nível.
 */
export async function awardXp(
  userId: string,
  source: XpSource,
  opts: AwardOptions = {},
): Promise<{ leveledUp: boolean; newLevel: number; amount: number } | null> {
  const amount = opts.amount ?? XP_TABLE[source] ?? 0;
  if (amount <= 0) return null;

  const { data, error } = await supabase.rpc("add_xp", {
    _user_id: userId,
    _amount: amount,
    _source: source,
    _meta: opts.meta ?? null,
  });
  if (error || !data || !data[0]) {
    console.error("awardXp", error);
    return null;
  }
  const { new_level, leveled_up } = data[0];

  // Burst visual SEMPRE — funciona inclusive com silent (overlay sutil sem toast)
  emitXpBurst({ amount, label: labelFor(source), variant: "xp" });
  if (!opts.silent) {
    // Toast só nas ações relevantes — burst já dá feedback rápido
  }
  if (leveled_up) {
    emitXpBurst({ amount: new_level, variant: "level", label: "Subiu de nível!" });
    toast.success(`🎉 Nível ${new_level}!`, {
      description: "Você evoluiu como leitor",
      duration: 4000,
    });
  }

  // Recompute + invalidar caches relevantes em background (não-bloqueante)
  void supabase.rpc("recompute_challenge_progress", { _user_id: userId }).then(() => {
    queryClient.invalidateQueries({ queryKey: qk.challenges(userId) });
    queryClient.invalidateQueries({ queryKey: ["profile", userId] });
    queryClient.invalidateQueries({ queryKey: qk.ranking() });
  });

  return { leveledUp: leveled_up, newLevel: new_level, amount };
}

function labelFor(source: XpSource): string {
  const map: Record<string, string> = {
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
    challenge: "Desafio completado",
    streak_milestone: "Marco de ofensiva!",
    invite_signup: "Amigo convidado entrou",
    invite_welcome: "Bem-vindo ao Readify",
    misc: "+XP",
  };
  return map[source] ?? "+XP";
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
