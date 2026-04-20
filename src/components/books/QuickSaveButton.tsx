import { useState } from "react";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ensurePersistedBook, isExternal } from "@/lib/import-book";
import { haptic } from "@/lib/haptics";
import { toast } from "sonner";
import { invalidate, queryClient, qk } from "@/lib/query-client";
import type { Book, UserBook } from "@/types/book";

interface Props {
  book: Book;
  /** Hint visual quando o card já tem hover overlay; default true */
  floating?: boolean;
  className?: string;
}

/**
 * Botão "Salvar para depois" — adiciona à wishlist sem sair do feed.
 * - Optimistic UI: estado vira "salvo" instantâneo
 * - Importa livro externo (AniList/OL) antes de gravar
 * - Cap visual em cima da capa, sem afetar o tap-target principal
 */
export function QuickSaveButton({ book, floating = true, className }: Props) {
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user || busy || saved) return;
    setBusy(true);
    haptic("tap");
    // Optimistic
    setSaved(true);
    try {
      const persisted = isExternal(book) ? await ensurePersistedBook(book) : book;
      if (!persisted?.id) throw new Error("import_failed");

      // Insere na wishlist (ignore conflito se já existir)
      const { error } = await supabase
        .from("user_books")
        .insert({ user_id: user.id, book_id: persisted.id, status: "wishlist" });
      if (error && !`${error.message}`.includes("duplicate")) throw error;

      invalidate.library(user.id);
      // toast discreto
      toast.success("Salvo na lista de desejos", { duration: 1800 });
    } catch {
      setSaved(false);
      toast.error("Não conseguimos salvar agora");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={saved ? "Salvo" : "Salvar para depois"}
      aria-pressed={saved}
      className={cn(
        "z-20 inline-flex items-center justify-center rounded-full transition-all duration-200",
        "bg-background/85 backdrop-blur-md border border-border/60 shadow-lg",
        "hover:bg-primary hover:text-primary-foreground hover:scale-110 active:scale-95",
        saved && "bg-primary text-primary-foreground border-primary",
        floating ? "absolute top-1.5 left-1.5 w-8 h-8" : "h-9 w-9",
        className,
      )}
    >
      {busy ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : saved ? (
        <BookmarkCheck className="w-4 h-4 fill-current" />
      ) : (
        <Bookmark className="w-4 h-4" />
      )}
    </button>
  );
}
