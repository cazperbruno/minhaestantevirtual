import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { qk, queryClient, invalidate } from "@/lib/query-client";

const { hot, cold } = invalidate;

/** Helper: dispara refetch ativo de queries marcadas como stale. */
function refetchActive() {
  queryClient.invalidateQueries({ refetchType: "active" });
}

/**
 * Stale-while-revalidate via Supabase Realtime — sistema de sincronização
 * global no estilo Instagram/WhatsApp/Facebook.
 *
 * Estratégia:
 *   1. Um único canal por usuário escuta TODAS as tabelas relevantes.
 *   2. Cada mudança (INSERT/UPDATE/DELETE) invalida cirurgicamente as queries
 *      afetadas — React Query refaz fetch em background sem piscar a UI.
 *   3. Refetch automático ao retornar para a aba (visibilitychange/pageshow).
 *   4. Fallback de polling: se o canal não conectar em 8s ou cair, faz refetch
 *      ativo a cada 30s — garante que offline → online ou WebSocket bloqueado
 *      não deixe o app preso em dados velhos.
 *
 * Tabelas observadas:
 *   Sociais   : follows, reviews, review_likes, review_comments, activities,
 *               book_recommendations, recommendation_likes, recommendation_comments,
 *               stories
 *   Pessoais  : user_books, books, series, loans, reading_goals, profiles
 *   Realtime  : buddy_read_*, club_messages
 *
 * Plug uma vez no AppShell.
 */
export function useRealtimeInvalidation() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const userId = user.id;

    let channelReady = false;
    let pollingTimer: number | undefined;

    const channel = supabase
      .channel(`rt:user:${userId}`)
      // -------- FOLLOWS --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "follows", filter: `following_id=eq.${userId}` },
        (payload: any) => {
          queryClient.invalidateQueries({ queryKey: qk.followers(userId) });
          const followerId = payload.new?.follower_id || payload.old?.follower_id;
          if (followerId) {
            queryClient.invalidateQueries({ queryKey: qk.followState(followerId, userId) });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "follows", filter: `follower_id=eq.${userId}` },
        (payload: any) => {
          queryClient.invalidateQueries({ queryKey: qk.following(userId) });
          queryClient.invalidateQueries({ queryKey: qk.suggestedReaders(userId) });
          queryClient.invalidateQueries({ queryKey: qk.followingReads(userId) });
          queryClient.invalidateQueries({ queryKey: qk.feed() });
          const targetId = payload.new?.following_id || payload.old?.following_id;
          if (targetId) {
            queryClient.invalidateQueries({ queryKey: qk.followState(userId, targetId) });
          }
        },
      )
      // NOTE: notifications NÃO está no publication supabase_realtime (segurança).
      // useNotifications faz polling 15s (CACHE.LIVE).
      // -------- REVIEWS --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reviews" },
        (payload: any) => {
          queryClient.invalidateQueries({ queryKey: qk.feed() });
          const bookId = payload.new?.book_id || payload.old?.book_id;
          if (bookId) queryClient.invalidateQueries({ queryKey: qk.reviews(bookId) });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "review_likes" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["reviews"] });
          queryClient.invalidateQueries({ queryKey: qk.feed() });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "review_comments" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["reviews"] });
          queryClient.invalidateQueries({ queryKey: qk.feed() });
        },
      )
      // -------- USER_BOOKS (status, rating, current_page) --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_books" },
        (payload: any) => {
          const ownerId = payload.new?.user_id || payload.old?.user_id;
          const bookId = payload.new?.book_id || payload.old?.book_id;
          if (ownerId === userId) {
            queryClient.invalidateQueries({ queryKey: qk.library(userId) });
            queryClient.invalidateQueries({ queryKey: qk.wishlist(userId) });
            queryClient.invalidateQueries({ queryKey: qk.mySeries(userId) });
            queryClient.invalidateQueries({ queryKey: qk.stats(userId) });
            queryClient.invalidateQueries({ queryKey: qk.nextAchievements(userId) });
            queryClient.invalidateQueries({ queryKey: qk.followingReads(userId) });
            // estado individual do livro (BookDetail)
            if (bookId) queryClient.invalidateQueries({ queryKey: qk.userBook(userId, bookId) });
          }
          // Ranking colecionador / global e feed refletem ações de qualquer usuário
          queryClient.invalidateQueries({ queryKey: qk.seriesRanking() });
          queryClient.invalidateQueries({ queryKey: qk.ranking() });
          queryClient.invalidateQueries({ queryKey: qk.feed() });
        },
      )
      // -------- BOOKS --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "books" },
        (payload: any) => {
          const bookId = payload.new?.id || payload.old?.id;
          const seriesId = payload.new?.series_id || payload.old?.series_id;
          if (bookId) queryClient.invalidateQueries({ queryKey: qk.book(bookId) });
          if (seriesId) {
            queryClient.invalidateQueries({ queryKey: qk.mySeries(userId) });
            queryClient.invalidateQueries({ queryKey: qk.seriesRanking() });
            queryClient.invalidateQueries({ queryKey: ["series", seriesId] });
          }
        },
      )
      // -------- SERIES --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "series" },
        (payload: any) => {
          queryClient.invalidateQueries({ queryKey: qk.mySeries(userId) });
          queryClient.invalidateQueries({ queryKey: qk.seriesRanking() });
          const seriesId = payload.new?.id || payload.old?.id;
          if (seriesId) queryClient.invalidateQueries({ queryKey: ["series", seriesId] });
        },
      )
      // -------- LOANS --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "loans", filter: `user_id=eq.${userId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: qk.loans(userId) });
          queryClient.invalidateQueries({ queryKey: qk.library(userId) });
        },
      )
      // -------- READING GOALS --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reading_goals", filter: `user_id=eq.${userId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: qk.goals(userId) });
          queryClient.invalidateQueries({ queryKey: qk.stats(userId) });
        },
      )
      // -------- PROFILES (próprio + de quem o usuário vê) --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        (payload: any) => {
          const profileId = payload.new?.id || payload.old?.id;
          // Sempre invalida queries de profile (chave parcial cobre por id e username)
          queryClient.invalidateQueries({ queryKey: ["profile"] });
          if (profileId === userId) {
            queryClient.invalidateQueries({ queryKey: qk.stats(userId) });
            queryClient.invalidateQueries({ queryKey: qk.streak(userId) });
            queryClient.invalidateQueries({ queryKey: qk.achievements(userId) });
          }
        },
      )
      // -------- ACTIVITIES --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "activities" },
        () => {
          queryClient.invalidateQueries({ queryKey: qk.feed() });
          queryClient.invalidateQueries({ queryKey: qk.followingReads(userId) });
        },
      )
      // -------- BUDDY READS --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "buddy_read_messages" },
        () => queryClient.invalidateQueries({ queryKey: ["buddy"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "buddy_read_participants" },
        () => queryClient.invalidateQueries({ queryKey: ["buddy"] }),
      )
      // -------- CLUB MESSAGES --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "club_messages" },
        () => queryClient.invalidateQueries({ queryKey: ["club"] }),
      )
      // -------- STORIES --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stories" },
        () => queryClient.invalidateQueries({ queryKey: qk.stories() }),
      )
      // -------- RECOMMENDATIONS --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "book_recommendations" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["recommendations"] });
          queryClient.invalidateQueries({ queryKey: qk.feed() });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recommendation_likes" },
        () => queryClient.invalidateQueries({ queryKey: ["recommendations"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recommendation_comments" },
        () => queryClient.invalidateQueries({ queryKey: ["recommendations"] }),
      )
      .subscribe((status) => {
        // SUBSCRIBED → canal OK, desliga polling de fallback
        // CHANNEL_ERROR/TIMED_OUT/CLOSED → liga polling
        if (status === "SUBSCRIBED") {
          channelReady = true;
          if (pollingTimer) {
            clearInterval(pollingTimer);
            pollingTimer = undefined;
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          channelReady = false;
          if (!pollingTimer) {
            // Fallback: refetch ativo a cada 30s enquanto WS estiver fora
            pollingTimer = window.setInterval(refetchActive, 30_000);
          }
        }
      });

    // Se o canal não conectar em 8s, ativa polling preventivo
    const startupGuard = window.setTimeout(() => {
      if (!channelReady && !pollingTimer) {
        pollingTimer = window.setInterval(refetchActive, 30_000);
      }
    }, 8_000);

    // Visibility/pageshow: PWA mobile às vezes não dispara `focus` ao retornar
    const onVisible = () => {
      if (document.visibilityState === "visible") refetchActive();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) refetchActive();
    };
    const onOnline = () => refetchActive();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);

    return () => {
      supabase.removeChannel(channel);
      clearTimeout(startupGuard);
      if (pollingTimer) clearInterval(pollingTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
    };
  }, [user]);
}
