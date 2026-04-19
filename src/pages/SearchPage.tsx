import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, ScanLine } from "lucide-react";
import { searchBooksGet, lookupIsbn } from "@/lib/books-api";
import { Book } from "@/types/book";
import { BookCard } from "@/components/books/BookCard";
import { toast } from "sonner";

export default function SearchPage() {
  const [params] = useSearchParams();
  const initialQ = params.get("q") ?? "";
  const [q, setQ] = useState(initialQ);
  const [results, setResults] = useState<Book[]>([]);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const autoRan = useRef(false);

  const isIsbn = useMemo(() => /^\d{10}(\d{3})?$/.test(q.replace(/\D/g, "")) && (q.replace(/\D/g, "").length === 10 || q.replace(/\D/g, "").length === 13), [q]);

  const runQuery = async (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    setBusy(true);
    setSubmitted(true);
    try {
      const digits = value.replace(/\D/g, "");
      const looksLikeIsbn = digits.length === 10 || digits.length === 13;
      if (looksLikeIsbn) {
        const b = await lookupIsbn(digits);
        if (b) {
          setResults([b]);
        } else {
          // ISBN not found — fallback to text search using the raw value
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

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    await runQuery(q);
  };

  // Auto-run when arriving with ?q= in the URL (e.g. from scanner fallback)
  useEffect(() => {
    if (autoRan.current) return;
    if (initialQ.trim()) {
      autoRan.current = true;
      runQuery(initialQ);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ]);

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 pb-16 max-w-6xl mx-auto">
        <h1 className="font-display text-3xl md:text-4xl font-bold mb-2">Buscar livros</h1>
        <p className="text-muted-foreground mb-6">Por título, autor ou ISBN. Buscamos em toda a internet.</p>

        <form onSubmit={submit} className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ex: Dom Casmurro, Machado de Assis, 9788535914849..."
            className="pl-12 pr-32 h-14 text-base bg-card border-border"
          />
          <Button
            type="submit"
            disabled={busy || !q.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-10"
            variant="hero"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buscar"}
          </Button>
        </form>

        {!submitted && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Card icon={<Search className="w-5 h-5" />} title="Busca inteligente" desc="Identifica automaticamente ISBN, título ou autor." />
            <Card icon={<ScanLine className="w-5 h-5" />} title="Em breve: scanner" desc="Aponte a câmera para o código de barras do livro." />
          </div>
        )}

        {submitted && !busy && results.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="font-display text-xl">Nenhum resultado encontrado.</p>
            <p className="text-sm mt-2">Tente outra busca.</p>
          </div>
        )}

        {results.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-5 gap-y-8">
            {results.map((b) => <BookCard key={b.id || b.source_id || b.title} book={b} />)}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Card({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="glass rounded-xl p-5">
      <div className="w-10 h-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center mb-3">{icon}</div>
      <h3 className="font-display font-semibold text-lg">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1">{desc}</p>
    </div>
  );
}
