import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CACHE } from "@/lib/query-client";
import type { Book } from "@/types/book";

export type StoryKind = "quote" | "progress" | "milestone" | "recommendation";
export type StoryBg =
  | "gradient-gold"
  | "gradient-night"
  | "gradient-sunset"
  | "gradient-ocean"
  | "gradient-forest";

export interface StoryAuthor {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  story_count: number;
  has_unseen: boolean;
  latest_at: string;
}

export interface StoryRow {
  id: string;
  user_id: string;
  book_id: string | null;
  kind: StoryKind;
  content: string | null;
  bg_color: StoryBg;
  current_page: number | null;
  total_pages: number | null;
  created_at: string;
  expires_at: string;
  book?: Book | null;
}

/** Lista agrupada de autores com stories ativas (próprias + seguidos). */
export function useFollowingStoriesAuthors() {
  const { user } = useAuth();
  return useQuery<StoryAuthor[]>({
    queryKey: ["stories", "authors", user?.id],
    enabled: !!user,
    ...CACHE.LIVE,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.rpc("get_following_stories", { _user_id: user.id });
      if (error) throw error;
      return (data ?? []) as StoryAuthor[];
    },
  });
}

/** Stories ativas de um autor específico (usado pelo viewer). */
export function useAuthorStories(userId: string | null) {
  return useQuery<StoryRow[]>({
    queryKey: ["stories", "author", userId],
    enabled: !!userId,
    ...CACHE.LIVE,
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("stories")
        .select("*, book:books(*)")
        .eq("user_id", userId)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StoryRow[];
    },
  });
}

/** Cria uma nova story (24h TTL automático). */
export function useCreateStory() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      kind: StoryKind;
      content: string;
      bg_color?: StoryBg;
      book_id?: string | null;
      current_page?: number;
      total_pages?: number;
    }) => {
      if (!user) throw new Error("not_authenticated");
      const { data, error } = await supabase
        .from("stories")
        .insert({
          user_id: user.id,
          kind: input.kind,
          content: input.content,
          bg_color: input.bg_color ?? "gradient-gold",
          book_id: input.book_id ?? null,
          current_page: input.current_page ?? null,
          total_pages: input.total_pages ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stories"] });
    },
  });
}

/** Marca uma story como vista. Idempotente. */
export function useMarkStoryViewed() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (storyId: string) => {
      if (!user) return;
      await supabase
        .from("story_views")
        .insert({ story_id: storyId, user_id: user.id })
        .then(() => {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stories", "authors"] });
    },
  });
}
