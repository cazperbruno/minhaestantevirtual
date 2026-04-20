import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CACHE, qk, queryClient } from "@/lib/query-client";

export interface Notif {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

/** Notificações do usuário — cache LIVE (15s) + invalidação realtime. */
export function useNotifications() {
  const { user } = useAuth();
  const key = qk.notifications(user?.id || "anon");

  // Realtime: invalida o cache assim que uma notificação nova chega
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: key });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return useQuery<Notif[]>({
    queryKey: key,
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data || []) as Notif[];
    },
    enabled: !!user,
    ...CACHE.LIVE,
  });
}

export function useMarkNotificationRead() {
  const { user } = useAuth();
  const key = qk.notifications(user?.id || "anon");
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications")
        .update({ is_read: true }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Notif[]>(key);
      queryClient.setQueryData<Notif[]>(key, (old) =>
        (old || []).map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
  });
}

export function useMarkAllNotificationsRead() {
  const { user } = useAuth();
  const key = qk.notifications(user?.id || "anon");
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase.from("notifications")
        .update({ is_read: true }).in("id", ids);
      if (error) throw error;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Notif[]>(key);
      queryClient.setQueryData<Notif[]>(key, (old) =>
        (old || []).map((n) => ({ ...n, is_read: true })),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
  });
}
