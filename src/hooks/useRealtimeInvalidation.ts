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
          hot(qk.followers(userId));
          const followerId = payload.new?.follower_id || payload.old?.follower_id;
          if (followerId) hot(qk.followState(followerId, userId));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "follows", filter: `follower_id=eq.${userId}` },
        (payload: any) => {
          // HOT: feed/listas que o usuário pode estar vendo após (un)follow
          hot(qk.following(userId));
          hot(qk.followingReads(userId));
          hot(qk.feed());
          // COLD: sugestões raramente estão na tela ativa
          cold(qk.suggestedReaders(userId));
          const targetId = payload.new?.following_id || payload.old?.following_id;
          if (targetId) hot(qk.followState(userId, targetId));
        },
      )
      // NOTE: notifications NÃO está no publication supabase_realtime (segurança).
      // useNotifications faz polling 15s (CACHE.LIVE).
      // -------- REVIEWS --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reviews" },
        (payload: any) => {
          hot(qk.feed());
          const bookId = payload.new?.book_id || payload.old?.book_id;
          if (bookId) hot(qk.reviews(bookId));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "review_likes" },
        () => {
          hot(["reviews"]);
          hot(qk.feed());
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "review_comments" },
        () => {
          hot(["reviews"]);
          hot(qk.feed());
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
            // HOT: telas que provavelmente estão visíveis após mexer na coleção
            hot(qk.library(userId));
            hot(qk.wishlist(userId));
            hot(qk.mySeries(userId));
            hot(qk.followingReads(userId));
            // estado individual do livro (BookDetail aberto)
            if (bookId) hot(qk.userBook(userId, bookId));
            // COLD: agregados/gamificação podem esperar background
            cold(qk.stats(userId));
            cold(qk.nextAchievements(userId));
          }
          // Feed é sempre HOT (visível em qualquer momento)
          hot(qk.feed());
          // Rankings globais → background (raramente abertos)
          cold(qk.seriesRanking());
          cold(qk.ranking());
        },
      )
      // -------- BOOKS --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "books" },
        (payload: any) => {
          const bookId = payload.new?.id || payload.old?.id;
          const seriesId = payload.new?.series_id || payload.old?.series_id;
          // Página de detalhe do livro pode estar aberta → HOT
          if (bookId) hot(qk.book(bookId));
          if (seriesId) {
            hot(qk.mySeries(userId));
            hot(["series", seriesId]);
            cold(qk.seriesRanking());
          }
        },
      )
      // -------- SERIES --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "series" },
        (payload: any) => {
          hot(qk.mySeries(userId));
          const seriesId = payload.new?.id || payload.old?.id;
          if (seriesId) hot(["series", seriesId]);
          cold(qk.seriesRanking());
        },
      )
      // -------- LOANS --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "loans", filter: `user_id=eq.${userId}` },
        () => {
          hot(qk.loans(userId));
          hot(qk.library(userId));
        },
      )
      // -------- READING GOALS --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reading_goals", filter: `user_id=eq.${userId}` },
        () => {
          hot(qk.goals(userId));
          cold(qk.stats(userId));
        },
      )
      // -------- PROFILES (próprio + de quem o usuário vê) --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        (payload: any) => {
          const profileId = payload.new?.id || payload.old?.id;
          // HOT: header do perfil reage na hora (chave parcial cobre id e username)
          hot(["profile"]);
          if (profileId === userId) {
            cold(qk.stats(userId));
            cold(qk.streak(userId));
            cold(qk.achievements(userId));
          }
        },
      )
      // -------- ACTIVITIES --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "activities" },
        () => {
          hot(qk.feed());
          hot(qk.followingReads(userId));
        },
      )
      // -------- BUDDY READS (chat ativo → HOT) --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "buddy_read_messages" },
        () => hot(["buddy"]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "buddy_read_participants" },
        () => hot(["buddy"]),
      )
      // -------- CLUB MESSAGES (chat ativo → HOT) --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "club_messages" },
        () => hot(["club"]),
      )
      // -------- STORIES (barra de stories visível no feed → HOT) --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stories" },
        () => hot(qk.stories()),
      )
      // -------- RECOMMENDATIONS --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "book_recommendations" },
        () => {
          hot(qk.feed());
          cold(["recommendations"]);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recommendation_likes" },
        () => cold(["recommendations"]),
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
