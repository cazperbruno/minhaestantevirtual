import { Link } from "react-router-dom";
import { BookCover } from "./BookCover";
import { CinematicShelf, ShelfItem } from "./CinematicShelf";
import { Star } from "lucide-react";
import type { UserBook } from "@/types/book";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  title: string;
  subtitle?: string;
  items: UserBook[];
}

/**
 * Prateleira Netflix-like genérica para a biblioteca.
 * Card mostra capa grande, título, autor e nota (se houver) com hover overlay.
 */
export function SmartShelfRow({ id, title, subtitle, items }: Props) {
  if (!items.length) return null;

  return (
    <CinematicShelf title={title} subtitle={subtitle}>
      {items.map((ub) => {
        if (!ub.book) return null;
        const total = ub.book.page_count || 0;
        const current = ub.current_page || 0;
        const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
        const showProgress = ub.status === "reading" && pct > 0 && pct < 100;

        return (
          <ShelfItem key={`${id}-${ub.id}`} width="wide">
            <Link
              to={`/livro/${ub.book.id}`}
              state={{ shelfId: id, shelfTitle: title }}
              className="group/sc block animate-fade-in"
              aria-label={ub.book.title}
            >
              <div className="relative">
                <BookCover
                  book={ub.book}
                  size="lg"
                  interactive={false}
                  className="w-full h-auto aspect-[2/3] group-hover/sc:shadow-elevated transition-all duration-300 group-hover/sc:scale-[1.03]"
                />
                {/* Overlay no hover (desktop) */}
                <div
                  className={cn(
                    "absolute inset-0 rounded-md bg-gradient-to-t from-background/95 via-background/50 to-transparent",
                    "opacity-0 group-hover/sc:opacity-100 transition-opacity duration-300",
                    "flex flex-col justify-end p-3 gap-1",
                  )}
                >
                  {ub.rating ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                      <Star className="w-3 h-3 fill-current" /> {ub.rating}/5
                    </span>
                  ) : null}
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Toque para abrir
                  </span>
                </div>

                {/* Barra de progresso (sempre visível para "reading") */}
                {showProgress && (
                  <div className="absolute bottom-1.5 left-1.5 right-1.5 h-1 rounded-full bg-background/60 overflow-hidden backdrop-blur-sm">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>

              <div className="mt-2 px-0.5">
                <p className="font-display text-sm font-semibold leading-tight line-clamp-2 group-hover/sc:text-primary transition-colors">
                  {ub.book.title}
                </p>
                {ub.book.authors?.[0] && (
                  <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                    {ub.book.authors[0]}
                  </p>
                )}
              </div>
            </Link>
          </ShelfItem>
        );
      })}
    </CinematicShelf>
  );
}
