import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Book, UserBook } from "@/types/book";
import { BookCard } from "@/components/books/BookCard";
import { BookCover } from "@/components/books/BookCover";
import { CinematicShelf, ShelfItem } from "@/components/books/CinematicShelf";
import { ContinueReadingRow } from "@/components/books/ContinueReadingRow";
import { SearchAutocomplete } from "@/components/search/SearchAutocomplete";
import { ContentTypeFilter, useContentFilter } from "@/components/books/ContentTypeFilter";
import { ChevronRight, Compass, Layers, Library, ScanLine, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchShelves, type Shelf } from "@/lib/recommend-api";
import { trackRecsShown, recomputeUserWeights } from "@/lib/ai-tracking";
import { useMySeries } from "@/hooks/useMySeries";
import { NextAchievementsCard } from "@/components/gamification/NextAchievementsCard";
import { StoriesBar } from "@/components/social/StoriesBar";
import { FollowingReadsShelfRow } from "@/components/books/FollowingReadsShelfRow";
import { useBecauseYouRead } from "@/hooks/useBecauseYouRead";
import { dedupeByIsbn } from "@/lib/dedupe";
import { StreakAtRiskBanner } from "@/components/gamification/StreakAtRiskBanner";
import { DailySurpriseBox } from "@/components/gamification/DailySurpriseBox";

export default function Discover() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { active: activeTypes } = useContentFilter();
  const { data: mySeries } = useMySeries();
  const { data: becauseYouRead } = useBecauseYouRead(12);
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadIssue, setLoadIssue] = useState(false);
  const [reading, setReading] = useState<UserBook[]>([]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setLoadIssue(false);

      try {
        const [shelvesResult, readingResult] = await Promise.allSettled([
          fetchShelves(),
          supabase
            .from("user_books")
            .select("*, book:books(*)")
            .eq("user_id", userId)
            .eq("status", "reading")
            .order("updated_at", { ascending: false })
            .limit(8),
        ]);

        if (cancelled) return;

        let nextShelves: Shelf[] = [];
        let nextReading: UserBook[] = [];
        let partialFailure = false;

        if (shelvesResult.status === "fulfilled") {
          nextShelves = shelvesResult.value;
        } else {
          partialFailure = true;
          console.error("[Discover] recommendations failed", shelvesResult.reason);
        }

        if (readingResult.status === "fulfilled") {
          if (readingResult.value.error) {
            partialFailure = true;
            console.error("[Discover] reading list failed", readingResult.value.error);
          } else {
            nextReading = (readingResult.value.data as UserBook[]) || [];
          }
        } else {
          partialFailure = true;
          console.error("[Discover] reading list failed", readingResult.reason);
        }

        setShelves(nextShelves);
        setReading(nextReading);
        setLoadIssue(partialFailure);

        const totalRecs = nextShelves.reduce((sum, shelf) => sum + (shelf.books?.length || 0), 0);
        if (totalRecs > 0) trackRecsShown(totalRecs);

        const sessionKey = `ai-weights-recomputed-${userId}`;
        if (!sessionStorage.getItem(sessionKey)) {
          sessionStorage.setItem(sessionKey, "1");
          void recomputeUserWeights(userId);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const visibleShelves = useMemo(() => {
    return shelves
      .map((shelf) => ({
        ...shelf,
        books: dedupeByIsbn(
          shelf.books.filter((book) => activeTypes.includes(book.content_type || "book")),
          (book) => book,
        ),
      }))
      .filter((shelf) => shelf.books.length > 0);
  }, [shelves, activeTypes]);

  const visibleReading = useMemo(
    () => reading.filter((userBook) => activeTypes.includes(userBook.book?.content_type || "book")),
    [reading, activeTypes],
  );

  const featured: Book | null = visibleReading[0]?.book ?? visibleShelves[0]?.books?.[0] ?? null;

  const continueSeries = useMemo(() => {
    if (!mySeries) return null;
    const activeSet = new Set(activeTypes);
    return (
      mySeries.find(
        (series) =>
          activeSet.has(series.content_type) &&
          series.next_volume != null &&
          series.reading_count + series.read_count > 0,
      ) ?? null
    );
  }, [mySeries, activeTypes]);

  const hasLibrarySignal = reading.length > 0 || shelves.length > 0;

  return (
    <div className="mx-auto max-w-7xl px-5 pb-20 pt-6 md:px-10 md:pt-10">
      <header className="mb-8 animate-fade-in md:mb-10">
        <p className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
          <Sparkles className="h-4 w-4" /> Sua biblioteca inteligente
        </p>
        <h1 className="max-w-3xl font-display text-3xl font-bold leading-[1.08] md:text-5xl">
          O que você vai ler agora?
        </h1>
        <p className="mb-5 mt-3 max-w-2xl text-base text-muted-foreground md:text-lg">
          Continue de onde parou, organize sua biblioteca e descubra a próxima leitura.
        </p>

        <div className="max-w-2xl">
          <SearchAutocomplete placeholder="Buscar livros, autores ou ISBN…" />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/scanner">
            <Button variant="hero" size="sm" className="gap-1.5 rounded-full">
              <ScanLine className="h-3.5 w-3.5" /> Escanear
            </Button>
          </Link>
          <Link to="/biblioteca">
            <Button variant="outline" size="sm" className="gap-1.5 rounded-full">
              <Library className="h-3.5 w-3.5" /> Biblioteca
            </Button>
          </Link>
        </div>

        <ContentTypeFilter className="mt-5" />
      </header>

      {loadIssue && !loading && (
        <div className="mb-6 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Algumas informações não puderam ser atualizadas agora. O restante do Readify continua disponível.
        </div>
      )}

      {featured && !loading && (
        <Link
          to={featured.id ? `/livro/${featured.id}` : "/biblioteca"}
          className="group mb-10 block animate-slide-up md:mb-12"
        >
          <div className="relative overflow-hidden rounded-2xl p-5 glass md:p-8">
            {featured.cover_url && (
              <div
                aria-hidden
                className="absolute inset-0 -z-10 opacity-25"
                style={{
                  backgroundImage: `url(${featured.cover_url})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  filter: "blur(60px) saturate(135%)",
                }}
              />
            )}
            <div className="grid items-center gap-5 md:grid-cols-[150px_1fr] md:gap-7">
              <BookCover
                book={featured}
                size="lg"
                className="shrink-0 transition-transform group-hover:scale-[1.03]"
              />
              <div className="min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">
                  {visibleReading[0] ? "Continue lendo" : "Para você"}
                </p>
                <h2 className="font-display text-2xl font-bold leading-tight transition-colors group-hover:text-primary md:text-3xl">
                  {featured.title}
                </h2>
                {featured.authors?.[0] && (
                  <p className="mt-1 text-muted-foreground">{featured.authors.join(", ")}</p>
                )}
                {featured.description && (
                  <p className="mt-3 line-clamp-2 max-w-xl text-sm text-muted-foreground">
                    {featured.description}
                  </p>
                )}
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Abrir <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </div>
          </div>
        </Link>
      )}

      {visibleReading.length > 1 && <ContinueReadingRow items={visibleReading.slice(1)} />}

      {continueSeries && !loading && (
        <Link to={`/serie/${continueSeries.id}`} className="group mb-10 block animate-fade-in">
          <div className="flex items-center gap-4 rounded-2xl p-4 glass transition-colors hover:border-primary/40 md:p-5">
            <div className="h-16 w-12 shrink-0 overflow-hidden rounded-md bg-muted shadow-book">
              {continueSeries.cover_url ? (
                <img
                  src={continueSeries.cover_url}
                  alt={continueSeries.title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="grid h-full w-full place-items-center text-muted-foreground">
                  <Layers className="h-5 w-5" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                <Layers className="h-3 w-3" /> Continuar série
              </p>
              <p className="truncate font-display font-semibold leading-tight transition-colors group-hover:text-primary">
                {continueSeries.title}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Próximo: vol. {continueSeries.next_volume} · {continueSeries.read_count}/
                {continueSeries.total_volumes ?? continueSeries.owned_count} lidos
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
          </div>
        </Link>
      )}

      {!loading && becauseYouRead && becauseYouRead.books.length > 0 && (
        <CinematicShelf
          title={`Porque você leu “${becauseYouRead.seed.title}”`}
          subtitle="Livros parecidos com sua última leitura concluída"
        >
          {dedupeByIsbn(
            becauseYouRead.books.filter((book) => activeTypes.includes(book.content_type || "book")),
            (book) => book,
          ).map((book) => (
            <ShelfItem key={`byr-${book.id}`}>
              <BookCard book={book} size="md" source="shelf:because-you-read" />
            </ShelfItem>
          ))}
        </CinematicShelf>
      )}

      {loading && (
        <>
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="mb-10">
              <Skeleton className="mb-4 h-7 w-48" />
              <div className="flex gap-4 overflow-hidden md:gap-5">
                {Array.from({ length: 6 }).map((__, itemIndex) => (
                  <Skeleton
                    key={itemIndex}
                    className="h-44 w-28 shrink-0 rounded-md md:h-56 md:w-36"
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {!loading &&
        visibleShelves.map((shelf) => (
          <CinematicShelf key={shelf.id} title={shelf.title} subtitle={shelf.reason}>
            {shelf.books.map((book) => (
              <ShelfItem key={book.id}>
                <BookCard book={book} size="md" source={`shelf:${shelf.id}`} />
              </ShelfItem>
            ))}
          </CinematicShelf>
        ))}

      {!loading && shelves.length > 0 && visibleShelves.length === 0 && (
        <div className="rounded-2xl p-8 text-center glass">
          <p className="text-sm text-muted-foreground">
            Sem recomendações para os formatos selecionados. Ative outros tipos no filtro acima.
          </p>
        </div>
      )}

      {!loading && shelves.length === 0 && reading.length === 0 && (
        <div className="rounded-2xl p-8 text-center glass md:p-10">
          <Sparkles className="mx-auto mb-4 h-11 w-11 text-primary" />
          <h2 className="mb-2 font-display text-2xl font-bold">Comece pela sua estante</h2>
          <p className="mx-auto mb-6 max-w-md text-muted-foreground">
            Escaneie ou adicione alguns livros. O Readify usa sua biblioteca para melhorar as próximas recomendações.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/scanner">
              <Button variant="hero" className="gap-1.5">
                <ScanLine className="h-4 w-4" /> Escanear
              </Button>
            </Link>
            <Link to="/buscar">
              <Button variant="outline">Buscar</Button>
            </Link>
          </div>
        </div>
      )}

      {!loading && hasLibrarySignal && (
        <section className="mt-12 border-t border-border/70 pt-9">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Comunidade</p>
            <h2 className="mt-1 font-display text-2xl font-bold">O que está acontecendo por perto</h2>
          </div>
          <StoriesBar />
          <div className="mt-8">
            <FollowingReadsShelfRow />
          </div>
        </section>
      )}

      {!loading && visibleShelves.length > 0 && (
        <Link
          to="/feed-infinito"
          className="group mt-10 block rounded-2xl p-6 text-center glass transition-colors hover:border-primary/50 md:p-8"
        >
          <Compass className="mx-auto mb-3 h-8 w-8 text-primary transition-transform group-hover:scale-110" />
          <h3 className="font-display text-2xl font-bold">Explorar mais</h3>
          <p className="mt-1 text-muted-foreground">Veja uma sequência personalizada de recomendações.</p>
          <Button variant="hero" className="mt-4 gap-2">
            Continuar descobrindo <ChevronRight className="h-4 w-4" />
          </Button>
        </Link>
      )}

      {!loading && hasLibrarySignal && (
        <section className="mt-12 border-t border-border/70 pt-9">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Seu ritmo</p>
            <h2 className="mt-1 font-display text-2xl font-bold">Leitura e conquistas</h2>
          </div>
          <div className="space-y-5">
            <StreakAtRiskBanner />
            <DailySurpriseBox />
            <NextAchievementsCard />
          </div>
        </section>
      )}
    </div>
  );
}
