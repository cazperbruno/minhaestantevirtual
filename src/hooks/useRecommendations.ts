import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CACHE, qk, queryClient } from "@/lib/query-client";
import { toast } from "sonner";

export interface FeedRecommendation {
  id: string;
  user_id: string;
  book_id: string;
  message: string | null;
  is_public: boolean;
  likes_count: number;
  comments_count: number;
  created_at: string;
  book: any;
  profile: any;
  liked_by_me: boolean;
}

const REC_PAGE_SIZE = 10;

interface RecPage {
  items: FeedRecommendation[];
  nextCursor: string | null;
}

const recsKey = (uid: string) => ["recommendations", "public", uid];

/** Recomendações públicas paginadas para o topo do feed. */
export function usePublicRecommendations() {
  const { user } = useAuth();
  return useInfiniteQuery<RecPage>({
    queryKey: recsKey(user?.id || "anon"),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from("book_recommendations")
        .select("*, book:books(*)")
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(REC_PAGE_SIZE);
      if (pageParam) q = q.lt("created_at", pageParam as string);

      const { data: recs, error } = await q;
      if (error) throw error;
      const list = recs || [];
      if (list.length === 0) return { items: [], nextCursor: null };

      const userIds = [...new Set(list.map((r: any) => r.user_id))];
      const recIds = list.map((r: any) => r.id);

      const [{ data: profs }, { data: myLikes }] = await Promise.all([
        supabase.from("profiles")
          .select("id,display_name,username,avatar_url,level")
          .in("id", userIds),
        user
          ? supabase.from("recommendation_likes")
              .select("recommendation_id").eq("user_id", user.id).in("recommendation_id", recIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const profMap = new Map((profs || []).map((p: any) => [p.id, p]));
      const likedSet = new Set((myLikes || []).map((l: any) => l.recommendation_id));

      const items: FeedRecommendation[] = list.map((r: any) => ({
        ...r,
        profile: profMap.get(r.user_id),
        liked_by_me: likedSet.has(r.id),
      }));
      return {
        items,
        nextCursor: items.length === REC_PAGE_SIZE ? items[items.length - 1].created_at : null,
      };
    },
    ...CACHE.SOCIAL,
  });
}

/** Toggle like com optimistic update. */
export function useToggleRecommendationLike() {
  const { user } = useAuth();
  const key = recsKey(user?.id || "anon");

  return useMutation({
    mutationFn: async (rec: FeedRecommendation) => {
      if (!user) throw new Error("not_authenticated");
      if (rec.liked_by_me) {
        const { error } = await supabase.from("recommendation_likes")
          .delete().eq("recommendation_id", rec.id).eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("recommendation_likes")
          .insert({ recommendation_id: rec.id, user_id: user.id });
        if (error) throw error;
      }
    },
    onMutate: async (rec) => {
      if (!user) { toast.error("Entre para curtir"); throw new Error("not_authenticated"); }
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<{ pages: RecPage[]; pageParams: unknown[] }>(key);
      queryClient.setQueryData<{ pages: RecPage[]; pageParams: unknown[] }>(key, (old) => {
        if (!old) return old as any;
        return {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            items: p.items.map((r) =>
              r.id === rec.id
                ? { ...r, liked_by_me: !rec.liked_by_me, likes_count: r.likes_count + (rec.liked_by_me ? -1 : 1) }
                : r,
            ),
          })),
        };
      });
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
      toast.error("Não foi possível atualizar o like");
    },
  });
}

/** Cria recomendação via RPC. */
export function useRecommendBook(bookId: string) {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { isPublic: boolean; message: string; recipientIds: string[] }) => {
      if (!user) throw new Error("not_authenticated");
      const { data, error } = await supabase.rpc("recommend_book", {
        _book_id: bookId,
        _is_public: input.isPublic,
        _message: input.message,
        _recipient_ids: input.recipientIds,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.success) throw new Error(row?.message || "failed");
      return row;
    },
    onSuccess: (row, vars) => {
      const xp = row?.xp_granted || 0;
      const txt = vars.isPublic
        ? "Recomendação publicada no feed"
        : `Recomendação enviada${vars.recipientIds.length > 1 ? ` para ${vars.recipientIds.length} pessoas` : ""}`;
      toast.success(txt, { description: xp > 0 ? `+${xp} XP` : undefined });
      if (user) queryClient.invalidateQueries({ queryKey: recsKey(user.id) });
    },
    onError: (e: any) => {
      toast.error("Não foi possível recomendar", { description: e?.message });
    },
  });
}

/** Sugere usuários para envio privado: quem você segue + quem te segue. */
export function useRecipientSuggestions(query: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["rec-recipients", user?.id, query],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const q = query.trim();
      // Base: quem você segue
      const { data: following } = await supabase
        .from("follows").select("following_id").eq("follower_id", user.id);
      const ids = (following || []).map((f: any) => f.following_id);

      let qb = supabase
        .from("profiles")
        .select("id,display_name,username,avatar_url")
        .neq("id", user.id)
        .limit(20);
      if (ids.length > 0 && !q) qb = qb.in("id", ids);
      if (q) qb = qb.or(`display_name.ilike.%${q}%,username.ilike.%${q}%`);
      const { data } = await qb;
      return data || [];
    },
    staleTime: 60_000,
  });
}
