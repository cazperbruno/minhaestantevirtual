import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { UserBook, BookStatus } from "@/types/book";
import { CACHE, qk, queryClient, invalidate } from "@/lib/query-client";
import { toast } from "sonner";

async function fetchLibrary(userId: string): Promise<UserBook[]> {
  const { data, error } = await supabase
    .from("user_books")
    .select("*, book:books(*)")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as UserBook[]) || [];
}

/**
 * Carrega a biblioteca pessoal completa do usuário logado.
 *
 * Cache: PERSONAL (1min stale, 30min gc) — invalidações via realtime hook
 * mantém a UI fresca sem precisar refetch manual.
 *
 * @returns TanStack Query com `data: UserBook[]`, `isLoading`, `error`.
 *   Cada item inclui o livro relacionado via JOIN (`item.book`).
 */
export function useLibrary() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.library(user?.id),
    queryFn: () => fetchLibrary(user!.id),
    enabled: !!user,
    ...CACHE.PERSONAL,
  });
}

interface AddBookVars {
  bookId: string;
  status?: BookStatus;
  rating?: number | null;
}

/**
 * Adiciona um livro à biblioteca pessoal com **optimistic update**.
 *
 * UX: o card aparece na biblioteca antes do servidor confirmar. Se a operação
 * falhar, o estado é revertido automaticamente e um toast de erro é mostrado.
 *
 * @example
 * const { mutate } = useAddBook();
 * mutate({ bookId: "uuid", status: "reading" });
 */
export function useAddBook() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ bookId, status = "not_read", rating = null }: AddBookVars) => {
      if (!user) throw new Error("not_authenticated");
      const { data, error } = await supabase
        .from("user_books")
        .insert({ user_id: user.id, book_id: bookId, status, rating })
        .select("*, book:books(*)")
        .single();
      if (error) throw error;
      return data as UserBook;
    },
    onMutate: async (vars) => {
      if (!user) return;
      const key = qk.library(user.id);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<UserBook[]>(key);
      const tempBook = queryClient.getQueryData<any>(qk.book(vars.bookId))?.book;
      const optimistic: UserBook = {
        id: `optimistic-${vars.bookId}`,
        user_id: user.id,
        book_id: vars.bookId,
        status: vars.status ?? "not_read",
        rating: vars.rating ?? null,
        is_public: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        book: tempBook,
      };
      queryClient.setQueryData<UserBook[]>(key, (old) => [optimistic, ...(old || [])]);
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous && user) {
        queryClient.setQueryData(qk.library(user.id), ctx.previous);
      }
      toast.error("Erro ao adicionar livro");
    },
    onSuccess: () => {
      toast.success("Livro adicionado à biblioteca");
    },
    onSettled: () => invalidate.library(user?.id),
  });
}

interface UpdateBookVars {
  id: string;
  // `notes` foi removido de user_books (vive em user_book_notes por privacidade).
  patch: Partial<Pick<UserBook, "status" | "rating" | "current_page" | "is_public" | "available_for_loan" | "available_for_trade">>;
}

/**
 * Atualiza campos de um item da biblioteca (status, rating, página atual etc.)
 * com optimistic update — a UI reflete a mudança imediatamente.
 *
 * @example
 * mutate({ id: userBookId, patch: { status: "read", rating: 5 } });
 */
export function useUpdateUserBook() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, patch }: UpdateBookVars) => {
      const { data, error } = await supabase
        .from("user_books")
        .update(patch)
        .eq("id", id)
        .select("*, book:books(*)")
        .single();
      if (error) throw error;
      return data as UserBook;
    },
    onMutate: async ({ id, patch }) => {
      if (!user) return;
      const key = qk.library(user.id);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<UserBook[]>(key);
      queryClient.setQueryData<UserBook[]>(key, (old) =>
        (old || []).map((i) => (i.id === id ? { ...i, ...patch, updated_at: new Date().toISOString() } : i)),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous && user) {
        queryClient.setQueryData(qk.library(user.id), ctx.previous);
      }
      toast.error("Erro ao atualizar");
    },
    onSettled: () => invalidate.library(user?.id),
  });
}

/**
 * Remove um livro da biblioteca pessoal (não exclui o livro do catálogo).
 *
 * Optimistic update + rollback em caso de erro. RLS garante que só o dono
 * pode remover (verificação no servidor).
 */
export function useRemoveUserBook() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_books").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onMutate: async (id) => {
      if (!user) return;
      const key = qk.library(user.id);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<UserBook[]>(key);
      queryClient.setQueryData<UserBook[]>(key, (old) => (old || []).filter((i) => i.id !== id));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous && user) {
        queryClient.setQueryData(qk.library(user.id), ctx.previous);
      }
      toast.error("Erro ao remover");
    },
    onSuccess: () => toast.success("Removido da biblioteca"),
    onSettled: () => invalidate.library(user?.id),
  });
}
