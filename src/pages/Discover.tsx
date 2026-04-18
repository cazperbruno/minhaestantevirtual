import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Book, UserBook } from "@/types/book";
import { BookCard } from "@/components/books/BookCard";
import { Link } from "react-router-dom";
import { Search, Sparkles, TrendingUp, Library, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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

  useEffect(() => {
    (async () => {
      // Fetch user's currently reading
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
      // Fetch shelves in parallel
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

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 md:pt-12 pb-16 max-w-7xl mx-auto">
        {/* Hero */}
        <header className="mb-10 animate-fade-in">
          <p className="text-sm text-primary font-medium mb-2 flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Bem-vindo à Página
          </p>
          <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.05] mb-4">
            Cada livro merece <span className="text-gradient-gold italic">um lugar</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl">
            Descubra, organize e celebre suas leituras em um único lugar. Curado para quem ama livros.
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <Link to="/buscar">
              <Button variant="hero" size="lg" className="gap-2">
                <Search className="w-4 h-4" /> Buscar livros
              </Button>
            </Link>
            <Link to="/biblioteca">
              <Button variant="outline" size="lg" className="gap-2">
                <Library className="w-4 h-4" /> Minha biblioteca
              </Button>
            </Link>
          </div>
        </header>

        {/* Continue lendo */}
        {reading.length > 0 && (
          <Section title="Continue lendo" icon={<TrendingUp className="w-4 h-4 text-primary" />}>
            <Shelf>
              {reading.map((ub) => ub.book && (
                <BookCard key={ub.id} book={ub.book} size="md" />
              ))}
            </Shelf>
          </Section>
        )}

        {/* Shelves */}
        {loading
          ? FEATURED_QUERIES.map((s) => (
              <Section key={s.label} title={s.label}>
                <Shelf>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="w-28 h-44 rounded-md" />
                  ))}
                </Shelf>
              </Section>
            ))
          : Object.entries(shelves).map(([label, books]) => (
              <Section key={label} title={label}>
                <Shelf>
                  {books.map((b, i) => (
                    <BookCard key={b.id ?? `${label}-${i}`} book={b} size="md" />
                  ))}
                </Shelf>
              </Section>
            ))}
      </div>
    </AppShell>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-10 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-2xl font-semibold flex items-center gap-2">
          {icon} {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Shelf({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-5 overflow-x-auto scrollbar-hide -mx-5 px-5 md:mx-0 md:px-0 md:grid md:grid-cols-[repeat(auto-fill,minmax(140px,1fr))] pb-2">
      {children}
    </div>
  );
}
