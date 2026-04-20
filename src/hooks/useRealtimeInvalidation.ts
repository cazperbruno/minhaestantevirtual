import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { qk, queryClient } from "@/lib/query-client";

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
      // -------- NOTIFICATIONS (sempre minhas, RLS já garante) --------
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: qk.notifications(userId) });
        },
      )
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);
}
