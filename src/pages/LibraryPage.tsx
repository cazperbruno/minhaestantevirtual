import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { UserBook, BookStatus, STATUS_LABEL } from "@/types/book";
import { LibraryShelf } from "@/components/books/LibraryShelf";
import { BookCard } from "@/components/books/BookCard";
import { ShelfSkeleton } from "@/components/ui/skeletons";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Library as LibraryIcon, LayoutGrid, Rows3, Search } from "lucide-react";
import { Link } from "react-router-dom";

type View = "shelves" | "grid";
type SortKey = "recent" | "rating" | "az" | "last_read";

const SORTS: { v: SortKey; label: string }[] = [
  { v: "recent", label: "Mais recentes" },
  { v: "rating", label: "Melhor avaliados" },
  { v: "az", label: "A–Z" },
  { v: "last_read", label: "Últimos lidos" },
];

export default function LibraryPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<UserBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("shelves");
  const [author, setAuthor] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [statusFilter, setStatusFilter] = useState<BookStatus | "all">("all");

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("user_books")
        .select("*, book:books(*)")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      setItems((data as UserBook[]) || []);
      setLoading(false);
    })();
  }, [user]);

  const authors = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => i.book?.authors?.forEach((a) => s.add(a)));
    return Array.from(s).sort();
  }, [items]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => i.book?.categories?.forEach((c) => s.add(c)));
    return Array.from(s).sort();
  }, [items]);

  const sortItems = (arr: UserBook[]) => {
    const r = [...arr];
    switch (sort) {
      case "rating": return r.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      case "az": return r.sort((a, b) => (a.book?.title || "").localeCompare(b.book?.title || ""));
      case "last_read": return r.sort((a, b) =>
        new Date(b.finished_at || b.updated_at).getTime() -
        new Date(a.finished_at || a.updated_at).getTime());
      default: return r;
    }
  };

  const baseFiltered = useMemo(() => {
    let r = items;
    if (author !== "all") r = r.filter((i) => i.book?.authors?.includes(author));
    if (category !== "all") r = r.filter((i) => i.book?.categories?.includes(category));
    return r;
  }, [items, author, category]);

  const shelves = useMemo(() => ({
    reading: sortItems(baseFiltered.filter((i) => i.status === "reading")),
    wishlist: sortItems(baseFiltered.filter((i) => i.status === "wishlist")),
    read: sortItems(baseFiltered.filter((i) => i.status === "read")),
    not_read: sortItems(baseFiltered.filter((i) => i.status === "not_read")),
  }), [baseFiltered, sort]);

  const gridFiltered = useMemo(() => {
    const r = statusFilter === "all" ? baseFiltered : baseFiltered.filter((i) => i.status === statusFilter);
    return sortItems(r);
  }, [baseFiltered, statusFilter, sort]);

  const totalCount = items.length;
  const readingCount = items.filter((i) => i.status === "reading").length;
  const readCount = items.filter((i) => i.status === "read").length;

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 md:pt-12 pb-20 max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl md:text-5xl font-bold flex items-center gap-3">
              <LibraryIcon className="w-8 h-8 md:w-10 md:h-10 text-primary" />
              Minha biblioteca
            </h1>
            {totalCount > 0 && (
              <p className="text-muted-foreground mt-2 text-sm md:text-base">
                <span className="text-foreground font-semibold tabular-nums">{totalCount}</span> livros
                {readingCount > 0 && <> · <span className="text-status-reading font-semibold tabular-nums">{readingCount}</span> em leitura</>}
                {readCount > 0 && <> · <span className="text-status-read font-semibold tabular-nums">{readCount}</span> concluídos</>}
              </p>
            )}
          </div>
          {totalCount > 0 && (
            <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/30 border border-border/40">
              <Button
                variant={view === "shelves" ? "default" : "ghost"}
                size="sm"
                onClick={() => setView("shelves")}
                className="gap-1.5 h-8"
              >
                <Rows3 className="w-3.5 h-3.5" /> Prateleiras
              </Button>
              <Button
                variant={view === "grid" ? "default" : "ghost"}
                size="sm"
                onClick={() => setView("grid")}
                className="gap-1.5 h-8"
              >
                <LayoutGrid className="w-3.5 h-3.5" /> Grade
              </Button>
            </div>
          )}
        </header>

        {/* Loading */}
        {loading ? (
          <div className="space-y-10 animate-fade-in">
            {[0, 1].map((i) => (
              <ShelfSkeleton key={i} />
            ))}
          </div>
        ) : totalCount === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Filters */}
            <div className="flex flex-wrap gap-2.5 mb-8">
              {view === "grid" && (
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as BookStatus | "all")}>
                  <SelectTrigger className="w-[160px] h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos status</SelectItem>
                    {(["reading", "read", "wishlist", "not_read"] as BookStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={author} onValueChange={setAuthor}>
                <SelectTrigger className="w-[180px] h-10"><SelectValue placeholder="Autor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos autores</SelectItem>
                  {authors.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-[180px] h-10"><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas categorias</SelectItem>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="w-[180px] h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SORTS.map((s) => <SelectItem key={s.v} value={s.v}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Content */}
            {view === "shelves" ? (
              <div className="space-y-12">
                <LibraryShelf
                  title="Lendo agora"
                  subtitle={shelves.reading.length > 0 ? `${shelves.reading.length} ${shelves.reading.length === 1 ? "livro em andamento" : "livros em andamento"}` : undefined}
                  items={shelves.reading}
                  emptyHint="Nenhuma leitura em curso. Que tal começar uma?"
                />
                <LibraryShelf
                  title="Quero ler"
                  subtitle={shelves.wishlist.length > 0 ? `${shelves.wishlist.length} na fila` : undefined}
                  items={shelves.wishlist}
                  emptyHint="Sua lista de desejos está vazia."
                />
                <LibraryShelf
                  title="Concluídos"
                  subtitle={shelves.read.length > 0 ? `${shelves.read.length} ${shelves.read.length === 1 ? "livro lido" : "livros lidos"}` : undefined}
                  items={shelves.read}
                  emptyHint="Nada concluído ainda — sua primeira conquista te espera."
                />
                {shelves.not_read.length > 0 && (
                  <LibraryShelf
                    title="No acervo"
                    subtitle={`${shelves.not_read.length} disponíveis`}
                    items={shelves.not_read}
                  />
                )}
              </div>
            ) : (
              gridFiltered.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground">
                  Nenhum livro encontrado com esses filtros.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-5 gap-y-8">
                  {gridFiltered.map((ub) => ub.book && <BookCard key={ub.id} book={ub.book} />)}
                </div>
              )
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-20 max-w-md mx-auto animate-fade-in">
      <div className="w-24 h-24 rounded-3xl bg-gradient-spine border border-border mx-auto mb-6 flex items-center justify-center shadow-book">
        <LibraryIcon className="w-11 h-11 text-primary/60" />
      </div>
      <h2 className="font-display text-3xl font-semibold mb-2">Sua biblioteca está vazia</h2>
      <p className="text-muted-foreground mb-6">
        Adicione livros à sua coleção pessoal e acompanhe sua jornada de leitura.
      </p>
      <Link to="/buscar">
        <Button variant="hero" size="lg" className="gap-2">
          <Search className="w-4 h-4" /> Buscar primeiro livro
        </Button>
      </Link>
    </div>
  );
}
