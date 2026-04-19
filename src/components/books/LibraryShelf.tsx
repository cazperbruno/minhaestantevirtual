import { useRef } from "react";
import { Book, UserBook } from "@/types/book";
import { Link } from "react-router-dom";
import { BookCover } from "./BookCover";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  title: string;
  subtitle?: string;
  items: UserBook[];
  emptyHint?: string;
}

export function LibraryShelf({ title, subtitle, items, emptyHint }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (items.length === 0) {
    return (
      <section className="space-y-3">
        <div>
          <h2 className="font-display text-2xl md:text-3xl font-bold">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center">
          <p className="text-sm text-muted-foreground">{emptyHint || "Nenhum livro aqui ainda."}</p>
        </div>
      </section>
    );
  }

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -el.clientWidth * 0.85 : el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <section className="space-y-3 group/shelf">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl md:text-3xl font-bold">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <div className="hidden md:flex items-center gap-1.5 opacity-0 group-hover/shelf:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" onClick={() => scroll("left")} aria-label="Anterior">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => scroll("right")} aria-label="Próximo">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 md:gap-5 overflow-x-auto scrollbar-hide pb-4 -mx-5 px-5 md:-mx-10 md:px-10 snap-x snap-mandatory"
      >
        {items.map((ub) => ub.book && <ShelfCard key={ub.id} ub={ub} book={ub.book} />)}
      </div>
    </section>
  );
}

function ShelfCard({ ub, book }: { ub: UserBook; book: Book }) {
  const progress = book.page_count && ub.current_page
    ? Math.round((ub.current_page / book.page_count) * 100) : null;

  return (
    <Link
      to={`/livro/${book.id}`}
      className="group/card flex-none snap-start w-[140px] md:w-[160px] animate-fade-in"
    >
      <div className="relative">
        <BookCover book={book} size="md" className="!w-full !h-[210px] md:!h-[240px]" />
        {progress !== null && progress < 100 && (
          <div className="absolute bottom-1.5 left-1.5 right-1.5 h-1 rounded-full bg-background/60 overflow-hidden backdrop-blur-sm">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
      <div className="mt-2.5 px-0.5">
        <h3 className="font-display font-semibold text-sm leading-tight line-clamp-2 group-hover/card:text-primary transition-colors">
          {book.title}
        </h3>
        {book.authors?.[0] && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {book.authors[0]}
          </p>
        )}
        {ub.rating ? (
          <p className="text-xs text-primary mt-1 font-semibold tabular-nums">
            ★ {ub.rating}/5
          </p>
        ) : null}
      </div>
    </Link>
  );
}
