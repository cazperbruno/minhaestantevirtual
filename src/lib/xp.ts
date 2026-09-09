// Gamificação segura do cliente.
// O frontend nunca concede XP. Ele apenas lê eventos já concedidos pelo servidor
// para feedback visual e invalida os caches afetados.
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { queryClient, qk } from "@/lib/query-client";
import { emitXpBurst } from "@/components/gamification/XpBurstHost";

export type XpSource =
  | "add_book" | "finish_book" | "rate_book" | "scan_book"
  | "write_review" | "like_review" | "comment_review"
  | "follow" | "club_message" | "club_reaction_received" | "club_mention" | "loan_book"
  | "open_app" | "challenge" | "streak_milestone" | "invite_signup" | "invite_welcome" | "misc";

const SERVER_EVENT_SOURCES = new Set<XpSource>([
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

// Evita reproduzir a mesma animação duas vezes quando múltiplos componentes
// invalidam o mesmo evento em sequência.
const seenXpEventIds = new Set<string>();
const XP_EVENT_LOOKBACK_MS = 5_000;

/**
 * Compatibilidade de UI para os chamadores históricos de `awardXp`.
 *
 * A função NÃO concede pontos. A mutação que acabou de acontecer no banco é que
 * dispara um trigger server-side; aqui apenas verificamos se um xp_event real foi
 * criado e, se foi, exibimos o feedback correspondente uma única vez.
 */
export async function awardXp(
  userId: string,
  source: XpSource,
  _opts: AwardOptions = {},
): Promise<{ leveledUp: boolean; newLevel: number; amount: number } | null> {
  if (!SERVER_EVENT_SOURCES.has(source)) {
    const { error } = await supabase.rpc("recompute_my_challenge_progress" as any);
    if (error) console.error("recompute_my_challenge_progress", error);
    return null;
  }

  const since = new Date(Date.now() - XP_EVENT_LOOKBACK_MS).toISOString();
  const [{ data: event, error: eventError }, { data: profile, error: profileError }] = await Promise.all([
    supabase
      .from("xp_events")
      .select("id,amount,created_at")
      .eq("user_id", userId)
      .eq("source", source)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("level")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  if (eventError) console.error("xp_events feedback", eventError);
  if (profileError) console.error("profile XP feedback", profileError);

  const eventId = event?.id;
  const amount = typeof event?.amount === "number" ? event.amount : 0;
  if (eventId && amount > 0 && !seenXpEventIds.has(eventId)) {
    seenXpEventIds.add(eventId);
    emitXpBurst({ amount, label: labelFor(source), variant: "xp" });
  }

  // Desafios são recalculados a partir de dados persistidos. Nenhuma quantidade
  // ou progresso é enviado pelo cliente.
  void supabase.rpc("recompute_my_challenge_progress" as any).then(({ error }: any) => {
    if (error) console.error("recompute_my_challenge_progress", error);
    void queryClient.invalidateQueries({ queryKey: qk.challenges(userId) });
  });

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["profile", userId] }),
    queryClient.invalidateQueries({ queryKey: qk.ranking() }),
  ]);

  if (!eventId || amount <= 0) return null;

  return {
    // O servidor atualiza o nível de forma atômica. O cliente não tenta inferir
    // level-up a partir de estado possivelmente obsoleto.
    leveledUp: false,
    newLevel: profile?.level ?? 1,
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

/** Atualiza streak diário da própria conta. Chamar 1x por sessão. */
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
