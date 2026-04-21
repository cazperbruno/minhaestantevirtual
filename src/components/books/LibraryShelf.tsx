import { Book, UserBook } from "@/types/book";
import { Link } from "react-router-dom";
import { BookCover } from "./BookCover";
import { CinematicShelf, ShelfItem } from "./CinematicShelf";
import { dedupeByIsbn } from "@/lib/dedupe";

interface Props {
  title: string;
  subtitle?: string;
  items: UserBook[];
  emptyHint?: string;
}

/**
 * Prateleira de biblioteca — agora wrapper sobre `CinematicShelf` para garantir
 * scroll/snap/altura/espaçamento idênticos a todas as demais prateleiras do app.
 *
 * Aplica deduplicação por ISBN dentro da MESMA prateleira (regra global do app).
 */
export function LibraryShelf({ title, subtitle, items, emptyHint }: Props) {
  const visible = dedupeByIsbn(items, (ub) => ub.book ?? null);

  if (visible.length === 0) {
    return (
      <section className="space-y-3 mb-10">
        <div>
          <h2 className="font-display text-xl md:text-2xl font-semibold leading-tight">{title}</h2>
          {subtitle && <p className="text-xs md:text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center">
          <p className="text-sm text-muted-foreground">{emptyHint || "Nenhum livro aqui ainda."}</p>
        </div>
      </section>
    );
  }

  return (
    <CinematicShelf title={title} subtitle={subtitle}>
      {visible.map((ub) =>
        ub.book ? (
          <ShelfItem key={ub.id} width="wide">
            <ShelfCard ub={ub} book={ub.book} />
          </ShelfItem>
        ) : null,
      )}
    </CinematicShelf>
  );
}

function ShelfCard({ ub, book }: { ub: UserBook; book: Book }) {
  const progress =
    book.page_count && ub.current_page
      ? Math.round((ub.current_page / book.page_count) * 100)
      : null;

  return (
    <Link
      to={`/livro/${book.id}`}
      className="group/card block animate-fade-in"
      aria-label={book.title}
    >
      <div className="relative">
        <BookCover
          book={book}
          size="lg"
          interactive={false}
          className="w-full h-auto aspect-[2/3] group-hover/card:shadow-elevated transition-all duration-300 group-hover/card:scale-[1.03]"
        />
        {progress !== null && progress < 100 && (
          <div className="absolute bottom-1.5 left-1.5 right-1.5 h-1 rounded-full bg-background/60 overflow-hidden backdrop-blur-sm">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
      <div className="mt-2 px-0.5">
        <p className="font-display text-sm font-semibold leading-tight line-clamp-2 group-hover/card:text-primary transition-colors">
          {book.title}
        </p>
        {book.authors?.[0] && (
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
            {book.authors[0]}
          </p>
        )}
        {ub.rating ? (
          <p className="text-[11px] text-primary mt-1 font-semibold tabular-nums">
            ★ {ub.rating}/5
          </p>
        ) : null}
      </div>
    </Link>
  );
}
