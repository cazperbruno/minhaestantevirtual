import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Book, UserBook } from "@/types/book";
import { BookCard } from "@/components/books/BookCard";
import { BookCover } from "@/components/books/BookCover";
import { SearchAutocomplete } from "@/components/search/SearchAutocomplete";
import { ContentTypeFilter, useContentFilter } from "@/components/books/ContentTypeFilter";
import { Sparkles, ChevronRight, Library, ScanLine, Infinity as InfinityIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchShelves, type Shelf } from "@/lib/recommend-api";
import { trackRecsShown, recomputeUserWeights } from "@/lib/ai-tracking";

export default function Discover() {
  const { user } = useAuth();
  const { active: activeTypes } = useContentFilter();
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

  const featured: Book | null = reading[0]?.book ?? shelves[0]?.books?.[0] ?? null;

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
                    {reading[0] ? "Continue lendo" : "Em destaque para você"}
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

        {/* Continue lendo */}
        {reading.length > 1 && (
          <Section title="Continue lendo">
            <Shelf>
              {reading.slice(1).map((ub) => ub.book && (
                <BookCard key={ub.id} book={ub.book} size="md" source="shelf:reading" />
              ))}
            </Shelf>
          </Section>
        )}

        {/* Prateleiras dinâmicas (IA) */}
        {loading && (
          <>
            {Array.from({ length: 3 }).map((_, i) => (
              <Section key={i} title="">
                <Shelf>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <Skeleton key={j} className="w-28 h-44 rounded-md shrink-0" />
                  ))}
                </Shelf>
              </Section>
            ))}
          </>
        )}

        {!loading && shelves.map((shelf) => shelf.books.length > 0 && (
          <Section
            key={shelf.id}
            title={shelf.title}
            subtitle={shelf.reason}
          >
            <Shelf>
              {shelf.books.map((b) => (
                <div key={b.id} className="shrink-0 w-28 md:w-auto">
                  <BookCard book={b} size="md" source={`shelf:${shelf.id}`} />
                </div>
              ))}
            </Shelf>
          </Section>
        ))}

        {/* CTA para feed infinito */}
        {!loading && shelves.length > 0 && (
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

function Section({
  title, subtitle, children,
}: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mb-10 animate-slide-up">
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h2 className="font-display text-2xl font-semibold">{title}</h2>}
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

function Shelf({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-5 overflow-x-auto scrollbar-hide scroll-snap-x animate-stagger -mx-5 px-5 md:mx-0 md:px-0 md:grid md:grid-cols-[repeat(auto-fill,minmax(140px,1fr))] pb-2 gpu">
      {children}
    </div>
  );
}
