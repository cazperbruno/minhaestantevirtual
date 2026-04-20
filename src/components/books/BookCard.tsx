import { memo, useState } from "react";
import { Book } from "@/types/book";
import { BookCover } from "./BookCover";
import { ContentTypeBadge } from "./ContentTypeBadge";
import { QuickSaveButton } from "./QuickSaveButton";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { track } from "@/lib/track";
import { ensurePersistedBook, isExternal } from "@/lib/import-book";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  book: Book & { _reason?: string };
  size?: "sm" | "md" | "lg";
  className?: string;
  showMeta?: boolean;
  /** Show the floating quick-save (wishlist) action over the cover. Default true. */
  quickSave?: boolean;
  /** Optional source label for analytics (e.g. "shelf:trending"). */
  source?: string;
}

function BookCardImpl({ book, size = "md", className, showMeta = true, source }: Props) {
  const navigate = useNavigate();
  const [importing, setImporting] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    track("click", book.id, source ? { source } : undefined);
    if (!isExternal(book)) {
      navigate(`/livro/${book.id}`);
      return;
    }
    // Livro externo (AniList / OpenLibrary) — persiste antes de navegar.
    setImporting(true);
    try {
      const saved = await ensurePersistedBook(book);
      if (!saved) {
        toast.error("Não foi possível importar este item");
        return;
      }
      navigate(`/livro/${saved.id}`);
    } catch {
      toast.error("Erro ao importar");
    } finally {
      setImporting(false);
    }
  };

  return (
    <a
      href={`/livro/${book.id}`}
      onClick={handleClick}
      onMouseEnter={() => !isExternal(book) && track("view", book.id, source ? { source } : undefined)}
      className={cn("group block animate-fade-in", className)}
      aria-busy={importing}
    >
      <div className="relative">
        <BookCover book={book} size={size} className="mx-auto group-hover:shadow-elevated" />
        <ContentTypeBadge type={book.content_type} className="absolute top-1.5 right-1.5 z-10" />
        {importing && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 rounded-md backdrop-blur-sm">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        )}
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
    </a>
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
