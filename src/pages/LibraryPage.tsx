import { useCallback, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { SmartShelfRow } from "@/components/books/SmartShelfRow";
import { DiscoveryShelfRow } from "@/components/books/DiscoveryShelfRow";
import { FollowingReadsShelfRow } from "@/components/books/FollowingReadsShelfRow";
import { LazyShelf } from "@/components/books/LazyShelf";
import { StreakFreezeButton } from "@/components/gamification/StreakFreezeButton";
import { useSmartShelves } from "@/hooks/useSmartShelves";
import { BookCard } from "@/components/books/BookCard";
import { ShelfSkeleton, BookGridSkeleton } from "@/components/ui/skeletons";
import { Button } from "@/components/ui/button";
import { Library as LibraryIcon, LayoutGrid, Rows3, Search, ScanLine, Home as HomeIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useLibrary } from "@/hooks/useLibrary";
import {
  LibraryFilters,
  DEFAULT_FILTERS,
  applyLibraryFilters,
  type LibraryFiltersValue,
} from "@/components/books/LibraryFilters";
import { ContentTypeFilter, useContentFilter } from "@/components/books/ContentTypeFilter";
import { useViewMode } from "@/hooks/useViewMode";
import { HomeMode } from "@/components/books/HomeMode";
import { ShelfFilter, applyShelfFilter, type ShelfFilterValue } from "@/components/books/ShelfFilter";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { queryClient } from "@/lib/query-client";
import { SpotlightTutorial } from "@/components/onboarding/SpotlightTutorial";
import { usePageTutorial } from "@/hooks/usePageTutorial";
import { getPageTutorial } from "@/lib/page-tutorials";

export default function LibraryPage() {
  const { data: allItems = [], isLoading: loading } = useLibrary();
  const [view, setView] = useViewMode();
  const [filters, setFilters] = useState<LibraryFiltersValue>(DEFAULT_FILTERS);
  const [shelfFilter, setShelfFilter] = useState<ShelfFilterValue>({ kind: "none" });
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

  const rawShelves = useSmartShelves(shelfFiltered);
  const smartShelves = useMemo(
    () => applyShelfFilter(rawShelves, shelfFilter),
    [rawShelves, shelfFilter],
  );
  const readShelf = useMemo(
    () => shelfFiltered.filter((i) => i.status === "read"),
    [shelfFiltered],
  );

  const totalCount = items.length;
  const readingCount = items.filter((i) => i.status === "reading").length;
  const readCount = items.filter((i) => i.status === "read").length;

  const onRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["library"] }),
      queryClient.invalidateQueries({ queryKey: ["discovery-shelf"] }),
      queryClient.invalidateQueries({ queryKey: ["following-reads"] }),
    ]);
  }, []);

  return (
    <AppShell>
      <PullToRefresh onRefresh={onRefresh}>
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
            <div className="flex items-center gap-2">
              <StreakFreezeButton />
              <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/30 border border-border/40">
                <Button
                  variant={view === "home" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setView("home")}
                  className="gap-1.5 h-8"
                  title="Modo Casa: visual simples"
                >
                  <HomeIcon className="w-3.5 h-3.5" /> Casa
                </Button>
                <Button
                  variant={view === "interactive" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setView("interactive")}
                  className="gap-1.5 h-8"
                  title="Modo Interativo: prateleiras Netflix"
                >
                  <Rows3 className="w-3.5 h-3.5" /> Interativo
                </Button>
                <Button
                  variant={view === "grid" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setView("grid")}
                  className="gap-1.5 h-8"
                  title="Grade clássica"
                >
                  <LayoutGrid className="w-3.5 h-3.5" /> Grade
                </Button>
              </div>
            </div>
          )}
        </header>

        {loading ? (
          <div className="space-y-10 animate-fade-in">
            {view === "grid" ? <BookGridSkeleton count={10} /> : [0, 1].map((i) => <ShelfSkeleton key={i} />)}
          </div>
        ) : totalCount === 0 ? (
          <EmptyState />
        ) : view === "home" ? (
          // ─── MODO CASA ─────────────────────────────────────
          <HomeMode items={items} />
        ) : (
          // ─── MODOS INTERATIVO / GRADE ──────────────────────
          <>
            {available.length > 1 && <ContentTypeFilter className="mb-4" />}
            <LibraryFilters
              items={items}
              value={filters}
              onChange={setFilters}
              showStatusFilter={view === "grid"}
            />

            {view === "interactive" ? (
              <>
                <ShelfFilter items={shelfFiltered} value={shelfFilter} onChange={setShelfFilter} />

                {shelfFiltered.length === 0 ? (
                  <NoMatchState />
                ) : smartShelves.length === 0 ? (
                  <NoMatchState hint="Nenhuma prateleira combina com esse filtro." />
                ) : (
                  <div className="space-y-2">
                    {smartShelves.map((s) => (
                      <SmartShelfRow
                        key={s.id}
                        id={s.id}
                        title={s.title}
                        subtitle={s.subtitle}
                        items={s.items}
                        emoji={s.emoji}
                      />
                    ))}
                    {/* Concluídos como prateleira final dedicada (só sem filtro ativo) */}
                    {shelfFilter.kind === "none" && readShelf.length >= 3 && !smartShelves.some((s) => s.id === "read") && (
                      <SmartShelfRow
                        id="read"
                        title="Concluídos"
                        subtitle={`${readShelf.length} ${readShelf.length === 1 ? "livro lido" : "livros lidos"}`}
                        items={readShelf}
                      />
                    )}
                    {shelfFilter.kind === "none" && (
                      <>
                        <LazyShelf><FollowingReadsShelfRow /></LazyShelf>
                        <LazyShelf><DiscoveryShelfRow /></LazyShelf>
                      </>
                    )}
                  </div>
                )}
              </>
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
      </PullToRefresh>
    </AppShell>
  );
}

function NoMatchState({ hint }: { hint?: string }) {
  return (
    <div className="text-center py-20 text-muted-foreground animate-fade-in">
      <Search className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
      <p className="font-display text-xl text-foreground mb-1">Nenhum livro com esses filtros</p>
      <p className="text-sm">{hint || "Ajuste os filtros ou limpe-os para ver mais resultados."}</p>
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
