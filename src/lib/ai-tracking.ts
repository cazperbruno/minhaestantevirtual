/**
 * AI Tracking — coleta de sinais implícitos para o sistema de recomendação.
 *
 * Filosofia: não bloquear UX. Todos os eventos são fire-and-forget.
 * Falhas são silenciosas (apenas console.warn em dev) — tracking nunca
 * deve quebrar a experiência do usuário.
 */

import { supabase } from "@/integrations/supabase/client";

const isDev = import.meta.env.DEV;

function warn(label: string, err: unknown) {
  if (isDev) console.warn(`[ai-tracking] ${label}:`, err);
}

/**
 * Registra visualização de um livro (deduplicada por hora no servidor).
 * Sinal de interesse leve (peso 0.5).
 */
export async function trackBookView(bookId: string): Promise<void> {
  try {
    await supabase.rpc("track_book_view", { _book_id: bookId });
  } catch (err) {
    warn("trackBookView", err);
  }
}

/**
 * Registra que o usuário descartou uma recomendação.
 * Sinal negativo forte (peso -2.0). Ajusta automaticamente os pesos do usuário.
 */
export async function trackBookDismiss(bookId: string): Promise<void> {
  try {
    await supabase.rpc("track_book_dismiss", { _book_id: bookId });
  } catch (err) {
    warn("trackBookDismiss", err);
  }
}

/**
 * Registra termo de busca. Mantém apenas as últimas 100 buscas por usuário.
 * Usado como boost de afinidade temporário (7 dias).
 */
export async function trackSearch(query: string): Promise<void> {
  if (!query || query.trim().length < 2) return;
  try {
    await supabase.rpc("track_search", { _query: query });
  } catch (err) {
    warn("trackSearch", err);
  }
}

/**
 * Registra clique em uma recomendação (CTR positivo).
 */
export async function trackRecClick(bookId: string): Promise<void> {
  try {
    await supabase.rpc("track_rec_click", { _book_id: bookId });
  } catch (err) {
    warn("trackRecClick", err);
  }
}

/**
 * Registra exibição de N recomendações (denominador do CTR).
 * Chamar quando a lista de recs entra no viewport.
 */
export async function trackRecsShown(count: number): Promise<void> {
  if (!count || count <= 0) return;
  try {
    await supabase.rpc("track_recs_shown", { _count: count });
  } catch (err) {
    warn("trackRecsShown", err);
  }
}

/**
 * Recalcula pesos personalizados (collab/content/trending) com base no CTR
 * do próprio usuário. Chamar periodicamente (ex: 1x por sessão).
 */
export async function recomputeUserWeights(userId: string): Promise<void> {
  try {
    await supabase.rpc("recompute_user_weights", { _user_id: userId });
  } catch (err) {
    warn("recomputeUserWeights", err);
  }
}
