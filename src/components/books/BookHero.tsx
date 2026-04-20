import { Link } from "react-router-dom";
import { Book, BookStatus, UserBook, STATUS_LABEL } from "@/types/book";
import { BookCover } from "./BookCover";
import { StatusBadge } from "./StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { InstagramShareCard } from "./InstagramShareCard";
import { BookChat } from "./BookChat";
import { EditBookDialog } from "./EditBookDialog";
import { Heart, ShoppingBag, Share2, Plus, Loader2, Pencil } from "lucide-react";

interface Props {
  book: Book;
  ub: UserBook | null;
  saving: boolean;
  onStatusChange: (s: BookStatus) => void;
  onAddWishlist: () => void;
  onShare: () => void;
  onBookUpdated?: (b: Book) => void;
}

export function BookHero({ book, ub, saving, onStatusChange, onAddWishlist, onShare, onBookUpdated }: Props) {
  const amazonUrl = `https://www.amazon.com.br/s?k=${encodeURIComponent(
    book.isbn_13 || `${book.title} ${book.authors[0] || ""}`,
  )}&tag=`;
  const progress = book.page_count && ub?.current_page
    ? Math.round((ub.current_page / book.page_count) * 100) : null;

  return (
    <div className="relative overflow-hidden bg-background">
      {book.cover_url && (
        <>
          <div
            aria-hidden
            className="absolute inset-0 -z-10 opacity-30"
            style={{
              backgroundImage: `url(${book.cover_url})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(90px) saturate(140%)",
              transform: "scale(1.25)",
            }}
          />
          <div className="absolute inset-0 -z-10 bg-gradient-cover-fade" />
          <div className="absolute inset-0 -z-10 bg-background/50" />
        </>
      )}

      <div className="px-5 md:px-10 pt-10 md:pt-16 pb-12 max-w-6xl mx-auto">
        <div className="grid md:grid-cols-[280px_1fr] gap-8 md:gap-14 items-start">
          <div className="mx-auto md:mx-0 animate-scale-in drop-shadow-[0_25px_50px_hsl(var(--primary)/0.25)]">
            <BookCover book={book} size="xl" />
          </div>

          <div className="animate-fade-in space-y-5">
            {ub && <StatusBadge status={ub.status} />}

            <div className="space-y-2">
              <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.05] text-balance text-foreground">
                {book.title}
              </h1>
              {book.subtitle && (
                <p className="text-lg md:text-xl text-muted-foreground italic font-display">
                  {book.subtitle}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-lg md:text-xl text-foreground/95">
                {book.authors.length > 0 ? book.authors.join(", ") : "Autor desconhecido"}
              </p>
              <p className="text-sm text-muted-foreground">
                {[book.publisher, book.published_year, book.page_count && `${book.page_count} páginas`]
                  .filter(Boolean).join(" · ")}
              </p>
            </div>

            {book.categories && book.categories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {book.categories.slice(0, 6).map((c) => (
                  <Link
                    key={c}
                    to={`/buscar?q=${encodeURIComponent(c)}`}
                    className="px-3 py-1 rounded-full bg-muted/40 hover:bg-primary/15 hover:border-primary/40 text-xs text-muted-foreground hover:text-primary border border-border/40"
                  >
                    {c}
                  </Link>
                ))}
              </div>
            )}

            {progress !== null && ub && (ub.status === "reading" || ub.status === "read") && (
              <div className="max-w-md">
                <div className="flex items-center justify-between text-xs mb-1.5 text-muted-foreground">
                  <span>{ub.current_page} / {book.page_count} páginas</span>
                  <span className="font-semibold text-primary">{progress}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                  <div
                    className="h-full bg-primary shadow-glow rounded-full transition-all duration-700"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              {!ub ? (
                <Button
                  variant="hero"
                  size="lg"
                  onClick={() => onStatusChange("not_read")}
                  disabled={saving}
                  className="gap-2 min-w-[220px] shadow-glow"
                  title="Adiciona à sua biblioteca. Você decide quando começar a leitura."
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Adicionar à biblioteca
                </Button>
              ) : (
                <Select value={ub.status} onValueChange={(v) => onStatusChange(v as BookStatus)}>
                  <SelectTrigger className="w-[220px] h-11 bg-card/80 backdrop-blur-sm border-primary/40 shadow-glow">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["not_read", "reading", "read", "wishlist"] as BookStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Button
                variant="outline"
                size="lg"
                onClick={onAddWishlist}
                disabled={saving}
                className="gap-2 hover:border-primary/60 hover:text-primary"
                aria-label="Adicionar aos desejos"
              >
                <Heart className={`w-4 h-4 ${ub?.status === "wishlist" ? "fill-primary text-primary" : ""}`} />
                <span className="hidden sm:inline">Desejo</span>
              </Button>

              {/* Share + Instagram grouped side-by-side */}
              <div className="inline-flex rounded-md overflow-hidden border border-border bg-card/50 backdrop-blur-sm">
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={onShare}
                  className="gap-2 rounded-none hover:bg-primary/10 hover:text-primary border-0"
                  aria-label="Compartilhar"
                >
                  <Share2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Compartilhar</span>
                </Button>
                <div className="w-px bg-border" />
                <InstagramShareCard
                  book={book}
                  rating={ub?.rating}
                  progress={progress}
                />
              </div>

              <BookChat bookId={book.id} bookTitle={book.title} />

              <a href={amazonUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="lg" className="gap-2 hover:border-primary/60 hover:text-primary">
                  <ShoppingBag className="w-4 h-4" />
                  <span className="hidden sm:inline">Amazon</span>
                </Button>
              </a>

              <EditBookDialog
                book={book}
                onUpdated={onBookUpdated}
                trigger={
                  <Button variant="outline" size="lg" className="gap-2 hover:border-primary/60 hover:text-primary" aria-label="Editar livro">
                    <Pencil className="w-4 h-4" />
                    <span className="hidden sm:inline">Editar</span>
                  </Button>
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
