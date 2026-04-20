import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CACHE, qk, queryClient } from "@/lib/query-client";
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

/**
 * Feed de resenhas — global ou só de quem o usuário segue.
 * Cache SOCIAL (5min) + invalidação realtime via useRealtimeInvalidation.
 */
export function useFeed(tab: "all" | "following") {
  const { user } = useAuth();
  return useQuery<FeedReview[]>({
    queryKey: [...qk.feed(), tab, user?.id || "anon"],
    queryFn: async () => {
      let followingIds: string[] = [];
      if (user) {
        const { data: f } = await supabase
          .from("follows").select("following_id").eq("follower_id", user.id);
        followingIds = (f || []).map((x: any) => x.following_id);
      }

      let q = supabase
        .from("reviews")
        .select("*, book:books(*)")
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(50);

      if (tab === "following") {
        if (followingIds.length === 0) return [];
        q = q.in("user_id", followingIds);
      }

      const { data: revs } = await q;
      const list = revs || [];
      if (list.length === 0) return [];

      const userIds = [...new Set(list.map((r: any) => r.user_id))];
      const reviewIds = list.map((r: any) => r.id);

      const [{ data: profs }, { data: myLikes }] = await Promise.all([
        supabase.from("profiles")
          .select("id,display_name,username,avatar_url,level")
          .in("id", userIds),
        user
          ? supabase.from("review_likes")
              .select("review_id").eq("user_id", user.id).in("review_id", reviewIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const profMap = new Map((profs || []).map((p: any) => [p.id, p]));
      const likedSet = new Set((myLikes || []).map((l: any) => l.review_id));

      return list.map((r: any) => ({
        ...r,
        profile: profMap.get(r.user_id),
        liked_by_me: likedSet.has(r.id),
      }));
    },
    ...CACHE.SOCIAL,
  });
}

/** Toggle like com optimistic update na lista do feed em cache. */
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
      }
    },
    onMutate: async (rev) => {
      if (!user) {
        toast.error("Entre para curtir");
        throw new Error("not_authenticated");
      }
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<FeedReview[]>(key);
      queryClient.setQueryData<FeedReview[]>(key, (old) =>
        (old || []).map((r) =>
          r.id === rev.id
            ? { ...r, liked_by_me: !rev.liked_by_me, likes_count: r.likes_count + (rev.liked_by_me ? -1 : 1) }
            : r,
        ),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
      toast.error("Não foi possível atualizar o like");
    },
  });
}
