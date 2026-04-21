import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLibrary } from "@/hooks/useLibrary";
import { useSmartShelves } from "@/hooks/useSmartShelves";
import { CACHE, qk } from "@/lib/query-client";
import type { Book, UserBook } from "@/types/book";

export interface ShelfNavState {
  shelfId?: string;
  shelfTitle?: string;
}

interface ShelfNav {
  shelfId?: string;
  shelfTitle?: string;
  bookIds: string[];
  index: number;
  total: number;
  prevId?: string;
  nextId?: string;
}

/**
 * Reconstrói a sequência de livros da prateleira de origem para permitir
 * navegação contínua (swipe/setas) sem perder o contexto.
 *
 * - Lê `state.shelfId` injetado pelos cards das prateleiras
 * - Recalcula a mesma lista usando `useSmartShelves` sobre a biblioteca
 * - Faz prefetch agressivo do próximo livro (book + user_book)
 */
export function useShelfNavigation(currentBookId?: string): ShelfNav {
  const location = useLocation();
  const state = (location.state || {}) as ShelfNavState;
  const { user } = useAuth();
  const qc = useQueryClient();

  // Reusa o cache da biblioteca já carregada — custo zero quando vem de /biblioteca.
  const enabled = !!state.shelfId && !!currentBookId;
  const { data: items = [] } = useLibrary();
  const shelves = useSmartShelves(items);

  const nav = useMemo<ShelfNav>(() => {
    if (!enabled) {
      return { bookIds: [], index: -1, total: 0 };
    }
    const shelf = shelves.find((s) => s.id === state.shelfId);
    const ids = (shelf?.items || []).map((ub) => ub.book?.id).filter(Boolean) as string[];
    const index = currentBookId ? ids.indexOf(currentBookId) : -1;
    return {
      shelfId: state.shelfId,
      shelfTitle: state.shelfTitle ?? shelf?.title,
      bookIds: ids,
      index,
      total: ids.length,
      prevId: index > 0 ? ids[index - 1] : undefined,
      nextId: index >= 0 && index < ids.length - 1 ? ids[index + 1] : undefined,
    };
  }, [enabled, shelves, state.shelfId, state.shelfTitle, currentBookId]);

  // Preload: busca próximo (e anterior) em background — abertura instantânea no swipe.
  useEffect(() => {
    const targets = [nav.nextId, nav.prevId].filter(Boolean) as string[];
    if (!targets.length) return;

    targets.forEach((id) => {
      void qc.prefetchQuery({
        queryKey: qk.book(id),
        queryFn: async () => {
          const { data } = await supabase.from("books").select("*").eq("id", id).maybeSingle();
          return (data as Book) || null;
        },
        ...CACHE.CATALOG,
      });
      if (user) {
        void qc.prefetchQuery({
          queryKey: ["user-book", user.id, id],
          queryFn: async () => {
            const { data } = await supabase
              .from("user_books")
              .select("*")
              .eq("user_id", user.id)
              .eq("book_id", id)
              .maybeSingle();
            return (data as UserBook) || null;
          },
          ...CACHE.PERSONAL,
        });
      }
    });
  }, [nav.nextId, nav.prevId, qc, user]);

  return nav;
}
