import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { qk, queryClient, CACHE } from "@/lib/query-client";
import { haptic } from "@/lib/haptics";
import { toast } from "sonner";

export type ActivityKind =
  | "book_added"
  | "started_reading"
  | "finished_reading"
  | "book_rated"
  | "followed_user"
  | "completed_series"
  | "leveled_up"
  | "ranked_up"
  | "book_lent";

export interface ActivityItem {
  id: string;
  user_id: string;
  kind: ActivityKind;
  book_id: string | null;
  target_user_id: string | null;
  meta: any;
  is_public: boolean;
  created_at: string;
  likes_count: number;
  comments_count: number;
  liked_by_me: boolean;
  profile?: any;
  book?: any;
  target_profile?: any;
}

const PAGE_SIZE = 20;

interface Page {
  items: ActivityItem[];
  nextCursor: string | null;
}

export function useActivityFeed(tab: "all" | "following" | "you") {
  const { user } = useAuth();

  return useInfiniteQuery<Page>({
    queryKey: [...qk.feed(), "activities", tab, user?.id || "anon"],
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    queryFn: async ({ pageParam }) => {
      // Carrega ids para tab "following"
      let followingIds: string[] = [];
      if (user && tab === "following") {
        const { data: f } = await supabase
          .from("follows").select("following_id").eq("follower_id", user.id);
        followingIds = (f || []).map((x: any) => x.following_id);
        if (followingIds.length === 0) return { items: [], nextCursor: null };
      }

      let q = supabase
        .from("activities")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE_SIZE);

      if (tab === "you") {
        if (!user) return { items: [], nextCursor: null };
        q = q.eq("user_id", user.id);
      } else {
        q = q.eq("is_public", true);
        if (tab === "following") q = q.in("user_id", followingIds);
      }

      if (pageParam) {
        const [ts, id] = (pageParam as string).split("|");
        q = q.or(`created_at.lt.${ts},and(created_at.eq.${ts},id.lt.${id})`);
      }

      const { data: rows, error } = await q;
      if (error) throw error;
      const list = (rows || []) as any[];
      if (list.length === 0) return { items: [], nextCursor: null };

      const userIds = [...new Set(list.map((a) => a.user_id))];
      const targetUserIds = [...new Set(list.map((a) => a.target_user_id).filter(Boolean))];
      const bookIds = [...new Set(list.map((a) => a.book_id).filter(Boolean))];
      const ids = list.map((a) => a.id);

      const [{ data: profs }, { data: targets }, { data: books }, { data: myLikes }] = await Promise.all([
        userIds.length
          ? supabase.from("profiles").select("id,display_name,username,avatar_url,level").in("id", userIds)
          : Promise.resolve({ data: [] as any[] }),
        targetUserIds.length
          ? supabase.from("profiles").select("id,display_name,username,avatar_url").in("id", targetUserIds as string[])
          : Promise.resolve({ data: [] as any[] }),
        bookIds.length
          ? supabase.from("books").select("*").in("id", bookIds as string[])
          : Promise.resolve({ data: [] as any[] }),
        user
          ? supabase.from("activity_likes").select("activity_id").eq("user_id", user.id).in("activity_id", ids)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const pm = new Map((profs || []).map((p: any) => [p.id, p]));
      const tm = new Map((targets || []).map((p: any) => [p.id, p]));
      const bm = new Map((books || []).map((b: any) => [b.id, b]));
      const liked = new Set((myLikes || []).map((l: any) => l.activity_id));

      const items: ActivityItem[] = list.map((a) => ({
        ...a,
        profile: pm.get(a.user_id),
        target_profile: a.target_user_id ? tm.get(a.target_user_id) : undefined,
        book: a.book_id ? bm.get(a.book_id) : undefined,
        liked_by_me: liked.has(a.id),
      }));

      const oldest = list[list.length - 1];
      return {
        items,
        nextCursor: list.length >= PAGE_SIZE ? `${oldest.created_at}|${oldest.id}` : null,
      };
    },
    ...CACHE.SOCIAL,
    staleTime: 20_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

/** Toggle like otimista em uma activity. */
export function useToggleActivityLike(tab: "all" | "following" | "you") {
  const { user } = useAuth();
  const key = [...qk.feed(), "activities", tab, user?.id || "anon"];

  return useMutation({
    mutationFn: async (act: ActivityItem) => {
      if (!user) throw new Error("not_authenticated");
      if (act.liked_by_me) {
        const { error } = await supabase.from("activity_likes")
          .delete().eq("activity_id", act.id).eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("activity_likes")
          .insert({ activity_id: act.id, user_id: user.id });
        if (error) throw error;
      }
    },
    onMutate: async (act) => {
      if (!user) {
        toast.error("Faça login para curtir");
        throw new Error("not_authenticated");
      }
      haptic("tap");
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<{ pages: Page[]; pageParams: unknown[] }>(key);
      queryClient.setQueryData<{ pages: Page[]; pageParams: unknown[] }>(key, (old) => {
        if (!old) return old as any;
        return {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            items: p.items.map((a) =>
              a.id === act.id
                ? {
                    ...a,
                    liked_by_me: !act.liked_by_me,
                    likes_count: a.likes_count + (act.liked_by_me ? -1 : 1),
                  }
                : a,
            ),
          })),
        };
      });
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
      toast.error("Não conseguimos registrar seu like");
    },
  });
}
