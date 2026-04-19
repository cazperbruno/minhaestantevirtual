import { useEffect, useState } from "react";
import { Book } from "@/types/book";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveCover } from "@/lib/cover-fallback";

interface Props {
  book: Pick<Book, "title" | "authors" | "cover_url" | "isbn_10" | "isbn_13">;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  /** Disable async fallback (e.g. inside lists for perf). Defaults to true. */
  fallback?: boolean;
}

const SIZES = {
  sm: "w-16 h-24 text-[10px]",
  md: "w-28 h-44 text-xs",
  lg: "w-40 h-60 text-sm",
  xl: "w-52 h-80 text-base",
};

export function BookCover({ book, size = "md", className, fallback = true }: Props) {
  const [src, setSrc] = useState<string | null>(book.cover_url ?? null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setSrc(book.cover_url ?? null);
    setErrored(false);
  }, [book.cover_url]);

  // If no URL and fallback enabled, try to resolve from OpenLibrary/Google
  useEffect(() => {
    if (!fallback) return;
    if (src && !errored) return;
    let cancelled = false;
    resolveCover(book).then((u) => {
      if (cancelled) return;
      if (u && u !== src) {
        setErrored(false);
        setSrc(u);
      }
    });
    return () => { cancelled = true; };
  }, [book.isbn_13, book.isbn_10, errored, fallback]);

  if (src && !errored) {
    return (
      <div className={cn("book-cover", SIZES[size], className)}>
        <img
          src={src}
          alt={`Capa de ${book.title}`}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
          onError={() => setErrored(true)}
        />
      </div>
    );
  }

  // Premium editorial placeholder
  return (
    <div
      className={cn(
        "book-cover relative flex flex-col items-center justify-center text-center p-3 border border-border/60",
        SIZES[size],
        className,
      )}
      style={{
        background:
          "linear-gradient(135deg, hsl(30 18% 14%) 0%, hsl(30 14% 8%) 50%, hsl(8 35% 18%) 100%)",
      }}
    >
      <div className="absolute inset-0 opacity-20" style={{
        background: "repeating-linear-gradient(45deg, transparent, transparent 6px, hsl(38 75% 62% / 0.08) 6px, hsl(38 75% 62% / 0.08) 7px)",
      }} />
      <BookOpen className="w-6 h-6 text-primary/70 mb-2 relative" />
      <p className="font-display font-semibold text-foreground/95 line-clamp-3 leading-tight relative">
        {book.title}
      </p>
      {book.authors?.[0] && (
        <p className="text-muted-foreground mt-2 line-clamp-2 text-[0.85em] italic relative">
          {book.authors[0]}
        </p>
      )}
    </div>
  );
}
