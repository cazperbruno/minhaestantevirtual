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
import { openAmazon } from "@/lib/amazon";
import { bookCoverTransitionName } from "@/lib/view-transitions";

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
            <BookCover book={book} size="xl" transitionName={bookCoverTransitionName(book.id)} />
          </div>

          <div className="space-y-5">
            {ub && (
              <div className="hero-stagger" style={{ animationDelay: "60ms" }}>
                <StatusBadge status={ub.status} />
              </div>
            )}

            <div className="space-y-2 hero-stagger" style={{ animationDelay: "120ms" }}>
              <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.05] text-balance text-foreground">
                {book.title}
              </h1>
              {book.subtitle && (
                <p className="text-lg md:text-xl text-muted-foreground italic font-display">
                  {book.subtitle}
                </p>
              )}
            </div>

            <div className="space-y-1 hero-stagger" style={{ animationDelay: "220ms" }}>
              <p className="text-lg md:text-xl text-foreground/95">
                {book.authors.length > 0 ? book.authors.join(", ") : "Autor desconhecido"}
              </p>
              <p className="text-sm text-muted-foreground">
                {[book.publisher, book.published_year, book.page_count && `${book.page_count} páginas`]
                  .filter(Boolean).join(" · ")}
              </p>
              {book.series_id && (
                <Link
                  to={`/serie/${book.series_id}`}
                  className="inline-flex items-center gap-1.5 mt-2 text-xs text-primary hover:underline"
                >
                  Ver série completa{book.volume_number ? ` · Vol. ${book.volume_number}` : ""} →
                </Link>
              )}
            </div>

            {book.categories && book.categories.length > 0 && (
              <div className="flex flex-wrap gap-2 hero-stagger" style={{ animationDelay: "320ms" }}>
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
              <div className="max-w-md hero-stagger" style={{ animationDelay: "400ms" }}>
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

            <div className="grid grid-cols-2 gap-2 pt-2 hero-stagger sm:flex sm:flex-wrap" style={{ animationDelay: "480ms" }}>
              {!ub ? (
                <Button
                  variant="hero"
                  size="lg"
                  onClick={() => onStatusChange("not_read")}
                  disabled={saving}
                  className="col-span-2 w-full sm:w-auto sm:min-w-[220px] shadow-glow"
                  title="Adiciona à sua biblioteca. Você decide quando começar a leitura."
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Adicionar à biblioteca
                </Button>
              ) : (
                <Select value={ub.status} onValueChange={(v) => onStatusChange(v as BookStatus)}>
                  <SelectTrigger className="col-span-2 h-11 w-full bg-card/80 backdrop-blur-sm border-primary/40 shadow-glow sm:w-[220px]">
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
                className="w-full sm:w-auto hover:border-primary/60 hover:text-primary"
                aria-label="Adicionar aos desejos"
              >
                <Heart className={`w-4 h-4 ${ub?.status === "wishlist" ? "fill-primary text-primary" : ""}`} />
                <span className="hidden sm:inline">Desejo</span>
              </Button>

              <div className="col-span-2 inline-flex w-full overflow-hidden rounded-md border border-border bg-card/50 backdrop-blur-sm sm:w-auto">
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={onShare}
                  className="min-w-0 flex-1 rounded-none border-0 hover:bg-primary/10 hover:text-primary sm:flex-none"
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

              <div className="col-span-2 sm:col-span-1">
                <BookChat bookId={book.id} bookTitle={book.title} />
              </div>

              <Button
                variant="outline"
                size="lg"
                onClick={() => openAmazon(book)}
                className="w-full sm:w-auto hover:border-primary/60 hover:text-primary"
                aria-label="Comprar na Amazon"
              >
                <ShoppingBag className="w-4 h-4" />
                <span className="hidden sm:inline">Comprar</span>
              </Button>

              <EditBookDialog
                book={book}
                onUpdated={onBookUpdated}
                trigger={
                  <Button variant="outline" size="lg" className="w-full sm:w-auto hover:border-primary/60 hover:text-primary" aria-label="Editar livro">
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
