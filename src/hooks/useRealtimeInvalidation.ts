import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { qk, queryClient } from "@/lib/query-client";

/** Helper: dispara refetch ativo de queries marcadas como stale. */
function refetchActive() {
  queryClient.invalidateQueries({ refetchType: "active" });
}

/**
 * Stale-while-revalidate via Supabase Realtime.
 *
 * Assina mudanças em tabelas sociais que afetam o usuário logado e invalida
 * as queries correspondentes — o React Query refaz fetch em background sem
 * piscar a UI.
 *
 * Tabelas observadas:
 *  - follows         → quando alguém me segue/deixa de seguir, ou eu sigo/deixo
 *  - notifications   → notificações novas chegando
 *  - reviews         → resenhas novas (afetam feed)
 *  - review_likes    → curtidas em resenhas que me interessam
 *  - review_comments → comentários novos
 *
 * Plug uma vez no AppShell — o canal é único e desinscreve no unmount/logout.
 */
export function useRealtimeInvalidation() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const userId = user.id;

    const channel = supabase
      .channel(`rt:user:${userId}`)
      // -------- FOLLOWS --------
      // Quando alguém me segue (eu sou following_id) → atualiza meus seguidores
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "follows", filter: `following_id=eq.${userId}` },
        (payload: any) => {
          queryClient.invalidateQueries({ queryKey: qk.followers(userId) });
          // estado do botão "Seguir" do outro lado
          const followerId = payload.new?.follower_id || payload.old?.follower_id;
          if (followerId) {
            queryClient.invalidateQueries({ queryKey: qk.followState(followerId, userId) });
          }
        },
      )
      // Quando eu sigo/deixo de seguir alguém → atualiza minha lista
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "follows", filter: `follower_id=eq.${userId}` },
        (payload: any) => {
          queryClient.invalidateQueries({ queryKey: qk.following(userId) });
          queryClient.invalidateQueries({ queryKey: qk.suggestedReaders(userId) });
          const targetId = payload.new?.following_id || payload.old?.following_id;
          if (targetId) {
            queryClient.invalidateQueries({ queryKey: qk.followState(userId, targetId) });
          }
        },
      )
      // NOTE: notifications NÃO está no publication supabase_realtime (removido por
      // segurança na Onda 2.5 — evita broadcast cross-user). A UI atualiza via
      // polling de 15s (CACHE.LIVE) em useNotifications.
      // -------- REVIEWS (qualquer mudança afeta o feed global) --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reviews" },
        (payload: any) => {
          queryClient.invalidateQueries({ queryKey: qk.feed() });
          const bookId = payload.new?.book_id || payload.old?.book_id;
          if (bookId) queryClient.invalidateQueries({ queryKey: qk.reviews(bookId) });
        },
      )
      // -------- REVIEW LIKES & COMMENTS (atualizam contagens nas resenhas) --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "review_likes" },
        (payload: any) => {
          const reviewId = payload.new?.review_id || payload.old?.review_id;
          if (reviewId) {
            // invalida todas as queries de reviews — barato porque é por chave parcial
            queryClient.invalidateQueries({ queryKey: ["reviews"] });
            queryClient.invalidateQueries({ queryKey: qk.feed() });
          }
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
      // Quem é dono do registro precisa ver sua biblioteca atualizada.
      // Quem segue precisa ver o feed atualizado (status_change vira atividade).
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_books" },
        (payload: any) => {
          const ownerId = payload.new?.user_id || payload.old?.user_id;
          if (ownerId === userId) {
            queryClient.invalidateQueries({ queryKey: qk.library(userId) });
            queryClient.invalidateQueries({ queryKey: qk.wishlist(userId) });
            // Minhas séries depende diretamente de user_books → invalida sempre
            queryClient.invalidateQueries({ queryKey: qk.mySeries(userId) });
          }
          // Ranking de séries (colecionador) e ranking global de leitores
          // refletem ações de qualquer usuário — invalidar sempre.
          queryClient.invalidateQueries({ queryKey: qk.seriesRanking() });
          queryClient.invalidateQueries({ queryKey: qk.ranking() });
          // Atividade de qualquer usuário pode aparecer no feed "Seguindo"
          queryClient.invalidateQueries({ queryKey: qk.feed() });
        },
      )
      // -------- BOOKS (novos volumes / series_id atribuído via enriquecimento) --------
      // Quando um livro é criado/atualizado e ganha series_id, a agregação de
      // "Minhas séries" precisa refazer — mesmo sem mudar user_books.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "books" },
        (payload: any) => {
          const seriesId = payload.new?.series_id || payload.old?.series_id;
          if (seriesId) {
            queryClient.invalidateQueries({ queryKey: qk.mySeries(userId) });
            queryClient.invalidateQueries({ queryKey: qk.seriesRanking() });
            queryClient.invalidateQueries({ queryKey: ["series", seriesId] });
          }
        },
      )
      // -------- SERIES (metadados da série: total_volumes, status, capa) --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "series" },
        (payload: any) => {
          queryClient.invalidateQueries({ queryKey: qk.mySeries(userId) });
          queryClient.invalidateQueries({ queryKey: qk.seriesRanking() });
          const seriesId = payload.new?.id || payload.old?.id;
          if (seriesId) {
            queryClient.invalidateQueries({ queryKey: ["series", seriesId] });
          }
        },
      )
      // -------- ACTIVITIES (feed social bruto) --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "activities" },
        () => {
          queryClient.invalidateQueries({ queryKey: qk.feed() });
        },
      )
      // -------- BUDDY READS (mensagens, progresso) --------
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
        () => queryClient.invalidateQueries({ queryKey: ["stories"] }),
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
      .subscribe();

    // Visibility/pageshow: PWA mobile às vezes não dispara `focus` ao retornar
    // do background. Force refetch ativo para garantir UI fresca.
    const onVisible = () => {
      if (document.visibilityState === "visible") refetchActive();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) refetchActive();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [user]);
}
