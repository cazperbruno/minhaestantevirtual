import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { fetchFeed } from "@/lib/recommend-api";
import { track } from "@/lib/track";
import { BookCover } from "@/components/books/BookCover";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart, X, Plus, Loader2, Sparkles, Infinity as InfinityIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Book } from "@/types/book";

interface Item extends Book { _reason?: string }

export default function InfiniteFeedPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const page = await fetchFeed(cursor, 8);
      setItems((prev) => {
        const existing = new Set(prev.map((p) => p.id));
        const fresh = page.books.filter((b: Item) => !existing.has(b.id));
        return [...prev, ...fresh];
      });
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [cursor, hasMore]);

  useEffect(() => { loadMore(); /* initial */ }, []); // eslint-disable-line

  useEffect(() => {
    if (!sentinelRef.current) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMore();
    }, { rootMargin: "400px" });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [loadMore]);

  const dismiss = (id: string) => {
    track("dismiss", id);
    setHidden((s) => new Set(s).add(id));
  };

  const addToLibrary = async (book: Book) => {
    if (!user) return;
    try {
      const { error } = await supabase.from("user_books").insert({
        user_id: user.id, book_id: book.id, status: "wishlist",
      });
      if (error) throw error;
      track("favorite", book.id);
      toast.success(`${book.title} adicionado aos desejos`);
      setHidden((s) => new Set(s).add(book.id));
    } catch (e: any) {
      toast.error(e.message || "Erro");
    }
  };

  const visible = items.filter((i) => !hidden.has(i.id));

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 pb-24 max-w-3xl mx-auto">
        <header className="mb-8 animate-fade-in">
          <p className="text-sm text-primary font-medium mb-2 flex items-center gap-2">
            <InfinityIcon className="w-4 h-4" /> Feed infinito
          </p>
          <h1 className="font-display text-3xl md:text-5xl font-bold leading-tight">
            Só do <span className="text-gradient-gold italic">seu jeito</span>
          </h1>
          <p className="text-muted-foreground mt-2">
            Cada interação ajusta as próximas recomendações em tempo real.
          </p>
        </header>

        <div className="space-y-5">
          {visible.map((b) => (
            <FeedCard
              key={b.id}
              book={b}
              onDismiss={() => dismiss(b.id)}
              onAdd={() => addToLibrary(b)}
            />
          ))}

          {loading && Array.from({ length: 2 }).map((_, i) => (
            <div key={`sk-${i}`} className="glass rounded-2xl p-5 flex gap-4">
              <Skeleton className="w-24 h-36 shrink-0" />
              <div className="flex-1 space-y-2 pt-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3 w-full mt-3" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
          ))}

          <div ref={sentinelRef} className="h-10" />

          {!hasMore && visible.length > 0 && (
            <div className="text-center py-8">
              <Sparkles className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Você viu tudo. Adicione mais livros e a IA traz coisa nova.
              </p>
              <Link to="/buscar"><Button variant="outline" className="mt-3">Buscar livros</Button></Link>
            </div>
          )}

          {!loading && visible.length === 0 && (
            <div className="glass rounded-2xl p-10 md:p-12 text-center animate-fade-in">
              <div className="w-20 h-20 rounded-3xl bg-gradient-spine border border-border mx-auto mb-5 flex items-center justify-center shadow-book">
                <Sparkles className="w-9 h-9 text-primary/60" />
              </div>
              <h2 className="font-display text-2xl font-semibold mb-2">Comece sua biblioteca</h2>
              <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">
                Adicione 1 ou 2 livros para a IA aprender seu gosto e gerar recomendações sob medida.
              </p>
              <Link to="/buscar"><Button variant="hero" size="lg" className="gap-2"><Sparkles className="w-4 h-4" /> Buscar agora</Button></Link>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function FeedCard({
  book, onDismiss, onAdd,
}: { book: Item; onDismiss: () => void; onAdd: () => void }) {
  useEffect(() => { track("view", book.id, { source: "feed_infinito" }); }, [book.id]);

  return (
    <article className="glass rounded-2xl p-4 sm:p-5 flex gap-3 sm:gap-4 animate-slide-up group hover:border-primary/40 transition-all max-w-full overflow-hidden">
      <Link to={`/livro/${book.id}`} onClick={() => track("click", book.id, { source: "feed_infinito" })} className="shrink-0">
        <BookCover book={book} size="sm" className="shrink-0 sm:hidden group-hover:scale-[1.03] transition-transform" />
        <BookCover book={book} size="md" className="shrink-0 hidden sm:block group-hover:scale-[1.03] transition-transform" />
      </Link>
      <div className="flex-1 min-w-0 flex flex-col">
        {book._reason && (
          <p className="text-[10px] font-medium uppercase tracking-wider text-primary mb-1 truncate">
            {book._reason}
          </p>
        )}
        <Link to={`/livro/${book.id}`} className="block" onClick={() => track("click", book.id, { source: "feed_infinito" })}>
          <h3 className="font-display text-base sm:text-lg font-semibold leading-tight line-clamp-2 group-hover:text-primary transition-colors break-words">
            {book.title}
          </h3>
        </Link>
        {book.authors?.[0] && (
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 truncate">{book.authors.slice(0, 2).join(", ")}</p>
        )}
        {book.description && (
          <p className="text-xs text-muted-foreground/90 mt-2 line-clamp-2 sm:line-clamp-3">{book.description}</p>
        )}
        <div className="mt-auto grid grid-cols-2 gap-2 pt-3 sm:flex sm:flex-wrap sm:items-center sm:gap-1.5">
          <Button size="sm" variant="hero" onClick={onAdd} className="col-span-1 h-8 w-full px-2.5 text-xs sm:w-auto sm:text-sm">
            <Plus className="w-3.5 h-3.5" /> <span className="hidden xs:inline">Lista de desejos</span><span className="xs:hidden">Quero</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDismiss}
            className="col-span-1 h-8 w-full px-2 text-xs text-muted-foreground sm:w-auto sm:text-sm"
            aria-label="Dispensar"
          >
            <X className="w-3.5 h-3.5" /> <span className="hidden xs:inline">Não, obrigado</span>
          </Button>
        </div>
      </div>
    </article>
  );
}
