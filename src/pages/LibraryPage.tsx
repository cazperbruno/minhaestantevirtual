import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { LibraryShelf } from "@/components/books/LibraryShelf";
import { BookCard } from "@/components/books/BookCard";
import { ShelfSkeleton, BookGridSkeleton } from "@/components/ui/skeletons";
import { Button } from "@/components/ui/button";
import { Library as LibraryIcon, LayoutGrid, Rows3, Search, ScanLine } from "lucide-react";
import { Link } from "react-router-dom";
import { useLibrary } from "@/hooks/useLibrary";
import {
  LibraryFilters,
  DEFAULT_FILTERS,
  applyLibraryFilters,
  type LibraryFiltersValue,
} from "@/components/books/LibraryFilters";
import { ContentTypeFilter, useContentFilter } from "@/components/books/ContentTypeFilter";

type View = "shelves" | "grid";

export default function LibraryPage() {
  const { data: allItems = [], isLoading: loading } = useLibrary();
  const [view, setView] = useState<View>("shelves");
  const [filters, setFilters] = useState<LibraryFiltersValue>(DEFAULT_FILTERS);
  const { active: activeTypes, available } = useContentFilter();

  // Filtra a biblioteca pelos tipos de conteúdo ativos do usuário.
  const items = useMemo(() => {
    const typeSet = new Set(activeTypes);
    return allItems.filter((i) => typeSet.has((i.book?.content_type ?? "book") as any));
  }, [allItems, activeTypes]);

  // For shelves view, status filter is implicit per shelf — apply only the others.
  const shelfFiltered = useMemo(
    () => applyLibraryFilters(items, { ...filters, status: "all" }),
    [items, filters],
  );
  const gridFiltered = useMemo(() => applyLibraryFilters(items, filters), [items, filters]);

  const shelves = useMemo(() => ({
    reading: shelfFiltered.filter((i) => i.status === "reading"),
    wishlist: shelfFiltered.filter((i) => i.status === "wishlist"),
    read: shelfFiltered.filter((i) => i.status === "read"),
    not_read: shelfFiltered.filter((i) => i.status === "not_read"),
  }), [shelfFiltered]);

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

        {loading ? (
          <div className="space-y-10 animate-fade-in">
            {view === "grid" ? <BookGridSkeleton count={10} /> : [0, 1].map((i) => <ShelfSkeleton key={i} />)}
          </div>
        ) : totalCount === 0 ? (
          <EmptyState />
        ) : (
          <>
            <LibraryFilters
              items={items}
              value={filters}
              onChange={setFilters}
              showStatusFilter={view === "grid"}
            />

            {view === "shelves" ? (
              shelfFiltered.length === 0 ? (
                <NoMatchState />
              ) : (
                <div className="space-y-12">
                  {shelves.reading.length > 0 && (
                    <LibraryShelf
                      title="Lendo agora"
                      subtitle={`${shelves.reading.length} ${shelves.reading.length === 1 ? "livro em andamento" : "livros em andamento"}`}
                      items={shelves.reading}
                    />
                  )}
                  {shelves.wishlist.length > 0 && (
                    <LibraryShelf
                      title="Quero ler"
                      subtitle={`${shelves.wishlist.length} na fila`}
                      items={shelves.wishlist}
                    />
                  )}
                  {shelves.read.length > 0 && (
                    <LibraryShelf
                      title="Concluídos"
                      subtitle={`${shelves.read.length} ${shelves.read.length === 1 ? "livro lido" : "livros lidos"}`}
                      items={shelves.read}
                    />
                  )}
                  {shelves.not_read.length > 0 && (
                    <LibraryShelf
                      title="No acervo"
                      subtitle={`${shelves.not_read.length} disponíveis`}
                      items={shelves.not_read}
                    />
                  )}
                </div>
              )
            ) : (
              gridFiltered.length === 0 ? (
                <NoMatchState />
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-4">
                    <span className="text-foreground font-semibold tabular-nums">{gridFiltered.length}</span>{" "}
                    {gridFiltered.length === 1 ? "livro" : "livros"}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-5 gap-y-8">
                    {gridFiltered.map((ub) => ub.book && <BookCard key={ub.id} book={ub.book} />)}
                  </div>
                </>
              )
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function NoMatchState() {
  return (
    <div className="text-center py-20 text-muted-foreground animate-fade-in">
      <Search className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
      <p className="font-display text-xl text-foreground mb-1">Nenhum livro com esses filtros</p>
      <p className="text-sm">Ajuste os filtros ou limpe-os para ver mais resultados.</p>
    </div>
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
      <div className="flex flex-wrap gap-2 justify-center">
        <Link to="/buscar">
          <Button variant="hero" size="lg" className="gap-2">
            <Search className="w-4 h-4" /> Buscar primeiro livro
          </Button>
        </Link>
        <Link to="/scanner">
          <Button variant="outline" size="lg" className="gap-2">
            <ScanLine className="w-4 h-4" /> Escanear ISBN
          </Button>
        </Link>
      </div>
    </div>
  );
}
