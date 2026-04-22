import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
}

/**
 * Carrega e mantém em tempo real as reactions do chat de um clube,
 * agregando por message_id para consumo simples na UI.
 */
export function useClubReactions(clubId: string | undefined, messageIds: string[]) {
  const [reactions, setReactions] = useState<Reaction[]>([]);

  // Busca inicial: todas as reactions das mensagens carregadas
  useEffect(() => {
    if (!clubId || messageIds.length === 0) {
      setReactions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("club_message_reactions" as any)
        .select("id,message_id,user_id,emoji")
        .in("message_id", messageIds);
      if (!cancelled) setReactions((data as any) || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [clubId, messageIds.join(",")]);

  // Realtime: INSERT/DELETE em qualquer mensagem desse clube
  useEffect(() => {
    if (!clubId) return;
    const ch = supabase
      .channel(`club-reactions:${clubId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "club_message_reactions" },
        (payload) => {
          const r = payload.new as Reaction;
          setReactions((prev) =>
            prev.some((x) => x.id === r.id) ? prev : [...prev, r],
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "club_message_reactions" },
        (payload) => {
          const old = payload.old as { id: string };
          setReactions((prev) => prev.filter((r) => r.id !== old.id));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [clubId]);

  const toggle = useCallback(
    async (messageId: string, emoji: string, userId: string) => {
      const existing = reactions.find(
        (r) => r.message_id === messageId && r.user_id === userId && r.emoji === emoji,
      );
      if (existing) {
        // Otimista
        setReactions((prev) => prev.filter((r) => r.id !== existing.id));
        const { error } = await supabase
          .from("club_message_reactions" as any)
          .delete()
          .eq("id", existing.id);
        if (error) setReactions((prev) => [...prev, existing]);
      } else {
        const tempId = `temp-${Math.random()}`;
        const optimistic: Reaction = { id: tempId, message_id: messageId, user_id: userId, emoji };
        setReactions((prev) => [...prev, optimistic]);
        const { data, error } = await supabase
          .from("club_message_reactions" as any)
          .insert({ message_id: messageId, user_id: userId, emoji })
          .select()
          .single();
        setReactions((prev) => prev.filter((r) => r.id !== tempId));
        if (!error && data) {
          setReactions((prev) =>
            prev.some((x) => x.id === (data as any).id) ? prev : [...prev, data as any],
          );
        }
      }
    },
    [reactions],
  );

  return { reactions, toggle };
}
