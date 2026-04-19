import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Book, UserBook } from "@/types/book";
import { BookCard } from "@/components/books/BookCard";
import { BookCover } from "@/components/books/BookCover";
import { SearchAutocomplete } from "@/components/search/SearchAutocomplete";
import { Sparkles, TrendingUp, Wand2, ChevronRight, Library, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface AiRec { title: string; author: string; reason: string; }

const FEATURED_QUERIES = [
  { label: "Ficção brasileira contemporânea", q: "ficção brasileira" },
  { label: "Clássicos universais", q: "clássicos literatura" },
  { label: "Não-ficção em alta", q: "biografia" },
  { label: "Tecnologia & ideias", q: "tecnologia" },
];

export default function Discover() {
  const { user } = useAuth();
  const [shelves, setShelves] = useState<Record<string, Book[]>>({});
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState<UserBook[]>([]);
  const [recs, setRecs] = useState<AiRec[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);

  useEffect(() => {
    (async () => {
      if (user) {
        const { data } = await supabase
          .from("user_books")
          .select("*, book:books(*)")
          .eq("user_id", user.id)
          .eq("status", "reading")
          .order("updated_at", { ascending: false })
          .limit(8);
        setReading((data as UserBook[]) || []);
      }
      const shelvesData: Record<string, Book[]> = {};
      await Promise.all(
        FEATURED_QUERIES.map(async ({ label, q }) => {
          try {
            const r = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/search-books?action=search&q=${encodeURIComponent(q)}`,
              {
                headers: {
                  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                },
              },
            );
            const j = await r.json();
            shelvesData[label] = (j.results || []).slice(0, 12);
          } catch {
            shelvesData[label] = [];
          }
        }),
      );
      setShelves(shelvesData);
      setLoading(false);
    })();
  }, [user]);

  const loadRecs = async () => {
    if (!user) return;
    setLoadingRecs(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recommend-books`,
        {
          method: "POST",
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
          },
        },
      );
      const j = await r.json();
      if (r.status === 429) toast.error("Limite de IA atingido. Tente em instantes.");
      else if (r.status === 402) toast.error("Créditos AI insuficientes.");
      else if (!r.ok) toast.error(j.error || "Erro nas recomendações");
      else if (j.reason) toast.info(j.reason);
      else setRecs(j.recommendations || []);
    } catch {
      toast.error("Erro ao gerar recomendações");
    } finally {
      setLoadingRecs(false);
    }
  };

  const featured = reading[0]?.book ?? shelves["Clássicos universais"]?.[0] ?? null;

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 md:pt-12 pb-20 max-w-7xl mx-auto">
        {/* Hero — Apple Books style */}
        <header className="mb-10 animate-fade-in">
          <p className="text-sm text-primary font-medium mb-2 flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Bem-vindo
          </p>
          <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.05] mb-4 max-w-3xl">
            Cada livro merece <span className="text-gradient-gold italic">um lugar</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mb-6">
            Descubra, organize e celebre suas leituras em um único lugar.
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
          </div>
        </header>

        {/* Editorial featured card */}
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
                    {reading[0] ? "Continue lendo" : "Em destaque"}
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

        {/* Continue lendo (se mais de 1) */}
        {reading.length > 1 && (
          <Section title="Continue lendo" icon={<TrendingUp className="w-4 h-4 text-primary" />}>
            <Shelf>
              {reading.slice(1).map((ub) => ub.book && (
                <BookCard key={ub.id} book={ub.book} size="md" />
              ))}
            </Shelf>
          </Section>
        )}

        {/* Recomendações IA */}
        {user && (
          <Section title="Recomendações para você" icon={<Wand2 className="w-4 h-4 text-primary" />}>
            {recs.length === 0 ? (
              <div className="glass rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <Wand2 className="w-8 h-8 text-primary shrink-0" />
                <div className="flex-1">
                  <p className="font-display font-semibold">IA curadora</p>
                  <p className="text-sm text-muted-foreground">
                    Receba sugestões personalizadas com base na sua biblioteca.
                  </p>
                </div>
                <Button variant="hero" onClick={loadRecs} disabled={loadingRecs} className="gap-2">
                  <Sparkles className="w-4 h-4" />
                  {loadingRecs ? "Gerando..." : "Gerar"}
                </Button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {recs.map((r, i) => (
                  <Link
                    key={i}
                    to={`/buscar?q=${encodeURIComponent(`${r.title} ${r.author}`)}`}
                    className="glass rounded-xl p-4 hover:border-primary/50 transition-all group"
                  >
                    <p className="font-display font-semibold leading-tight group-hover:text-primary transition-colors">
                      {r.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{r.author}</p>
                    <p className="text-xs mt-2 italic text-muted-foreground/80">"{r.reason}"</p>
                  </Link>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* Shelves */}
        {loading
          ? FEATURED_QUERIES.map((s) => (
              <Section key={s.label} title={s.label}>
                <Shelf>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="w-28 h-44 rounded-md shrink-0" />
                  ))}
                </Shelf>
              </Section>
            ))
          : Object.entries(shelves).map(([label, books]) => (
              books.length > 0 && (
                <Section
                  key={label}
                  title={label}
                  action={
                    <Link
                      to={`/buscar?q=${encodeURIComponent(FEATURED_QUERIES.find((f) => f.label === label)?.q || label)}`}
                      className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                    >
                      Ver mais <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  }
                >
                  <Shelf>
                    {books.map((b, i) => (
                      <div key={b.id ?? `${label}-${i}`} className="shrink-0 w-28 md:w-auto">
                        <BookCard book={b} size="md" />
                      </div>
                    ))}
                  </Shelf>
                </Section>
              )
            ))}
      </div>
    </AppShell>
  );
}

function Section({
  title, icon, action, children,
}: { title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-10 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-2xl font-semibold flex items-center gap-2">
          {icon} {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Shelf({ children }: { children: React.ReactNode }) {
  // "Peek" effect: last items partially visible to suggest scrollability
  return (
    <div className="flex gap-5 overflow-x-auto scrollbar-hide scroll-snap-x animate-stagger -mx-5 px-5 md:mx-0 md:px-0 md:grid md:grid-cols-[repeat(auto-fill,minmax(140px,1fr))] pb-2 gpu">
      {children}
    </div>
  );
}
