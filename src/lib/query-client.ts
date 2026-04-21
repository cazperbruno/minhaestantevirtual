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

  // social
  reviews: (bookId: string) => ["reviews", bookId] as const,
  feed: () => ["feed"] as const,
  ranking: () => ["ranking"] as const,
  followers: (userId: string) => ["followers", userId] as const,
  following: (userId: string) => ["following", userId] as const,
  followState: (viewerId: string, targetId: string) =>
    ["follow-state", viewerId, targetId] as const,
  suggestedReaders: (userId: string) => ["suggested-readers", userId] as const,

  // live
  notifications: (userId: string) => ["notifications", userId] as const,

  // gamificação
  challenges: (userId: string) => ["challenges", userId] as const,
  streak: (userId: string) => ["streak", userId] as const,
  invite: (userId: string) => ["invite", userId] as const,
  ambassadors: () => ["ambassadors"] as const,
  weeklyRanking: () => ["weekly-ranking"] as const,
  xpHistory: (userId: string) => ["xp-history", userId] as const,
} as const;

/**
 * Invalida grupos relacionados de uma só vez.
 * Use após mutações que afetam múltiplas telas.
 */
export const invalidate = {
  library: (userId?: string) => {
    queryClient.invalidateQueries({ queryKey: qk.library(userId) });
    queryClient.invalidateQueries({ queryKey: qk.wishlist(userId) });
    queryClient.invalidateQueries({ queryKey: qk.mySeries(userId) });
    queryClient.invalidateQueries({ queryKey: qk.seriesRanking() });
    queryClient.invalidateQueries({ queryKey: qk.ranking() });
    queryClient.invalidateQueries({ queryKey: qk.feed() });
  },
  follow: (viewerId: string, targetId: string) => {
    queryClient.invalidateQueries({ queryKey: qk.followState(viewerId, targetId) });
    queryClient.invalidateQueries({ queryKey: qk.followers(targetId) });
    queryClient.invalidateQueries({ queryKey: qk.following(viewerId) });
    queryClient.invalidateQueries({ queryKey: qk.suggestedReaders(viewerId) });
  },
  reviews: (bookId: string) => {
    queryClient.invalidateQueries({ queryKey: qk.reviews(bookId) });
    queryClient.invalidateQueries({ queryKey: qk.feed() });
  },
  all: () => queryClient.invalidateQueries(),
};
