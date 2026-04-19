import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Book, BookStatus, UserBook } from "@/types/book";
import { BookHero } from "@/components/books/BookHero";
import { BookSynopsis } from "@/components/books/BookSynopsis";
import { BookSidePanel } from "@/components/books/BookSidePanel";
import { ReviewSection } from "@/components/books/ReviewSection";
import { BookDetailSkeleton } from "@/components/ui/skeletons";
import { checkAchievements } from "@/lib/gamification";
import { toast } from "sonner";

export default function BookDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [book, setBook] = useState<Book | null>(null);
  const [ub, setUb] = useState<UserBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: b } = await supabase.from("books").select("*").eq("id", id).maybeSingle();
      if (cancelled) return;
      setBook(b as Book);
      if (user && b) {
        const { data: u } = await supabase
          .from("user_books").select("*").eq("user_id", user.id).eq("book_id", b.id).maybeSingle();
        if (!cancelled) setUb(u as UserBook);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, user]);

  // Optimistic write — update UI immediately, then persist
  const commit = async (patch: Partial<UserBook>) => {
    if (!user || !book) return;
    const prev = ub;
    const optimistic: UserBook = {
      id: ub?.id ?? "temp",
      user_id: user.id,
      book_id: book.id,
      status: (patch.status ?? ub?.status ?? "not_read") as BookStatus,
      rating: patch.rating ?? ub?.rating ?? null,
      notes: patch.notes ?? ub?.notes ?? null,
      current_page: patch.current_page ?? ub?.current_page ?? 0,
      is_public: ub?.is_public ?? true,
      started_at: ub?.started_at ?? null,
      finished_at: patch.status === "read" ? new Date().toISOString() : (ub?.finished_at ?? null),
      created_at: ub?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
      book,
    };
    setUb(optimistic);
    setSaving(true);

    const payload = {
      user_id: user.id,
      book_id: book.id,
      status: optimistic.status,
      rating: optimistic.rating,
      notes: optimistic.notes,
      current_page: optimistic.current_page,
      is_public: optimistic.is_public,
      ...(patch.status === "read" && !ub?.finished_at ? { finished_at: new Date().toISOString() } : {}),
      ...(patch.status === "reading" && !ub?.started_at ? { started_at: new Date().toISOString() } : {}),
    };

    const { data, error } = await supabase
      .from("user_books")
      .upsert(payload, { onConflict: "user_id,book_id" })
      .select()
      .single();

    if (error) {
      setUb(prev);
      toast.error("Não foi possível salvar");
    } else {
      setUb({ ...(data as UserBook), book });
      checkAchievements(user.id);
    }
    setSaving(false);
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

  if (loading) {
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
      <BookHero
        book={book}
        ub={ub}
        saving={saving}
        onStatusChange={(s) => commit({ status: s })}
        onAddWishlist={() => commit({ status: "wishlist" })}
        onShare={share}
        onBookUpdated={(b) => setBook(b)}
      />

      <div className="px-5 md:px-10 pb-20 max-w-6xl mx-auto grid md:grid-cols-[1fr_340px] gap-10 md:gap-14 mt-4">
        <BookSynopsis
          bookId={book.id}
          description={book.description}
          onDescriptionUpdated={(d) => setBook({ ...book, description: d })}
        />
        {ub && (
          <BookSidePanel
            book={book}
            ub={ub}
            onUpdate={(patch) => setUb({ ...ub, ...patch })}
            onCommit={commit}
          />
        )}
      </div>

      <div className="px-5 md:px-10 pb-24 max-w-6xl mx-auto">
        <ReviewSection bookId={book.id} />
      </div>
    </AppShell>
  );
}
