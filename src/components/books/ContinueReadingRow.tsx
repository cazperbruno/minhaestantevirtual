import { Link } from "react-router-dom";
import { BookCover } from "./BookCover";
import { CinematicShelf, ShelfItem } from "./CinematicShelf";
import { Play } from "lucide-react";
import type { UserBook } from "@/types/book";
import { cn } from "@/lib/utils";

interface Props {
  items: UserBook[];
}

/**
 * Prateleira "Continue lendo" estilo Netflix com:
 *  - capa grande
 *  - barra de progresso (current_page/page_count)
 *  - badge "Retomar" no hover
 *
 * Renderiza nada se não houver itens.
 */
export function ContinueReadingRow({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <CinematicShelf
      title="Continue lendo"
      subtitle="Volte de onde parou"
    >
      {items.map((ub) => {
        if (!ub.book) return null;
        const total = ub.book.page_count || 0;
        const current = ub.current_page || 0;
        const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

        return (
          <ShelfItem key={ub.id} width="wide">
            <Link
              to={`/livro/${ub.book.id}`}
              className="group/cr block animate-fade-in"
              aria-label={`Continuar ${ub.book.title}`}
            >
              <div className="relative">
                <BookCover
                  book={ub.book}
                  size="lg"
                  interactive={false}
                  className="w-full h-auto aspect-[2/3] group-hover/cr:shadow-elevated transition-shadow"
                />
                {/* Overlay "Retomar" no hover */}
                <div
                  className={cn(
                    "absolute inset-0 rounded-md bg-gradient-to-t from-background/95 via-background/40 to-transparent",
                    "opacity-0 group-hover/cr:opacity-100 transition-opacity duration-300",
                    "flex items-end justify-center pb-3",
                  )}
                >
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-lg">
                    <Play className="w-3 h-3 fill-current" /> Retomar
                  </span>
                </div>
              </div>

              {/* Barra de progresso */}
              {total > 0 ? (
                <div className="mt-2">
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-gradient-gold transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-baseline mt-1.5">
                    <p className="font-display text-sm font-semibold leading-tight line-clamp-1 group-hover/cr:text-primary transition-colors">
                      {ub.book.title}
                    </p>
                    <span className="text-[10px] text-primary tabular-nums shrink-0 ml-2">{pct}%</span>
                  </div>
                </div>
              ) : (
                <p className="mt-2 font-display text-sm font-semibold leading-tight line-clamp-1 group-hover/cr:text-primary transition-colors">
                  {ub.book.title}
                </p>
              )}
              {ub.book.authors?.[0] && (
                <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                  {ub.book.authors[0]}
                </p>
              )}
            </Link>
          </ShelfItem>
        );
      })}
    </CinematicShelf>
  );
}
