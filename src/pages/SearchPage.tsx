import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Loader2, Search, ScanLine, BookOpen, Sparkles, ShoppingCart, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { searchBooksGet, lookupIsbn } from "@/lib/books-api";
import { searchManga } from "@/lib/anilist-api";
import { trackSearch } from "@/lib/ai-tracking";
import { trackEvent } from "@/lib/track";
import { rerankByTaste } from "@/lib/search-rerank";
import { useAuth } from "@/hooks/useAuth";
import { Book } from "@/types/book";
import { BookCard } from "@/components/books/BookCard";
import { SearchAutocomplete } from "@/components/search/SearchAutocomplete";
import { ContentTypeFilter, useContentFilter } from "@/components/books/ContentTypeFilter";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AddBookManualDialog } from "@/components/books/AddBookManualDialog";
import { toast } from "sonner";

const TRENDING = [
  "Machado de Assis",
  "Clarice Lispector",
  "Cem anos de solidão",
  "Sapiens",
  "1984",
  "Pequeno Príncipe",
  "Mindset",
  "Dom Casmurro",
];

const AMAZON_TAG =
  (import.meta.env.VITE_AMAZON_AFFILIATE_TAG as string | undefined) || "cazperbruno-20";

/** Constrói URL Amazon BR de busca por termo livre, com tag de afiliado. */
function amazonSearchUrlForQuery(query: string): string {
  const params = new URLSearchParams({ k: query });
  if (AMAZON_TAG) params.set("tag", AMAZON_TAG);
  return `https://www.amazon.com.br/s?${params.toString()}`;
}

/** Registra clique Amazon vindo de busca sem resultados (sem book_id). */
async function trackAmazonFallbackClick(query: string) {
  trackEvent("amazon_fallback_clicked", { query });
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // Usa search_log para o termo + meta indicando conversão Amazon.
    await supabase.from("search_log").insert({
      user_id: user.id,
      query: `__amazon_fallback__:${query.toLowerCase().trim()}`,
    });
  } catch { /* silent */ }
}

export default function SearchPage() {
  const { user } = useAuth();
  const { active: activeTypes, available } = useContentFilter();
  const [params, setParams] = useSearchParams();
  const initialQ = params.get("q") ?? "";
  const [results, setResults] = useState<Book[]>([]);
  const [busy, setBusy] = useState(false);
  const [activeQuery, setActiveQuery] = useState<string>(initialQ);
  const lastRunRef = useRef<string>("");

  const isIsbn = useMemo(() => {
    const d = activeQuery.replace(/\D/g, "");
    return d.length === 10 || d.length === 13;
  }, [activeQuery]);

  const runQuery = async (raw: string) => {
    const value = raw.trim();
    if (!value || value === lastRunRef.current) return;
    lastRunRef.current = value;
    setBusy(true);
    setActiveQuery(value);
    // AI: registra busca como sinal de interesse temporário (boost por 7 dias)
    trackSearch(value);
    const t0 = performance.now();
    try {
      const digits = value.replace(/\D/g, "");
      const looksLikeIsbn = digits.length === 10 || digits.length === 13;
      if (looksLikeIsbn) {
        const b = await lookupIsbn(digits);
        if (b) {
          setResults([b]);
          trackEvent("search_executed", { query: value, kind: "isbn", results: 1, latency_ms: Math.round(performance.now() - t0) });
        } else {
          const list = await searchBooksGet(value);
          setResults(list);
          trackEvent("search_executed", { query: value, kind: "isbn_fallback", results: list.length, latency_ms: Math.round(performance.now() - t0) });
          if (list.length === 0) toast.info("Nada encontrado para este ISBN");
        }
      } else {
        // Busca em paralelo: Books (Google/OpenLibrary) + AniList (mangás)
        // Só inclui AniList se o usuário curte mangás.
        const wantsManga = available.includes("manga");
        const [books, manga] = await Promise.all([
          searchBooksGet(value),
          wantsManga ? searchManga(value) : Promise.resolve([]),
        ]);
        // Books vêm sem content_type explícito da função → assume "book"
        const booksTyped: Book[] = books.map((b) => ({
          ...b,
          content_type: b.content_type || "book",
        }));
        const merged = [...booksTyped, ...manga];
        // AI: reordena por afinidade do usuário (categorias × user_taste)
        const ranked = user ? await rerankByTaste(merged, user.id, value) : merged;
        setResults(ranked);
        trackEvent("search_executed", {
          query: value, kind: "text", results: ranked.length,
          books: booksTyped.length, manga: manga.length,
          latency_ms: Math.round(performance.now() - t0),
        });
      }
    } catch (err: any) {
      trackEvent("search_error", { query: value, message: err?.message ?? "unknown" });
      toast.error(err.message || "Erro na busca");
    } finally {
      setBusy(false);
    }
  };

  // Filtra resultados pelos tipos ativos (UI puramente client-side)
  const visible = useMemo(() => {
    if (!results.length) return results;
    return results.filter((b) => {
      const t = b.content_type || "book";
      return activeTypes.includes(t);
    });
  }, [results, activeTypes]);

  // Auto-run when arriving with ?q=
  useEffect(() => {
    if (initialQ.trim()) runQuery(initialQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ]);

  const handleSubmit = (q: string) => {
    setParams({ q });
    runQuery(q);
  };

  const handleTrending = (term: string) => handleSubmit(term);

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 md:pt-12 pb-20 max-w-6xl mx-auto">
        <header className="mb-6 animate-fade-in">
          <h1 className="font-display text-3xl md:text-5xl font-bold leading-tight">
            Encontre o próximo livro
          </h1>
          <p className="text-muted-foreground mt-2">
            Título, autor, palavra-chave ou ISBN. Buscamos em todo o catálogo.
          </p>
        </header>

        <SearchAutocomplete
          autoFocus={!initialQ}
          onSubmit={handleSubmit}
          className="mb-4"
        />
        <ContentTypeFilter className="mb-8" />

        {/* Empty state — never feels broken */}
        {!activeQuery && !busy && (
          <div className="space-y-10 animate-slide-up">
            <section>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-3">
                Tendências agora
              </p>
              <div className="flex flex-wrap gap-2">
                {TRENDING.map((t) => (
                  <button
                    key={t}
                    onClick={() => handleTrending(t)}
                    className="px-4 py-2 rounded-full bg-card hover:bg-muted border border-border hover:border-primary/40 text-sm transition-all"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </section>

            <section className="grid sm:grid-cols-3 gap-4">
              <Tip icon={<Sparkles className="w-4 h-4" />} title="Inteligente" desc="Detecta ISBN, título ou autor automaticamente." />
              <Tip icon={<ScanLine className="w-4 h-4" />} title="Scanner" desc="Aponte a câmera para o código de barras." linkTo="/scanner" linkLabel="Abrir scanner" />
              <Tip icon={<BookOpen className="w-4 h-4" />} title="Atalhos" desc="Pressione ⌘K em qualquer página para buscar." />
            </section>
          </div>
        )}

        {/* Loading */}
        {busy && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-5 gap-y-8">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="w-full aspect-[2/3] rounded-md" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        )}

        {/* No results — Amazon como fallback monetizado, demais opções secundárias */}
        {activeQuery && !busy && results.length === 0 && (
          <div className="max-w-xl mx-auto text-center py-10 animate-fade-in">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Search className="w-7 h-7 text-primary" />
            </div>
            <h2 className="font-display text-2xl md:text-3xl font-semibold">
              Não encontramos esse livro no Readify
            </h2>
            <p className="text-muted-foreground mt-2">
              Mas você pode encontrar na Amazon.
            </p>

            {/* CTA principal — Amazon */}
            <a
              href={amazonSearchUrlForQuery(activeQuery)}
              target="_blank"
              rel="noopener noreferrer sponsored"
              onClick={() => trackAmazonFallbackClick(activeQuery)}
              className="inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-full bg-gradient-gold text-primary-foreground font-semibold shadow-glow hover:shadow-elevated hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <ShoppingCart className="w-4 h-4" />
              Ver na Amazon 🔥
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>
            <p className="text-[11px] text-muted-foreground mt-2">
              Buscando “<span className="text-foreground/80 font-medium">{activeQuery}</span>” na Amazon Brasil ·
              Como afiliados, ganhamos uma pequena comissão sem custo extra para você.
            </p>

            {/* Ações secundárias */}
            <div className="mt-8 pt-6 border-t border-border/40">
              <p className="text-xs text-muted-foreground mb-3">
                {isIsbn
                  ? "Ou tente buscar pelo título e autor:"
                  : "Ou tente outra coisa:"}
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {TRENDING.slice(0, 5).map((t) => (
                  <button
                    key={t}
                    onClick={() => handleTrending(t)}
                    className="px-3 py-1.5 rounded-full bg-card hover:bg-muted border border-border text-xs transition-colors"
                  >
                    {t}
                  </button>
                ))}
                <Link to="/scanner">
                  <Button variant="outline" size="sm" className="rounded-full gap-1.5">
                    <ScanLine className="w-3.5 h-3.5" /> Scanner
                  </Button>
                </Link>
              </div>
              <div className="mt-6">
                <p className="text-xs text-muted-foreground mb-3">
                  Já tem em casa? Adicione manualmente — entra direto na sua biblioteca.
                </p>
                <AddBookManualDialog initialTitle={activeQuery} />
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && !busy && (
          <div className="animate-fade-in">
            <p className="text-sm text-muted-foreground mb-5">
              {visible.length} de {results.length} resultado{results.length === 1 ? "" : "s"} para “
              <span className="text-foreground font-medium">{activeQuery}</span>”
              {visible.length < results.length && (
                <span className="ml-2 text-xs">(filtro ativo)</span>
              )}
            </p>
            {visible.length === 0 ? (
              <div className="max-w-xl mx-auto text-center py-10 animate-fade-in">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Search className="w-7 h-7 text-primary" />
                </div>
                <h2 className="font-display text-2xl md:text-3xl font-semibold">
                  Nenhum resultado nos formatos selecionados
                </h2>
                <p className="text-muted-foreground mt-2">
                  Ajuste o filtro acima — ou veja na Amazon.
                </p>
                <a
                  href={amazonSearchUrlForQuery(activeQuery)}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  onClick={() => trackAmazonFallbackClick(activeQuery)}
                  className="inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-full bg-gradient-gold text-primary-foreground font-semibold shadow-glow hover:shadow-elevated hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Ver na Amazon 🔥
                  <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                </a>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Buscando “<span className="text-foreground/80 font-medium">{activeQuery}</span>” na Amazon Brasil ·
                  Como afiliados, ganhamos uma pequena comissão sem custo extra para você.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-5 gap-y-8">
                {visible.map((b) => (
                  <BookCard key={b.id || b.source_id || `${b.title}-${b.authors?.[0] || ""}`} book={b} />
                ))}
              </div>
            )}
            <div className="mt-10 pt-6 border-t border-border/40 text-center">
              <p className="text-sm text-muted-foreground mb-3">Não é nenhum desses?</p>
              <AddBookManualDialog initialTitle={activeQuery} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Tip({
  icon, title, desc, linkTo, linkLabel,
}: { icon: React.ReactNode; title: string; desc: string; linkTo?: string; linkLabel?: string }) {
  return (
    <div className="glass rounded-xl p-5">
      <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center mb-3">
        {icon}
      </div>
      <h3 className="font-display font-semibold text-base">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1">{desc}</p>
      {linkTo && (
        <Link to={linkTo} className="inline-block mt-3 text-sm text-primary hover:underline">
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}
