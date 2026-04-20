import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CACHE, qk, queryClient, invalidate } from "@/lib/query-client";
import { awardXp } from "@/lib/xp";
import { haptic } from "@/lib/haptics";
import { toast } from "sonner";

/** Estado de "estou seguindo este usuário?" — cacheado. */
export function useFollowState(targetUserId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.followState(user?.id || "anon", targetUserId || ""),
    queryFn: async () => {
      if (!user || !targetUserId) return false;
      const { data } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("follower_id", user.id)
        .eq("following_id", targetUserId)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user && !!targetUserId && user.id !== targetUserId,
    ...CACHE.SOCIAL,
  });
}

/** Toggle follow/unfollow com optimistic update. */
export function useToggleFollow(targetUserId: string) {
  const { user } = useAuth();
  const stateKey = qk.followState(user?.id || "anon", targetUserId);

  return useMutation({
    mutationFn: async (currentlyFollowing: boolean) => {
      if (!user) throw new Error("not_authenticated");
      if (currentlyFollowing) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", user.id)
          .eq("following_id", targetUserId);
        if (error) throw error;
        return false;
      }
      const { error } = await supabase
        .from("follows")
        .insert({ follower_id: user.id, following_id: targetUserId });
      if (error) throw error;
      return true;
    },
    onMutate: async (currentlyFollowing) => {
      haptic("toggle");
      await queryClient.cancelQueries({ queryKey: stateKey });
      const previous = queryClient.getQueryData<boolean>(stateKey);
      queryClient.setQueryData<boolean>(stateKey, !currentlyFollowing);
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(stateKey, ctx.previous);
      }
      toast.error("Não conseguimos atualizar quem você segue", {
        description: "Verifique sua conexão e tente novamente.",
      });
    },
    onSuccess: (nowFollowing) => {
      if (nowFollowing) {
        toast.success("Você está seguindo");
        if (user) void awardXp(user.id, "follow", { silent: true });
      }
    },
    onSettled: () => {
      if (user) invalidate.follow(user.id, targetUserId);
    },
  });
}

interface SuggestedReader {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  level: number;
}

/**
 * Leitores para seguir — exclui o próprio usuário e quem ele já segue.
 * Equivalente a:
 *   SELECT * FROM profiles
 *   WHERE id NOT IN (SELECT following_id FROM follows WHERE follower_id = me)
 *     AND id != me
 */
export function useSuggestedReaders(limit = 12) {
  const { user } = useAuth();
  return useQuery<SuggestedReader[]>({
    queryKey: qk.suggestedReaders(user?.id || "anon"),
    queryFn: async () => {
      if (!user) return [];
      const { data: alreadyFollowing } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id);
      const excludeIds = [user.id, ...(alreadyFollowing?.map((f) => f.following_id) || [])];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url, level")
        .not("id", "in", `(${excludeIds.map((id) => `"${id}"`).join(",")})`)
        .order("xp", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data as SuggestedReader[]) || [];
    },
    enabled: !!user,
    ...CACHE.SOCIAL,
  });
}
