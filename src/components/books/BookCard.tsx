import { Book } from "@/types/book";
import { BookCover } from "./BookCover";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface Props {
  book: Book;
  size?: "sm" | "md" | "lg";
  className?: string;
  showMeta?: boolean;
}

export function BookCard({ book, size = "md", className, showMeta = true }: Props) {
  return (
    <Link
      to={`/livro/${book.id}`}
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
        </div>
      )}
    </Link>
  );
}
