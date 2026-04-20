import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Book, BookStatus, UserBook } from "@/types/book";
import { CACHE, qk, queryClient, invalidate } from "@/lib/query-client";
import { checkAchievements } from "@/lib/gamification";
import { awardXp } from "@/lib/xp";
import { toast } from "sonner";

/** Livro do catálogo — cache CATALOG (24h). Imutável na prática. */
export function useBook(id?: string) {
  return useQuery<Book | null>({
    queryKey: qk.book(id || ""),
    queryFn: async () => {
      if (!id) return null;
      const { data } = await supabase.from("books").select("*").eq("id", id).maybeSingle();
      return (data as Book) || null;
    },
    enabled: !!id,
    ...CACHE.CATALOG,
  });
}

/** Estado pessoal sobre o livro — cache PERSONAL (1min). */
export function useUserBook(bookId?: string) {
  const { user } = useAuth();
  return useQuery<UserBook | null>({
    queryKey: ["user-book", user?.id || "anon", bookId || ""],
    queryFn: async () => {
      if (!user || !bookId) return null;
      const { data } = await supabase
        .from("user_books").select("*")
        .eq("user_id", user.id).eq("book_id", bookId).maybeSingle();
      return (data as UserBook) || null;
    },
    enabled: !!user && !!bookId,
    ...CACHE.PERSONAL,
  });
}

/** Upsert do user_book com optimistic update. */
export function useCommitUserBook(book: Book | null | undefined) {
  const { user } = useAuth();
  const key = ["user-book", user?.id || "anon", book?.id || ""];

  return useMutation({
    mutationFn: async (patch: Partial<UserBook>) => {
      if (!user || !book) throw new Error("missing_user_or_book");
      const current = queryClient.getQueryData<UserBook | null>(key);

      const payload = {
        user_id: user.id,
        book_id: book.id,
        status: (patch.status ?? current?.status ?? "not_read") as BookStatus,
        rating: patch.rating ?? current?.rating ?? null,
        notes: patch.notes ?? current?.notes ?? null,
        current_page: patch.current_page ?? current?.current_page ?? 0,
        is_public: current?.is_public ?? true,
        ...(patch.status === "read" && !current?.finished_at
          ? { finished_at: new Date().toISOString() } : {}),
        ...(patch.status === "reading" && !current?.started_at
          ? { started_at: new Date().toISOString() } : {}),
      };

      const { data, error } = await supabase
        .from("user_books")
        .upsert(payload, { onConflict: "user_id,book_id" })
        .select().single();
      if (error) throw error;
      return data as UserBook;
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<UserBook | null>(key);
      const optimistic: UserBook = {
        id: previous?.id ?? "temp",
        user_id: user?.id ?? "",
        book_id: book?.id ?? "",
        status: (patch.status ?? previous?.status ?? "not_read") as BookStatus,
        rating: patch.rating ?? previous?.rating ?? null,
        notes: patch.notes ?? previous?.notes ?? null,
        current_page: patch.current_page ?? previous?.current_page ?? 0,
        is_public: previous?.is_public ?? true,
        started_at: previous?.started_at ?? null,
        finished_at: patch.status === "read" ? new Date().toISOString() : (previous?.finished_at ?? null),
        created_at: previous?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
        book: book || undefined,
      };
      queryClient.setQueryData(key, optimistic);
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous !== undefined) queryClient.setQueryData(key, ctx.previous);
      toast.error("Não foi possível salvar");
    },
    onSuccess: (saved, patch, ctx) => {
      queryClient.setQueryData(key, { ...saved, book });
      if (!user) return;
      invalidate.library(user.id);

      // XP por evento real — usa o estado anterior capturado em onMutate
      const prev = ctx?.previous ?? null;
      if (!prev) void awardXp(user.id, "add_book");
      if (patch.status === "read" && prev?.status !== "read") void awardXp(user.id, "finish_book");
      if (patch.rating != null && patch.rating !== prev?.rating) void awardXp(user.id, "rate_book");

      checkAchievements(user.id);
    },
  });
}
