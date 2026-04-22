import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BookCover } from "@/components/books/BookCover";
import { ArrowRight, Sparkles, Plus, Check, Loader2 } from "lucide-react";
import { useNextVolume } from "@/hooks/useNextVolume";
import { useAddBook } from "@/hooks/useLibrary";
import { haptic } from "@/lib/haptics";
import type { Book, UserBook } from "@/types/book";
import { toast } from "sonner";

interface Props {
  book: Book;
  ub: UserBook | null;
}

/**
 * Banner que aparece no topo da página do livro quando o usuário acabou
 * de marcar um volume como lido E existe um próximo volume na mesma série
 * que ele ainda não tem na biblioteca.
 *
 * Critérios para aparecer:
 * - O livro atual tem `series_id` + `volume_number`.
 * - O usuário marcou esse volume como `read`.
 * - Existe um livro com `volume_number + 1` na mesma série.
 * - Esse próximo volume ainda NÃO está na biblioteca do usuário.
 */
export function NextInSeriesBanner({ book, ub }: Props) {
  const { data, isLoading } = useNextVolume(book);
  const addBook = useAddBook();

  // Só aparece se o usuário leu o atual e o próximo existe e não foi adicionado
  const shouldShow =
    !isLoading &&
    ub?.status === "read" &&
    data &&
    !data.alreadyOwned;

  if (!shouldShow) return null;

  const { next } = data;

  const handleAdd = async (status: "wishlist" | "reading") => {
    haptic("success");
    addBook.mutate(
      { bookId: next.id, status },
      {
        onSuccess: () => {
          toast.success(
            status === "reading"
              ? `Vol. ${next.volume_number} adicionado em "Lendo agora"`
              : `Vol. ${next.volume_number} adicionado à wishlist`,
          );
        },
        onError: () => toast.error("Não consegui adicionar agora"),
      },
    );
  };

  return (
    <div className="px-5 md:px-10 pt-4 max-w-6xl mx-auto">
      <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent p-4 md:p-5 animate-fade-in">
        <div className="absolute top-3 right-3 flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-primary">
          <Sparkles className="w-3 h-3" /> Próximo na série
        </div>

        <div className="flex items-start gap-4">
          <Link
            to={`/livro/${next.id}`}
            className="shrink-0 hover:scale-105 transition-transform"
            onClick={() => haptic("tap")}
          >
            <BookCover
              book={next}
              size="sm"
              fallback={false}
              interactive={false}
              className="shadow-book ring-1 ring-border/40"
            />
          </Link>

          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              Volume {next.volume_number}
            </p>
            <Link
              to={`/livro/${next.id}`}
              className="block font-display text-base md:text-lg font-bold leading-tight hover:text-primary transition-colors line-clamp-2"
            >
              {next.title}
            </Link>
            {next.authors?.[0] && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {next.authors.join(", ")}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Button
                size="sm"
                variant="hero"
                className="h-8 gap-1.5 text-xs"
                onClick={() => handleAdd("reading")}
                disabled={addBook.isPending}
              >
                {addBook.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Plus className="w-3 h-3" />
                )}
                Começar agora
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                onClick={() => handleAdd("wishlist")}
                disabled={addBook.isPending}
              >
                <Check className="w-3 h-3" /> Wishlist
              </Button>
              <Link
                to={`/livro/${next.id}`}
                className="text-xs text-primary hover:underline inline-flex items-center gap-1 ml-auto"
              >
                Ver detalhes <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
