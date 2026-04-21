/**
 * Notas pessoais privadas de um livro do usuário.
 *
 * Armazenadas em `user_book_notes` (separadas de `user_books` por motivos de
 * privacidade — RLS garante que só o dono lê/escreve).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CACHE } from "@/lib/query-client";
import { toast } from "sonner";

const key = (uid: string | undefined, ubId: string | undefined) =>
  ["user-book-notes", uid || "anon", ubId || ""];

export function useBookNotes(userBookId: string | undefined) {
  const { user } = useAuth();
  return useQuery<string>({
    queryKey: key(user?.id, userBookId),
    enabled: !!user && !!userBookId,
    ...CACHE.PERSONAL,
    queryFn: async () => {
      if (!user || !userBookId) return "";
      const { data } = await supabase
        .from("user_book_notes")
        .select("notes")
        .eq("user_book_id", userBookId)
        .maybeSingle();
      return (data?.notes as string) || "";
    },
  });
}

export function useSaveBookNotes(userBookId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (notes: string) => {
      if (!user || !userBookId) throw new Error("missing_user_or_book");
      const { error } = await supabase
        .from("user_book_notes")
        .upsert(
          { user_book_id: userBookId, user_id: user.id, notes },
          { onConflict: "user_book_id" },
        );
      if (error) throw error;
      return notes;
    },
    onSuccess: (notes) => {
      qc.setQueryData(key(user?.id, userBookId), notes);
    },
    onError: () => toast.error("Não foi possível salvar suas notas"),
  });
}
