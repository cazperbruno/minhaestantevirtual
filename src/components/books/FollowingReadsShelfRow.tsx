import { useNavigate } from "react-router-dom";
import { Users } from "lucide-react";
import { BookCover } from "./BookCover";
import { CinematicShelf, ShelfItem } from "./CinematicShelf";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useFollowingReads } from "@/hooks/useFollowingReads";
import { haptic } from "@/lib/haptics";
import { viewTransition, bookCoverTransitionName } from "@/lib/view-transitions";
import { cn } from "@/lib/utils";

/**
 * Prateleira social: livros lidos por pessoas que o usuário segue.
 * Mostra até 5 avatares empilhados + contador "+N" quando passa.
 */
export function FollowingReadsShelfRow() {
  const navigate = useNavigate();
  const { data: items = [], isLoading } = useFollowingReads(18);

  if (isLoading) {
    return (
      <div className="mb-10 px-1 animate-fade-in">
        <h2 className="font-display text-xl md:text-2xl font-semibold mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          Lidos por quem você segue
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

  return (
    <CinematicShelf
      title="Lidos por quem você segue"
      subtitle="Descubra através da sua rede"
    >
      {items.map(({ book, reader_count, reader_avatars, reader_names }) => {
        const visible = reader_avatars.slice(0, 5);
        const extra = Math.max(0, reader_count - visible.length);

        return (
          <ShelfItem key={`fr-${book.id}`} width="wide">
            <div className="group/fr block animate-fade-in">
              <button
                type="button"
                aria-label={`${book.title} — lido por ${reader_count} de quem você segue`}
                className="block relative w-full text-left"
                onClick={(e) => {
                  e.preventDefault();
                  haptic("tap");
                  void viewTransition(() =>
                    navigate(`/livro/${book.id}`, {
                      state: { shelfId: "following-reads", shelfTitle: "Lidos por quem você segue" },
                    }),
                  );
                }}
              >
                <BookCover
                  book={book}
                  size="lg"
                  interactive={false}
                  transitionName={bookCoverTransitionName(book.id)}
                  className="w-full h-auto aspect-[2/3] group-hover/fr:shadow-elevated transition-all duration-300 group-hover/fr:scale-[1.03]"
                />
                {/* Stacked avatars + counter */}
                <div className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-background/90 backdrop-blur-md border border-border/60 shadow-sm">
                  <div className="flex -space-x-2">
                    {visible.map((src, i) => (
                      <Avatar
                        key={i}
                        className={cn(
                          "w-5 h-5 border-2 border-background",
                          "ring-0",
                        )}
                      >
                        <AvatarImage src={src} alt={reader_names[i] ?? "Leitor"} />
                        <AvatarFallback className="text-[8px] bg-primary/20 text-primary">
                          {(reader_names[i] ?? "?").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                  {extra > 0 && (
                    <span className="text-[10px] font-semibold text-foreground/90 tabular-nums">
                      +{extra}
                    </span>
                  )}
                </div>
              </button>

              <div className="mt-2 px-0.5">
                <p className="font-display text-sm font-semibold leading-tight line-clamp-2">
                  {book.title}
                </p>
                {book.authors?.[0] && (
                  <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                    {book.authors[0]}
                  </p>
                )}
                <p className="text-[10px] text-primary/80 mt-1 font-medium">
                  {reader_count === 1
                    ? `${reader_names[0] ?? "1 amigo"} leu`
                    : `${reader_count} de quem você segue leu`}
                </p>
              </div>
            </div>
          </ShelfItem>
        );
      })}
    </CinematicShelf>
  );
}
