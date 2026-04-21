import { Link } from "react-router-dom";
import { Plus, Sparkles, Loader2, Check } from "lucide-react";
import { BookCover } from "./BookCover";
import { CinematicShelf, ShelfItem } from "./CinematicShelf";
import { Button } from "@/components/ui/button";
import { useDiscoveryShelf } from "@/hooks/useDiscoveryShelf";
import { useAddBook } from "@/hooks/useLibrary";
import { useState } from "react";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * Prateleira "Você pode gostar" — descobertas baseadas em IA + comportamento.
 * Cada card tem ação rápida "Quero ler" (sem precisar abrir o livro).
 */
export function DiscoveryShelfRow() {
  const { data: items = [], isLoading } = useDiscoveryShelf(18);
  const addBook = useAddBook();
  const [added, setAdded] = useState<Set<string>>(new Set());

  if (isLoading) {
    return (
      <div className="mb-10 px-1 animate-fade-in">
        <h2 className="font-display text-xl md:text-2xl font-semibold mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          Você pode gostar
        </h2>
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="shrink-0 w-28 md:w-36 aspect-[2/3] rounded-md bg-muted/40 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!items.length) return null;

  const handleAdd = (bookId: string) => {
    if (added.has(bookId)) return;
    haptic("tap");
    addBook.mutate(
      { bookId, status: "wishlist" },
      {
        onSuccess: () => {
          setAdded((prev) => new Set(prev).add(bookId));
        },
      },
    );
  };

  return (
    <CinematicShelf
      title="Você pode gostar"
      subtitle="Descobertas baseadas no que você lê"
    >
      {items.map(({ book, reason }) => {
        const isAdded = added.has(book.id);
        const isAdding = addBook.isPending && addBook.variables?.bookId === book.id;

        return (
          <ShelfItem key={`disc-${book.id}`} width="wide">
            <div className="group/disc block animate-fade-in">
              <Link
                to={`/livro/${book.id}`}
                state={{ shelfId: "discovery", shelfTitle: "Você pode gostar" }}
                aria-label={book.title}
                className="block relative"
              >
                <BookCover
                  book={book}
                  size="lg"
                  interactive={false}
                  className="w-full h-auto aspect-[2/3] group-hover/disc:shadow-elevated transition-all duration-300 group-hover/disc:scale-[1.03]"
                />
                {reason && (
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-background/90 backdrop-blur-md text-[10px] font-medium border border-border/60 shadow-sm">
                    {reason}
                  </span>
                )}
              </Link>

              <div className="mt-2 px-0.5">
                <p className="font-display text-sm font-semibold leading-tight line-clamp-2">
                  {book.title}
                </p>
                {book.authors?.[0] && (
                  <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                    {book.authors[0]}
                  </p>
                )}
                <Button
                  size="sm"
                  variant={isAdded ? "secondary" : "outline"}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleAdd(book.id);
                  }}
                  disabled={isAdded || isAdding}
                  className={cn(
                    "mt-2 w-full h-7 text-[11px] gap-1",
                    isAdded && "border-status-read/50 text-status-read",
                  )}
                >
                  {isAdding ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : isAdded ? (
                    <>
                      <Check className="w-3 h-3" /> Na fila
                    </>
                  ) : (
                    <>
                      <Plus className="w-3 h-3" /> Quero ler
                    </>
                  )}
                </Button>
              </div>
            </div>
          </ShelfItem>
        );
      })}
    </CinematicShelf>
  );
}
