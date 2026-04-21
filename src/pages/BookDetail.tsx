import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { queryClient, qk } from "@/lib/query-client";
import { BookHero } from "@/components/books/BookHero";
import { BookSynopsis } from "@/components/books/BookSynopsis";
import { BookSidePanel } from "@/components/books/BookSidePanel";
import { ReviewSection } from "@/components/books/ReviewSection";
import { BookSuggestions } from "@/components/books/BookSuggestions";
import { ShelfNavigator } from "@/components/books/ShelfNavigator";
import { BookDetailSkeleton } from "@/components/ui/skeletons";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useBook, useUserBook, useCommitUserBook } from "@/hooks/useBookDetail";
import { useShelfNavigation } from "@/hooks/useShelfNavigation";
import { Book, UserBook } from "@/types/book";
import { trackBookView } from "@/lib/ai-tracking";

export default function BookDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: book, isLoading: loadingBook } = useBook(id);

  // AI: registra view (deduplicada por hora no servidor) — sinal de interesse implícito
  useEffect(() => {
    if (book?.id && user) trackBookView(book.id);
  }, [book?.id, user]);
  const { data: ub } = useUserBook(book?.id);
  const commit = useCommitUserBook(book);
  const shelfNav = useShelfNavigation(book?.id);

  const ubKey = ["user-book", user?.id || "anon", book?.id || ""];

  const updateBookCache = (next: Book) => {
    queryClient.setQueryData(qk.book(next.id), next);
  };
  const patchUbCache = (patch: Partial<UserBook>) => {
    queryClient.setQueryData<UserBook | null>(ubKey, (old) =>
      old ? { ...old, ...patch } : old,
    );
  };

  const share = async () => {
    if (!book) return;
    const text = `📚 ${book.title}${book.authors[0] ? ` — ${book.authors[0]}` : ""}`;
    if (navigator.share) {
      await navigator.share({ title: book.title, text, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard.writeText(`${text}\n${window.location.href}`);
      toast.success("Link copiado");
    }
  };

  if (loadingBook) {
    return (
      <AppShell>
        <BookDetailSkeleton />
      </AppShell>
    );
  }
  if (!book) {
    return (
      <AppShell>
        <div className="px-6 py-32 text-center">
          <p className="text-lg mb-3">Livro não encontrado</p>
          <Link to="/" className="text-primary underline">Voltar ao início</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <ShelfNavigator
        shelfTitle={shelfNav.shelfTitle}
        index={shelfNav.index}
        total={shelfNav.total}
        prevId={shelfNav.prevId}
        nextId={shelfNav.nextId}
      >
        <BookHero
          book={book}
          ub={ub ?? null}
          saving={commit.isPending}
          onStatusChange={(s) => commit.mutate({ status: s })}
          onAddWishlist={() => commit.mutate({ status: "wishlist" })}
          onShare={share}
          onBookUpdated={updateBookCache}
        />

        <div className="px-5 md:px-10 pb-20 max-w-6xl mx-auto grid md:grid-cols-[1fr_340px] gap-10 md:gap-14 mt-4">
          <BookSynopsis
            bookId={book.id}
            description={book.description}
            onDescriptionUpdated={(d) => updateBookCache({ ...book, description: d })}
          />
          {ub && (
            <BookSidePanel
              book={book}
              ub={ub}
              onUpdate={(patch) => patchUbCache(patch)}
              onCommit={(patch) => commit.mutate(patch)}
            />
          )}
        </div>

        <div className="px-5 md:px-10 pb-10 max-w-6xl mx-auto">
          <ReviewSection bookId={book.id} />
        </div>

        <div className="px-5 md:px-10 pb-24 max-w-6xl mx-auto">
          <BookSuggestions book={book} />
        </div>
      </ShelfNavigator>
    </AppShell>
  );
}
