import { memo } from "react";
import { Book } from "@/types/book";
import { BookCover } from "./BookCover";
import { ContentTypeBadge } from "./ContentTypeBadge";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { track } from "@/lib/track";

interface Props {
  book: Book & { _reason?: string };
  size?: "sm" | "md" | "lg";
  className?: string;
  showMeta?: boolean;
  /** Optional source label for analytics (e.g. "shelf:trending"). */
  source?: string;
}

function BookCardImpl({ book, size = "md", className, showMeta = true, source }: Props) {
  return (
    <Link
      to={`/livro/${book.id}`}
      onClick={() => track("click", book.id, source ? { source } : undefined)}
      onMouseEnter={() => track("view", book.id, source ? { source } : undefined)}
      className={cn("group block animate-fade-in", className)}
    >
      <div className="relative">
        <BookCover book={book} size={size} className="mx-auto group-hover:shadow-elevated" />
        <ContentTypeBadge type={book.content_type} className="absolute top-1.5 right-1.5 z-10" />
      </div>
      {showMeta && (
        <div className="mt-3 px-1">
          <h3 className="font-display font-semibold text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
            {book.title}
          </h3>
          {book.authors?.[0] && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
              {book.authors[0]}
            </p>
          )}
          {book._reason && (
            <p className="text-[10px] text-primary/80 mt-1 italic line-clamp-1">
              {book._reason}
            </p>
          )}
        </div>
      )}
    </Link>
  );
}

// Memoizado: cards aparecem em prateleiras com 20-50 itens; reduz re-renders ao 1/N
export const BookCard = memo(BookCardImpl, (a, b) =>
  a.book.id === b.book.id &&
  a.book.cover_url === b.book.cover_url &&
  a.book.content_type === b.book.content_type &&
  a.size === b.size &&
  a.className === b.className &&
  a.showMeta === b.showMeta &&
  a.source === b.source &&
  a.book._reason === b.book._reason,
);
