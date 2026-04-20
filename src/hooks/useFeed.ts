import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CACHE, qk, queryClient } from "@/lib/query-client";
import { awardXp } from "@/lib/xp";
import { haptic } from "@/lib/haptics";
import { toast } from "sonner";

export interface FeedReview {
  id: string;
  user_id: string;
  book_id: string;
  rating: number | null;
  content: string;
  likes_count: number;
  comments_count?: number;
  created_at: string;
  book: any;
  profile: any;
  liked_by_me: boolean;
}

const FEED_PAGE_SIZE = 20;

interface FeedPage {
  items: FeedReview[];
  nextCursor: string | null;
}

/**
 * Feed paginado com cursor por created_at.
 *
 * - 20 resenhas por página.
 * - Cursor estável (timestamp) — evita duplicatas mesmo com inserts em tempo real.
 * - Realtime (useRealtimeInvalidation) invalida o feed inteiro: refetch da
 *   primeira página em background; páginas antigas continuam servidas do cache
 *   até o usuário rolar.
 */
/**
 * Re-rank inteligente da PRIMEIRA página do feed.
 *
 * Busca 2x mais resenhas, calcula score por afinidade (categorias do livro
 * × gosto do usuário) + recência + autores favoritos + tipo de tab,
 * e devolve as TOP N. Páginas seguintes ficam cronológicas (preserva cursor).
 *
 * Custo: 1 query extra a `user_taste` na primeira página, depois cacheada.
 */
async function fetchUserTaste(userId: string): Promise<Map<string, number>> {
  const { data } = await supabase.rpc("user_taste", { _user_id: userId });
  const map = new Map<string, number>();
  (data || []).forEach((t: any) => map.set(t.category, t.weight));
  return map;
}

function scoreReview(
  rev: any,
  taste: Map<string, number>,
  lovedAuthors: Set<string>,
): number {
  // Recência (decay 24h)
  const hoursOld = (Date.now() - new Date(rev.created_at).getTime()) / 3_600_000;
  const recency = Math.exp(-hoursOld / 24);

  // Afinidade por categorias do livro
  let affinity = 0;
  const cats: string[] = rev.book?.categories || [];
  for (const c of cats) affinity += taste.get(c) || 0;
  affinity = Math.min(affinity, 20);

  // Boost: autor amado
  const authors: string[] = rev.book?.authors || [];
  const authorBoost = authors.some((a) => lovedAuthors.has(a)) ? 1.5 : 0;

  // Boost: rating alto na resenha
  const ratingBoost = rev.rating && rev.rating >= 4 ? 0.5 : 0;

  return recency * (1 + affinity * 0.05) * (1 + authorBoost + ratingBoost);
}

export function useFeed(tab: "all" | "following") {
  const { user } = useAuth();
  return useInfiniteQuery<FeedPage>({
    queryKey: [...qk.feed(), tab, user?.id || "anon"],
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    queryFn: async ({ pageParam }) => {
      const isFirstPage = !pageParam;
      let followingIds: string[] = [];
      if (user) {
        const { data: f } = await supabase
          .from("follows").select("following_id").eq("follower_id", user.id);
        followingIds = (f || []).map((x: any) => x.following_id);
      }

      // Primeira página: busca 2x mais para re-rank por relevância
      const fetchSize = isFirstPage && user ? FEED_PAGE_SIZE * 2 : FEED_PAGE_SIZE;

      let q = supabase
        .from("reviews")
        .select("*, book:books(*)")
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(fetchSize);

      if (pageParam) {
        const [cursorTs, cursorId] = (pageParam as string).split("|");
        q = q.or(`created_at.lt.${cursorTs},and(created_at.eq.${cursorTs},id.lt.${cursorId})`);
      }
      if (tab === "following") {
        if (followingIds.length === 0) return { items: [], nextCursor: null };
        q = q.in("user_id", followingIds);
      }

      const { data: revs } = await q;
      const list = revs || [];
      if (list.length === 0) return { items: [], nextCursor: null };

      const userIds = [...new Set(list.map((r: any) => r.user_id))];
      const reviewIds = list.map((r: any) => r.id);

      const [{ data: profs }, { data: myLikes }, taste] = await Promise.all([
        supabase.from("profiles")
          .select("id,display_name,username,avatar_url,level")
          .in("id", userIds),
        user
          ? supabase.from("review_likes")
              .select("review_id").eq("user_id", user.id).in("review_id", reviewIds)
          : Promise.resolve({ data: [] as any[] }),
        // AI: gosto do usuário (só na primeira página, depois irrelevante)
        isFirstPage && user ? fetchUserTaste(user.id) : Promise.resolve(new Map<string, number>()),
      ]);

      const profMap = new Map((profs || []).map((p: any) => [p.id, p]));
      const likedSet = new Set((myLikes || []).map((l: any) => l.review_id));

      let items: FeedReview[] = list.map((r: any) => ({
        ...r,
        profile: profMap.get(r.user_id),
        liked_by_me: likedSet.has(r.id),
      }));

      // AI: re-rank na primeira página (apenas se temos sinal de gosto)
      if (isFirstPage && user && (taste as Map<string, number>).size > 0) {
        // Carrega autores amados (rating>=4) do cache se disponível
        const { data: loved } = await supabase
          .from("user_books")
          .select("book:books(authors)")
          .eq("user_id", user.id)
          .gte("rating", 4)
          .limit(50);
        const lovedAuthors = new Set<string>();
        (loved || []).forEach((ub: any) =>
          (ub.book?.authors || []).forEach((a: string) => lovedAuthors.add(a)),
        );

        items = items
          .map((r) => ({ r, s: scoreReview(r, taste as Map<string, number>, lovedAuthors) }))
          .sort((a, b) => b.s - a.s)
          .slice(0, FEED_PAGE_SIZE)
          .map(({ r }) => r);
      }

      const last = items[items.length - 1];
      // Cursor: usa o created_at mais antigo retornado (não o último do re-rank)
      const oldestInBatch = list[list.length - 1];
      return {
        items,
        nextCursor: list.length >= fetchSize
          ? `${oldestInBatch.created_at}|${oldestInBatch.id}`
          : null,
      };
    },
    ...CACHE.SOCIAL,
    // Polling leve a cada 15s — só refetch quando a aba está visível.
    // Combinado com Realtime + refetchOnWindowFocus, garante feed sempre fresco
    // sem custo perceptível (cache de 30s evita request desnecessário).
    staleTime: 30_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
}

/** Toggle like com optimistic update — atualiza a página correta em cache. */
export function useToggleReviewLike(tab: "all" | "following") {
  const { user } = useAuth();
  const key = [...qk.feed(), tab, user?.id || "anon"];

  return useMutation({
    mutationFn: async (rev: FeedReview) => {
      if (!user) throw new Error("not_authenticated");
      if (rev.liked_by_me) {
        const { error } = await supabase
          .from("review_likes").delete()
          .eq("review_id", rev.id).eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("review_likes").insert({ review_id: rev.id, user_id: user.id });
        if (error) throw error;
        void awardXp(user.id, "like_review", { silent: true });
      }
    },
    onMutate: async (rev) => {
      if (!user) {
        toast.error("Faça login para curtir resenhas");
        throw new Error("not_authenticated");
      }
      haptic("tap");
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<{ pages: FeedPage[]; pageParams: unknown[] }>(key);
      queryClient.setQueryData<{ pages: FeedPage[]; pageParams: unknown[] }>(key, (old) => {
        if (!old) return old as any;
        return {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            items: p.items.map((r) =>
              r.id === rev.id
                ? { ...r, liked_by_me: !rev.liked_by_me, likes_count: r.likes_count + (rev.liked_by_me ? -1 : 1) }
                : r,
            ),
          })),
        };
      });
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
      toast.error("Não conseguimos registrar seu like", {
        description: "Verifique sua conexão e tente novamente.",
      });
    },
  });
}
