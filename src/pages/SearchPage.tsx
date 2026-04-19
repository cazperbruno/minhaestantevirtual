import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Loader2, Search, ScanLine, BookOpen, Sparkles } from "lucide-react";
import { searchBooksGet, lookupIsbn } from "@/lib/books-api";
import { Book } from "@/types/book";
import { BookCard } from "@/components/books/BookCard";
import { SearchAutocomplete } from "@/components/search/SearchAutocomplete";
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

export default function SearchPage() {
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
    try {
      const digits = value.replace(/\D/g, "");
      const looksLikeIsbn = digits.length === 10 || digits.length === 13;
      if (looksLikeIsbn) {
        const b = await lookupIsbn(digits);
        if (b) {
          setResults([b]);
        } else {
          const list = await searchBooksGet(value);
          setResults(list);
          if (list.length === 0) toast.info("Nada encontrado para este ISBN");
        }
      } else {
        const list = await searchBooksGet(value);
        setResults(list);
      }
    } catch (err: any) {
      toast.error(err.message || "Erro na busca");
    } finally {
      setBusy(false);
    }
  };

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
          className="mb-8"
        />

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

        {/* No results — never decepciona, sempre oferece próximo passo */}
        {activeQuery && !busy && results.length === 0 && (
          <div className="text-center py-12 animate-fade-in">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Search className="w-7 h-7 text-primary" />
            </div>
            <p className="font-display text-2xl font-semibold">
              Nenhum resultado para “{activeQuery}”
            </p>
            <p className="text-muted-foreground mt-2 max-w-md mx-auto">
              {isIsbn
                ? "Esse ISBN não foi localizado em nenhuma fonte. Tente buscar pelo título e autor."
                : "Tente outras palavras, verifique a grafia ou use o scanner."}
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-6">
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
            <div className="mt-8 pt-6 border-t border-border/40 max-w-md mx-auto">
              <p className="text-xs text-muted-foreground mb-3">
                Não encontrou? Adicione você mesmo — entra direto na sua biblioteca.
              </p>
              <AddBookManualDialog initialTitle={activeQuery} />
            </div>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && !busy && (
          <div className="animate-fade-in">
            <p className="text-sm text-muted-foreground mb-5">
              {results.length} resultado{results.length === 1 ? "" : "s"} para “
              <span className="text-foreground font-medium">{activeQuery}</span>”
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-5 gap-y-8">
              {results.map((b) => (
                <BookCard key={b.id || b.source_id || `${b.title}-${b.authors?.[0] || ""}`} book={b} />
              ))}
            </div>
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
