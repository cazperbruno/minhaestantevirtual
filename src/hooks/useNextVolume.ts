import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CACHE } from "@/lib/query-client";
import type { Book, UserBook } from "@/types/book";

export interface NextVolumeInfo {
  next: Book;
  /** O usuário já tem esse próximo volume na biblioteca? */
  alreadyOwned: boolean;
  /** UserBook existente (se já estiver na biblioteca). */
  user_book: UserBook | null;
}

/**
 * Busca o próximo volume da mesma série a partir de um livro atual.
 *
 * Critérios:
 * - O livro precisa ter `series_id` e `volume_number`.
 * - O próximo volume é o que tem `volume_number = atual + 1` na mesma série.
 * - Se não houver, retorna `null`.
 *
 * Útil para banners de "Próximo na série" quando o usuário termina um volume.
 */
export function useNextVolume(book: Book | null | undefined) {
  const { user } = useAuth();
  const seriesId = book?.series_id ?? null;
  const currentVol = typeof book?.volume_number === "number" ? book.volume_number : null;

  return useQuery<NextVolumeInfo | null>({
    queryKey: ["next-volume", seriesId, currentVol, user?.id ?? "anon"],
    enabled: !!seriesId && currentVol !== null,
    ...CACHE.PERSONAL,
    queryFn: async () => {
      const { data: nextRows } = await supabase
        .from("books")
        .select("*")
        .eq("series_id", seriesId!)
        .eq("volume_number", (currentVol as number) + 1)
        .limit(1);
      const next = (nextRows?.[0] as Book | undefined) ?? null;
      if (!next) return null;

      let user_book: UserBook | null = null;
      if (user) {
        const { data: ub } = await supabase
          .from("user_books")
          .select("*")
          .eq("user_id", user.id)
          .eq("book_id", next.id)
          .maybeSingle();
        user_book = (ub as UserBook) || null;
      }

      return {
        next,
        alreadyOwned: user_book != null,
        user_book,
      };
    },
  });
}
