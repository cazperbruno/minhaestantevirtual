import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Book, BookStatus, UserBook, STATUS_LABEL } from "@/types/book";
import { BookCover } from "@/components/books/BookCover";
import { Rating } from "@/components/books/Rating";
import { StatusBadge } from "@/components/books/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Loader2, Heart, ShoppingBag, Share2, Plus, Check } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { InstagramShareCard } from "@/components/books/InstagramShareCard";
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
    (async () => {
      setLoading(true);
      const { data: b } = await supabase.from("books").select("*").eq("id", id).maybeSingle();
      setBook(b as Book);
      if (user && b) {
        const { data: u } = await supabase
          .from("user_books").select("*").eq("user_id", user.id).eq("book_id", b.id).maybeSingle();
        setUb(u as UserBook);
      }
      setLoading(false);
    })();
  }, [id, user]);

  const upsert = async (patch: Partial<Omit<UserBook, "book">>) => {
    if (!user || !book) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      book_id: book.id,
      status: (ub?.status || "not_read") as BookStatus,
      rating: ub?.rating ?? null,
      notes: ub?.notes ?? null,
      current_page: ub?.current_page ?? 0,
      is_public: ub?.is_public ?? true,
      ...patch,
    };
    const { data, error } = await supabase
      .from("user_books")
      .upsert(payload, { onConflict: "user_id,book_id" })
      .select()
      .single();
    if (error) toast.error("Erro ao salvar");
    else {
      setUb({ ...(data as UserBook), book });
      toast.success("Salvo");
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

  // Instagram share now uses InstagramShareCard component (image generation)

  const amazonUrl = book ? `https://www.amazon.com.br/s?k=${encodeURIComponent(
    book.isbn_13 || `${book.title} ${book.authors[0] || ""}`,
  )}&tag=` : "#";

  if (loading) {
    return <AppShell><div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div></AppShell>;
  }
  if (!book) {
    return <AppShell><div className="px-6 py-20 text-center"><p>Livro não encontrado.</p><Link to="/" className="text-primary underline">Voltar</Link></div></AppShell>;
  }

  const progress = book.page_count && ub?.current_page ? Math.round((ub.current_page / book.page_count) * 100) : 0;

  return (
    <AppShell>
      {/* Hero with blurred cover background */}
      <div className="relative">
        {book.cover_url && (
          <div
            aria-hidden
            className="absolute inset-0 -z-10 opacity-30"
            style={{
              backgroundImage: `url(${book.cover_url})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(60px) saturate(140%)",
            }}
          />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-cover-fade" />
        <div className="px-5 md:px-10 pt-10 pb-12 max-w-6xl mx-auto">
          <div className="grid md:grid-cols-[260px_1fr] gap-8 md:gap-12 items-start">
            <BookCover book={book} size="xl" className="mx-auto md:mx-0 animate-scale-in" />
            <div className="animate-fade-in">
              {ub && <StatusBadge status={ub.status} className="mb-3" />}
              <h1 className="font-display text-3xl md:text-5xl font-bold leading-tight">
                {book.title}
              </h1>
              {book.subtitle && <p className="text-lg text-muted-foreground mt-1 italic">{book.subtitle}</p>}
              <p className="text-lg mt-3">
                {book.authors.length > 0 ? book.authors.join(", ") : "Autor desconhecido"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {[book.publisher, book.published_year, book.page_count && `${book.page_count} páginas`]
                  .filter(Boolean).join(" · ")}
              </p>

              {book.categories && book.categories.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {book.categories.slice(0, 6).map((c) => (
                    <Link key={c} to={`/buscar?q=${encodeURIComponent(c)}`}
                      className="px-3 py-1 rounded-full bg-muted/50 hover:bg-muted text-xs text-muted-foreground hover:text-foreground transition-colors">
                      {c}
                    </Link>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2 mt-6">
                {!ub ? (
                  <Button variant="hero" size="lg" onClick={() => upsert({ status: "reading" })} disabled={saving} className="gap-2">
                    <Plus className="w-4 h-4" /> Adicionar à biblioteca
                  </Button>
                ) : (
                  <Select value={ub.status} onValueChange={(v) => upsert({ status: v as BookStatus })}>
                    <SelectTrigger className="w-[180px] h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["not_read", "reading", "read", "wishlist"] as BookStatus[]).map((s) => (
                        <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button variant="outline" size="lg" onClick={() => upsert({ status: "wishlist" })} disabled={saving} className="gap-2">
                  <Heart className="w-4 h-4" /> Desejo
                </Button>
                <Button variant="outline" size="lg" onClick={share} className="gap-2">
                  <Share2 className="w-4 h-4" />
                </Button>
                <InstagramShareCard
                  book={book}
                  rating={ub?.rating}
                  progress={book.page_count && ub?.current_page ? Math.round((ub.current_page / book.page_count) * 100) : null}
                />
                <a href={amazonUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="lg" className="gap-2">
                    <ShoppingBag className="w-4 h-4" /> Amazon
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 md:px-10 pb-20 max-w-6xl mx-auto grid md:grid-cols-[1fr_320px] gap-10">
        <article>
          <h2 className="font-display text-2xl font-semibold mb-3">Sobre o livro</h2>
          <div className="prose prose-invert prose-p:text-muted-foreground max-w-none">
            {book.description
              ? <p className="leading-relaxed whitespace-pre-line">{book.description}</p>
              : <p className="italic text-muted-foreground">Sinopse indisponível.</p>}
          </div>
        </article>

        {ub && (
          <aside className="glass rounded-2xl p-6 h-fit md:sticky md:top-6 space-y-6">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Sua avaliação</p>
              <Rating value={ub.rating ?? 0} onChange={(v) => upsert({ rating: v })} />
            </div>

            {book.page_count && (ub.status === "reading" || ub.status === "read") && (
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Progresso</span>
                  <span className="font-semibold text-primary">{progress}%</span>
                </div>
                <Slider
                  value={[ub.current_page ?? 0]}
                  max={book.page_count}
                  step={1}
                  onValueChange={(v) => setUb({ ...ub, current_page: v[0] })}
                  onValueCommit={(v) => upsert({ current_page: v[0] })}
                />
                <p className="text-xs text-muted-foreground mt-1">{ub.current_page ?? 0} de {book.page_count} páginas</p>
              </div>
            )}

            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Notas pessoais</label>
              <Textarea
                value={ub.notes ?? ""}
                onChange={(e) => setUb({ ...ub, notes: e.target.value })}
                onBlur={() => upsert({ notes: ub.notes })}
                placeholder="Suas anotações sobre o livro..."
                rows={5}
              />
            </div>

            {ub.status === "read" && (
              <div className="flex items-center gap-2 text-sm text-status-read">
                <Check className="w-4 h-4" /> Concluído
              </div>
            )}
          </aside>
        )}
      </div>
    </AppShell>
  );
}
