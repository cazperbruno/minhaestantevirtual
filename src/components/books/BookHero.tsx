import { Link } from "react-router-dom";
import { useState } from "react";
import { Book, BookStatus, UserBook, STATUS_LABEL } from "@/types/book";
import { BookCover } from "./BookCover";
import { StatusBadge } from "./StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { InstagramShareCard } from "./InstagramShareCard";
import { EditBookDialog } from "./EditBookDialog";
import { Heart, ShoppingBag, Share2, Plus, Loader2, Pencil, RefreshCw } from "lucide-react";
import { openAmazon } from "@/lib/amazon";
import { bookCoverTransitionName } from "@/lib/view-transitions";
import { refreshBookData } from "@/lib/refresh-book";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  const [refreshing, setRefreshing] = useState(false);
  const progress = book.page_count && ub?.current_page
    ? Math.round((ub.current_page / book.page_count) * 100) : null;

  const handleRefresh = async () => {
    setRefreshing(true);
    const tid = toast.loading("Buscando dados atualizados…");
    try {
      const r = await refreshBookData(book.id, book.cover_url);
      if (!r.ok) throw new Error("Falha ao reprocessar");
      if (r.fields_filled.length === 0 && !r.cover_updated) {
        toast.success("Já está completo — nada a melhorar", { id: tid });
      } else {
        const { data } = await supabase.from("books").select("*").eq("id", book.id).maybeSingle();
        if (data) onBookUpdated?.(data as Book);
        const labels: Record<string, string> = {
          title: "título", subtitle: "subtítulo", authors: "autores",
          publisher: "editora", published_year: "ano", description: "descrição",
          categories: "categorias", page_count: "páginas", language: "idioma",
          cover_url: "capa",
        };
        const updated = r.fields_filled.map((k) => labels[k] || k);
        if (r.cover_updated && !updated.includes("capa")) updated.push("capa");
        toast.success(`Atualizado: ${updated.join(", ")}`, { id: tid });
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao atualizar dados", { id: tid });
    } finally {
      setRefreshing(false);
    }
  };

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

      <div className="px-5 md:px-10 pt-10 md:pt-16 pb-12 max-w-6xl mx-auto w-full min-w-0">
        <div className="grid md:grid-cols-[280px_1fr] gap-8 md:gap-14 items-start min-w-0">
          <div className="mx-auto md:mx-0 animate-scale-in drop-shadow-[0_25px_50px_hsl(var(--primary)/0.25)]">
            <BookCover book={book} size="xl" transitionName={bookCoverTransitionName(book.id)} />
          </div>

          <div className="space-y-5 min-w-0 w-full">
            {ub && (
              <div className="hero-stagger" style={{ animationDelay: "60ms" }}>
                <StatusBadge status={ub.status} />
              </div>
            )}

            <div className="space-y-2 hero-stagger min-w-0" style={{ animationDelay: "120ms" }}>
              <h1 className="font-display text-3xl sm:text-4xl md:text-6xl font-bold leading-[1.1] text-foreground break-words hyphens-auto">
                {book.title}
              </h1>
              {book.subtitle && (
                <p className="text-base sm:text-lg md:text-xl text-muted-foreground italic font-display break-words">
                  {book.subtitle}
                </p>
              )}
            </div>

            <div className="space-y-1 hero-stagger min-w-0" style={{ animationDelay: "220ms" }}>
              <p className="text-base sm:text-lg md:text-xl text-foreground/95 break-words">
                {book.authors.length > 0 ? book.authors.join(", ") : "Autor desconhecido"}
              </p>
              <p className="text-sm text-muted-foreground break-words">
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

            {/* Status / CTA principal — sempre acima da linha de ações */}
            <div className="pt-2 hero-stagger" style={{ animationDelay: "480ms" }}>
              {!ub ? (
                <Button
                  variant="hero"
                  size="lg"
                  onClick={() => onStatusChange("not_read")}
                  disabled={saving}
                  className="w-full sm:w-auto sm:min-w-[240px] shadow-glow"
                  title="Adiciona à sua biblioteca. Você decide quando começar a leitura."
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Adicionar à biblioteca
                </Button>
              ) : (
                <Select value={ub.status} onValueChange={(v) => onStatusChange(v as BookStatus)}>
                  <SelectTrigger className="h-11 w-full bg-card/80 backdrop-blur-sm border-primary/40 shadow-glow sm:w-[240px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["not_read", "reading", "read", "wishlist"] as BookStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Linha única de ações — scroll horizontal no mobile, flex no desktop.
                Mesma altura, mesmo gap, ícone + texto curto sempre visível. */}
            <div
              className="hero-stagger -mx-5 md:mx-0 px-5 md:px-0 overflow-x-auto scrollbar-hide"
              style={{ animationDelay: "560ms" }}
            >
              <div className="flex items-center gap-2 w-max md:w-auto md:flex-wrap">
                <EditBookDialog
                  book={book}
                  onUpdated={onBookUpdated}
                  trigger={
                    <Button variant="outline" size="default" className="h-10 shrink-0 gap-2 hover:border-primary/60 hover:text-primary" aria-label="Editar livro">
                      <Pencil className="w-4 h-4" />
                      <span>Editar</span>
                    </Button>
                  }
                />

                <Button
                  variant="outline"
                  size="default"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="h-10 shrink-0 gap-2 hover:border-primary/60 hover:text-primary"
                  aria-label="Atualizar informações do livro"
                  title="Reprocessa título, autor, descrição, capa, editora, idioma e categorias usando múltiplas fontes"
                >
                  {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  <span>Atualizar dados</span>
                </Button>

                <Button
                  variant="outline"
                  size="default"
                  onClick={onShare}
                  className="h-10 shrink-0 gap-2 hover:border-primary/60 hover:text-primary"
                  aria-label="Compartilhar"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Compartilhar</span>
                </Button>

                <InstagramShareCard
                  book={book}
                  rating={ub?.rating}
                  progress={progress}
                />

                <Button
                  variant="outline"
                  size="default"
                  onClick={() => openAmazon(book)}
                  className="h-10 shrink-0 gap-2 hover:border-primary/60 hover:text-primary"
                  aria-label="Comprar na Amazon"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Amazon</span>
                </Button>

                <Button
                  variant="outline"
                  size="default"
                  onClick={onAddWishlist}
                  disabled={saving}
                  className="h-10 shrink-0 gap-2 hover:border-primary/60 hover:text-primary"
                  aria-label="Adicionar à lista de desejos"
                >
                  <Heart className={`w-4 h-4 ${ub?.status === "wishlist" ? "fill-primary text-primary" : ""}`} />
                  <span>Desejo</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
