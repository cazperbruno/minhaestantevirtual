import { QueryClient } from "@tanstack/react-query";

/**
 * Cache tiers — uma única fonte de verdade.
 *
 * - CATALOG  → dados imutáveis (livros, autores, OpenLibrary). 24h.
 * - SOCIAL   → reviews, follows, feed, ranking. 5min.
 * - PERSONAL → biblioteca/wishlist do usuário. 1min.
 * - LIVE     → notificações, mensagens. 15s.
 */
export const CACHE = {
  CATALOG: { staleTime: 1000 * 60 * 60 * 24, gcTime: 1000 * 60 * 60 * 24 * 7 },
  SOCIAL: { staleTime: 1000 * 60 * 5, gcTime: 1000 * 60 * 30 },
  PERSONAL: { staleTime: 1000 * 60, gcTime: 1000 * 60 * 30 },
  LIVE: { staleTime: 1000 * 15, gcTime: 1000 * 60 * 5 },
} as const;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      ...CACHE.SOCIAL, // padrão razoável
      // Refetch ao voltar para a aba/reconectar — mantém dados frescos sem polling.
      // Combinado com Realtime (useRealtimeInvalidation), garante UI atualizada
      // tanto em desktop quanto em PWA mobile (visibilitychange listener).
      refetchOnWindowFocus: true,
      refetchOnReconnect: "always",
      refetchOnMount: true,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});

/** Chaves estáveis para todo o app — facilita invalidação cirúrgica. */
export const qk = {
  // catálogo
  book: (id: string) => ["book", id] as const,
  bookSearch: (q: string) => ["book", "search", q] as const,

  // pessoal
  library: (userId?: string) => ["library", userId] as const,
  wishlist: (userId?: string) => ["wishlist", userId] as const,
  profile: (idOrUsername: string) => ["profile", idOrUsername] as const,
  mySeries: (userId?: string) => ["my-series", userId || "anon"] as const,
  seriesRanking: () => ["series-ranking"] as const,
  series: (id: string, userId?: string) => ["series", id, userId || "anon"] as const,
  userBook: (userId: string | undefined, bookId: string) =>
    ["user-book", userId || "anon", bookId] as const,
  loans: (userId?: string) => ["loans", userId] as const,
  goals: (userId?: string) => ["goals", userId] as const,
  stats: (userId?: string) => ["stats", userId] as const,

  // social
  reviews: (bookId: string) => ["reviews", bookId] as const,
  feed: () => ["feed"] as const,
  ranking: () => ["ranking"] as const,
  followers: (userId: string) => ["followers", userId] as const,
  following: (userId: string) => ["following", userId] as const,
  followState: (viewerId: string, targetId: string) =>
    ["follow-state", viewerId, targetId] as const,
  suggestedReaders: (userId: string) => ["suggested-readers", userId] as const,
  followingReads: (userId?: string) => ["following-reads", userId] as const,
  stories: () => ["stories"] as const,

  // live
  notifications: (userId: string) => ["notifications", userId] as const,

  // gamificação
  challenges: (userId: string) => ["challenges", userId] as const,
  streak: (userId: string) => ["streak", userId] as const,
  achievements: (userId?: string) => ["achievements", userId] as const,
  nextAchievements: (userId?: string) => ["nextAchievements", userId || "anon"] as const,
  invite: (userId: string) => ["invite", userId] as const,
  ambassadors: () => ["ambassadors"] as const,
  weeklyRanking: () => ["weekly-ranking"] as const,
  xpHistory: (userId: string) => ["xp-history", userId] as const,
  myRank: (userId?: string) => ["my-rank", userId] as const,
} as const;

/**
 * Invalida grupos relacionados de uma só vez.
 * Use após mutações que afetam múltiplas telas.
 *
 * Estratégia de prioridade (Instagram/Netflix style):
 *   - HOT  → o que o usuário VÊ agora (feed, biblioteca, prateleiras, séries,
 *            perfil, livro aberto). Refetch IMEDIATO via `refetchType: "active"`.
 *   - COLD → dados de telas que o usuário não está olhando (rankings globais,
 *            achievements agregados, sugestões). Apenas marca como stale e
 *            refetch fica adiado para `requestIdleCallback` ou para quando
 *            o usuário navegar para essa tela.
 */
function idle(cb: () => void) {
  const ric = (globalThis as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined;
  if (ric) ric(cb, { timeout: 1500 });
  else setTimeout(cb, 250);
}

/** HOT: refetch imediato para queries ativas (visíveis na tela). */
function hot(queryKey: readonly unknown[]) {
  queryClient.invalidateQueries({ queryKey: queryKey as any, refetchType: "active" });
}

/** COLD: marca stale agora, refetch quando ocioso (ou no próximo mount). */
function cold(queryKey: readonly unknown[]) {
  queryClient.invalidateQueries({ queryKey: queryKey as any, refetchType: "none" });
  idle(() => {
    queryClient.invalidateQueries({ queryKey: queryKey as any, refetchType: "active" });
  });
}

export const invalidate = {
  library: (userId?: string) => {
    // HOT — telas que o usuário provavelmente está vendo após mexer na coleção
    hot(qk.library(userId));
    hot(qk.wishlist(userId));
    hot(qk.mySeries(userId));
    hot(qk.feed());
    hot(qk.followingReads(userId));
    hot(["user-book", userId]);
    // COLD — agregados / rankings que podem esperar background
    cold(qk.stats(userId));
    cold(qk.seriesRanking());
    cold(qk.ranking());
    if (userId) cold(qk.nextAchievements(userId));
  },
  follow: (viewerId: string, targetId: string) => {
    // HOT — botão de follow + listas visíveis
    hot(qk.followState(viewerId, targetId));
    hot(qk.followers(targetId));
    hot(qk.following(viewerId));
    hot(qk.feed());
    hot(qk.followingReads(viewerId));
    // COLD — sugestões de leitores raramente estão na tela ativa
    cold(qk.suggestedReaders(viewerId));
  },
  reviews: (bookId: string) => {
    hot(qk.reviews(bookId));
    hot(qk.feed());
  },
  profile: (userId: string) => {
    // HOT — header do perfil reage na hora
    hot(["profile"]);
    cold(qk.stats(userId));
    cold(qk.achievements(userId));
  },
  all: () => queryClient.invalidateQueries(),
  // Helpers expostos para uso direto pelo realtime hook
  hot,
  cold,
};
