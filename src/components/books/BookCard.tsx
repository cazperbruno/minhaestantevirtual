import { Book } from "@/types/book";
import { BookCover } from "./BookCover";
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

export function BookCard({ book, size = "md", className, showMeta = true, source }: Props) {
  return (
    <Link
      to={`/livro/${book.id}`}
      onClick={() => track("click", book.id, source ? { source } : undefined)}
      onMouseEnter={() => track("view", book.id, source ? { source } : undefined)}
      className={cn("group block animate-fade-in", className)}
    >
      <BookCover book={book} size={size} className="mx-auto group-hover:shadow-elevated" />
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
