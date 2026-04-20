import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Book, UserBook } from "@/types/book";
import { BookCard } from "@/components/books/BookCard";
import { BookCover } from "@/components/books/BookCover";
import { CinematicShelf, ShelfItem } from "@/components/books/CinematicShelf";
import { ContinueReadingRow } from "@/components/books/ContinueReadingRow";
import { SearchAutocomplete } from "@/components/search/SearchAutocomplete";
import { ContentTypeFilter, useContentFilter } from "@/components/books/ContentTypeFilter";
import { Sparkles, ChevronRight, Library, ScanLine, Infinity as InfinityIcon, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchShelves, type Shelf } from "@/lib/recommend-api";
import { trackRecsShown, recomputeUserWeights } from "@/lib/ai-tracking";
import { useMySeries } from "@/hooks/useMySeries";
import { NextAchievementsCard } from "@/components/gamification/NextAchievementsCard";

export default function Discover() {
  const { user } = useAuth();
  const { active: activeTypes } = useContentFilter();
  const { data: mySeries } = useMySeries();
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState<UserBook[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [shelvesData, readingData] = await Promise.all([
        fetchShelves(),
        supabase
          .from("user_books")
          .select("*, book:books(*)")
          .eq("user_id", user.id)
          .eq("status", "reading")
          .order("updated_at", { ascending: false })
          .limit(8)
          .then((r) => (r.data as UserBook[]) || []),
      ]);
      if (cancelled) return;
      setShelves(shelvesData);
      setReading(readingData);
      setLoading(false);

      // AI: contabiliza recomendações exibidas (denominador do CTR)
      const totalRecs = shelvesData.reduce((sum, s) => sum + (s.books?.length || 0), 0);
      if (totalRecs > 0) trackRecsShown(totalRecs);

      // AI: 1x por sessão, recalcula pesos personalizados (collab/content/trending)
      const sessionKey = `ai-weights-recomputed-${user.id}`;
      if (!sessionStorage.getItem(sessionKey)) {
        sessionStorage.setItem(sessionKey, "1");
        recomputeUserWeights(user.id);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Filtra prateleiras pelos tipos ativos (livros sem content_type → "book")
  const visibleShelves = useMemo(() => {
    return shelves
      .map((s) => ({
        ...s,
        books: s.books.filter((b) => activeTypes.includes(b.content_type || "book")),
      }))
      .filter((s) => s.books.length > 0);
  }, [shelves, activeTypes]);

  const visibleReading = useMemo(
    () => reading.filter((ub) => activeTypes.includes(ub.book?.content_type || "book")),
    [reading, activeTypes],
  );

  const featured: Book | null = visibleReading[0]?.book ?? visibleShelves[0]?.books?.[0] ?? null;

  // Próxima série a continuar — mostra atalho discreto após o Featured.
  const continueSeries = useMemo(() => {
    if (!mySeries) return null;
    const set = new Set(activeTypes);
    return (
      mySeries.find(
        (s) =>
          set.has(s.content_type) &&
          s.next_volume != null &&
          s.reading_count + s.read_count > 0,
      ) ?? null
    );
  }, [mySeries, activeTypes]);


  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 md:pt-12 pb-20 max-w-7xl mx-auto">
        {/* Hero */}
        <header className="mb-10 animate-fade-in">
          <p className="text-sm text-primary font-medium mb-2 flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Descubra
          </p>
          <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.05] mb-4 max-w-3xl">
            O próximo livro <span className="text-gradient-gold italic">perfeito</span> para você
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mb-6">
            Recomendações que aprendem com você a cada leitura.
          </p>

          <div className="max-w-2xl">
            <SearchAutocomplete placeholder="Buscar livros, autores ou ISBN…" />
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <Link to="/biblioteca">
              <Button variant="outline" size="sm" className="gap-1.5 rounded-full">
                <Library className="w-3.5 h-3.5" /> Minha biblioteca
              </Button>
            </Link>
            <Link to="/scanner">
              <Button variant="outline" size="sm" className="gap-1.5 rounded-full">
                <ScanLine className="w-3.5 h-3.5" /> Scanner
              </Button>
            </Link>
            <Link to="/feed-infinito">
              <Button variant="hero" size="sm" className="gap-1.5 rounded-full">
                <InfinityIcon className="w-3.5 h-3.5" /> Feed infinito
              </Button>
            </Link>
          </div>

          <ContentTypeFilter className="mt-5" />
        </header>

        {/* Featured */}
        {featured && !loading && (
          <Link
            to={featured.id ? `/livro/${featured.id}` : "/biblioteca"}
            className="block mb-12 group animate-slide-up"
          >
            <div className="relative overflow-hidden rounded-2xl glass p-6 md:p-8">
              {featured.cover_url && (
                <div
                  aria-hidden
                  className="absolute inset-0 -z-10 opacity-30"
                  style={{
                    backgroundImage: `url(${featured.cover_url})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    filter: "blur(60px) saturate(140%)",
                  }}
                />
              )}
              <div className="grid md:grid-cols-[160px_1fr] gap-6 items-center">
                <BookCover book={featured} size="lg" className="shrink-0 group-hover:scale-105 transition-transform" />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-primary mb-2">
                    {visibleReading[0] ? "Continue lendo" : "Em destaque para você"}
                  </p>
                  <h2 className="font-display text-2xl md:text-3xl font-bold leading-tight group-hover:text-primary transition-colors">
                    {featured.title}
                  </h2>
                  {featured.authors?.[0] && (
                    <p className="text-muted-foreground mt-1">{featured.authors.join(", ")}</p>
                  )}
                  {featured.description && (
                    <p className="text-sm text-muted-foreground mt-3 line-clamp-2 max-w-xl">
                      {featured.description}
                    </p>
                  )}
                  <span className="inline-flex items-center gap-1 mt-4 text-sm text-primary font-medium">
                    Abrir <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </div>
              </div>
            </div>
          </Link>
        )}

        {/* Continuar série — atalho discreto para o próximo volume da série em andamento */}
        {continueSeries && !loading && (
          <Link
            to={`/serie/${continueSeries.id}`}
            className="block mb-10 group animate-fade-in"
          >
            <div className="glass rounded-2xl p-4 md:p-5 flex items-center gap-4 hover:border-primary/40 transition-all">
              <div className="w-12 h-16 shrink-0 rounded-md overflow-hidden bg-muted shadow-book">
                {continueSeries.cover_url ? (
                  <img
                    src={continueSeries.cover_url}
                    alt={continueSeries.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center text-muted-foreground">
                    <Layers className="w-5 h-5" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-primary font-semibold flex items-center gap-1">
                  <Layers className="w-3 h-3" /> Continuar série
                </p>
                <p className="font-display font-semibold leading-tight truncate group-hover:text-primary transition-colors">
                  {continueSeries.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Próximo: vol. {continueSeries.next_volume} ·{" "}
                  {continueSeries.read_count}/
                  {continueSeries.total_volumes ?? continueSeries.owned_count} lidos
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
            </div>
          </Link>
        )}


        {/* Conquistas multi-formato perto de desbloquear */}
        {!loading && <NextAchievementsCard />}

        {/* Continue lendo — prateleira cinematográfica com barra de progresso */}
        {visibleReading.length > 1 && (
          <ContinueReadingRow items={visibleReading.slice(1)} />
        )}

        {/* Prateleiras dinâmicas (IA) — skeletons */}
        {loading && (
          <>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="mb-10">
                <Skeleton className="h-7 w-48 mb-4" />
                <div className="flex gap-4 md:gap-5 overflow-hidden">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <Skeleton key={j} className="w-28 md:w-36 h-44 md:h-56 rounded-md shrink-0" />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {!loading && visibleShelves.map((shelf) => (
          <CinematicShelf
            key={shelf.id}
            title={shelf.title}
            subtitle={shelf.reason}
          >
            {shelf.books.map((b) => (
              <ShelfItem key={b.id}>
                <BookCard book={b} size="md" source={`shelf:${shelf.id}`} />
              </ShelfItem>
            ))}
          </CinematicShelf>
        ))}

        {/* CTA para feed infinito */}
        {!loading && visibleShelves.length > 0 && (
          <Link
            to="/feed-infinito"
            className="block glass rounded-2xl p-6 md:p-8 mt-6 text-center hover:border-primary/50 transition-all group"
          >
            <InfinityIcon className="w-8 h-8 text-primary mx-auto mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-display text-2xl font-bold">Quer mais?</h3>
            <p className="text-muted-foreground mt-1">Explore um feed infinito personalizado só pra você.</p>
            <Button variant="hero" className="mt-4 gap-2">
              Abrir feed infinito <ChevronRight className="w-4 h-4" />
            </Button>
          </Link>
        )}

        {/* Empty quando filtro não bate com nenhum item */}
        {!loading && shelves.length > 0 && visibleShelves.length === 0 && (
          <div className="glass rounded-2xl p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Sem recomendações para os formatos selecionados. Ative outros tipos no filtro acima.
            </p>
          </div>
        )}

        {/* Empty state inicial — biblioteca vazia */}
        {!loading && shelves.length === 0 && reading.length === 0 && (
          <div className="glass rounded-2xl p-10 text-center">
            <Sparkles className="w-12 h-12 text-primary mx-auto mb-4" />
            <h2 className="font-display text-2xl font-bold mb-2">Sua jornada começa agora</h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Adicione 1 ou 2 livros à sua biblioteca e nossa IA aprenderá seu gosto na hora.
            </p>
            <div className="flex gap-2 justify-center flex-wrap">
              <Link to="/buscar"><Button variant="hero">Buscar livros</Button></Link>
              <Link to="/scanner"><Button variant="outline" className="gap-1.5"><ScanLine className="w-4 h-4" /> Escanear ISBN</Button></Link>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

