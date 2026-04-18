import { Book } from "@/types/book";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  book: Pick<Book, "title" | "authors" | "cover_url">;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZES = {
  sm: "w-16 h-24 text-[10px]",
  md: "w-28 h-44 text-xs",
  lg: "w-40 h-60 text-sm",
  xl: "w-52 h-80 text-base",
};

export function BookCover({ book, size = "md", className }: Props) {
  if (book.cover_url) {
    return (
      <div className={cn("book-cover", SIZES[size], className)}>
        <img
          src={book.cover_url}
          alt={`Capa de ${book.title}`}
          loading="lazy"
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "book-cover bg-gradient-spine flex flex-col items-center justify-center text-center p-2 border border-border/50",
        SIZES[size],
        className,
      )}
    >
      <BookOpen className="w-6 h-6 text-primary/50 mb-2" />
      <p className="font-display font-semibold text-foreground/90 line-clamp-3 leading-tight">
        {book.title}
      </p>
      {book.authors?.[0] && (
        <p className="text-muted-foreground mt-2 line-clamp-2 text-[0.85em]">
          {book.authors[0]}
        </p>
      )}
    </div>
  );
}
