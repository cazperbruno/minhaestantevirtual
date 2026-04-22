import { useMemo } from "react";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { BookStatus, STATUS_LABEL, UserBook } from "@/types/book";
import { localizeCategory } from "@/lib/category-i18n";

export type SortKey = "recent" | "rating" | "az" | "last_read" | "year_new" | "year_old";

const SORTS: { v: SortKey; label: string }[] = [
  { v: "recent", label: "Mais recentes" },
  { v: "rating", label: "Melhor avaliados" },
  { v: "az", label: "A–Z" },
  { v: "last_read", label: "Últimos lidos" },
  { v: "year_new", label: "Publicação ↓" },
  { v: "year_old", label: "Publicação ↑" },
];

export interface LibraryFiltersValue {
  query: string;
  author: string;       // "all" or value
  category: string;     // "all" or value
  publisher: string;    // "all" or value
  year: string;         // "all" or value
  minRating: number;    // 0..5
  status: BookStatus | "all";
  sort: SortKey;
}

export const DEFAULT_FILTERS: LibraryFiltersValue = {
  query: "",
  author: "all",
  category: "all",
  publisher: "all",
  year: "all",
  minRating: 0,
  status: "all",
  sort: "recent",
};

interface Props {
  items: UserBook[];
  value: LibraryFiltersValue;
  onChange: (v: LibraryFiltersValue) => void;
  showStatusFilter?: boolean;
}

export function LibraryFilters({ items, value, onChange, showStatusFilter }: Props) {
  const set = <K extends keyof LibraryFiltersValue>(k: K, v: LibraryFiltersValue[K]) =>
    onChange({ ...value, [k]: v });

  const authors = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => i.book?.authors?.forEach((a) => a && s.add(a)));
    return Array.from(s).sort();
  }, [items]);

  // Categorias normalizadas em PT-BR (mescla "Fiction"/"Ficção", "Sci-Fi"/"Ficção científica" etc.)
  const categories = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) =>
      i.book?.categories?.forEach((c) => {
        if (!c) return;
        const loc = localizeCategory(c);
        if (loc && loc !== "Outros") s.add(loc);
      }),
    );
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items]);

  const publishers = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => i.book?.publisher && s.add(i.book.publisher));
    return Array.from(s).sort();
  }, [items]);

  const years = useMemo(() => {
    const s = new Set<number>();
    items.forEach((i) => i.book?.published_year && s.add(i.book.published_year));
    return Array.from(s).sort((a, b) => b - a);
  }, [items]);

  const activeChips: { key: keyof LibraryFiltersValue; label: string }[] = [];
  if (value.author !== "all") activeChips.push({ key: "author", label: value.author });
  if (value.category !== "all") activeChips.push({ key: "category", label: value.category });
  if (value.publisher !== "all") activeChips.push({ key: "publisher", label: value.publisher });
  if (value.year !== "all") activeChips.push({ key: "year", label: value.year });
  if (value.minRating > 0) activeChips.push({ key: "minRating", label: `≥ ${value.minRating}★` });
  if (showStatusFilter && value.status !== "all") {
    activeChips.push({ key: "status", label: STATUS_LABEL[value.status] });
  }

  const reset = (key: keyof LibraryFiltersValue) => {
    if (key === "minRating") set("minRating", 0);
    else if (key === "status") set("status", "all");
    else set(key, "all" as any);
  };

  const clearAll = () => onChange({ ...DEFAULT_FILTERS, sort: value.sort });

  return (
    <div className="space-y-3 mb-6">
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Live search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={value.query}
            onChange={(e) => set("query", e.target.value)}
            placeholder="Filtrar por título, autor, ISBN…"
            className="pl-10 pr-9 h-10 bg-card/60 border-border/60"
            autoComplete="off"
            spellCheck={false}
          />
          {value.query && (
            <button
              type="button"
              onClick={() => set("query", "")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted text-muted-foreground"
              aria-label="Limpar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Sort */}
        <Select value={value.sort} onValueChange={(v) => set("sort", v as SortKey)}>
          <SelectTrigger className="w-[170px] h-10"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => <SelectItem key={s.v} value={s.v}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Advanced filters */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-10 gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filtros
              {activeChips.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold tabular-nums">
                  {activeChips.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[300px] p-4 space-y-3">
            {showStatusFilter && (
              <FilterRow label="Status">
                <Select value={value.status} onValueChange={(v) => set("status", v as BookStatus | "all")}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {(["reading", "read", "wishlist", "not_read"] as BookStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterRow>
            )}
            <FilterRow label="Autor">
              <Select value={value.author} onValueChange={(v) => set("author", v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos autores</SelectItem>
                  {authors.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </FilterRow>
            <FilterRow label="Categoria">
              <Select value={value.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas categorias</SelectItem>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </FilterRow>
            {publishers.length > 0 && (
              <FilterRow label="Editora">
                <Select value={value.publisher} onValueChange={(v) => set("publisher", v)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas editoras</SelectItem>
                    {publishers.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FilterRow>
            )}
            {years.length > 0 && (
              <FilterRow label="Ano">
                <Select value={value.year} onValueChange={(v) => set("year", v)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos anos</SelectItem>
                    {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FilterRow>
            )}
            <FilterRow label="Nota mínima">
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => set("minRating", n)}
                    className={`flex-1 h-9 rounded-md text-xs font-semibold transition-colors ${
                      value.minRating === n
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/40 hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    {n === 0 ? "Todos" : `${n}★`}
                  </button>
                ))}
              </div>
            </FilterRow>
            {activeChips.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAll} className="w-full h-8 text-xs">
                Limpar todos
              </Button>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {/* Active chips */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 animate-fade-in">
          {activeChips.map((c) => (
            <button
              key={`${c.key}-${c.label}`}
              onClick={() => reset(c.key)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 text-primary border border-primary/30 text-xs font-medium hover:bg-primary/25 transition-colors"
            >
              {c.label}
              <X className="w-3 h-3" />
            </button>
          ))}
          <button
            onClick={clearAll}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
          >
            Limpar tudo
          </button>
        </div>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

/** Apply a LibraryFiltersValue to a list of UserBooks. Returns sorted+filtered list. */
export function applyLibraryFilters(items: UserBook[], f: LibraryFiltersValue): UserBook[] {
  let r = items;
  const q = f.query.trim().toLowerCase();
  if (q) {
    r = r.filter((i) => {
      const b = i.book;
      if (!b) return false;
      const hay = [
        b.title,
        b.subtitle,
        ...(b.authors || []),
        b.publisher,
        b.isbn_10,
        b.isbn_13,
        ...(b.categories || []),
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }
  if (f.author !== "all") r = r.filter((i) => i.book?.authors?.includes(f.author));
  if (f.category !== "all") r = r.filter((i) => i.book?.categories?.includes(f.category));
  if (f.publisher !== "all") r = r.filter((i) => i.book?.publisher === f.publisher);
  if (f.year !== "all") r = r.filter((i) => String(i.book?.published_year ?? "") === f.year);
  if (f.minRating > 0) r = r.filter((i) => (i.rating ?? 0) >= f.minRating);
  if (f.status !== "all") r = r.filter((i) => i.status === f.status);

  const sorted = [...r];
  switch (f.sort) {
    case "rating":
      sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      break;
    case "az":
      sorted.sort((a, b) => (a.book?.title || "").localeCompare(b.book?.title || ""));
      break;
    case "last_read":
      sorted.sort((a, b) =>
        new Date(b.finished_at || b.updated_at).getTime() -
        new Date(a.finished_at || a.updated_at).getTime());
      break;
    case "year_new":
      sorted.sort((a, b) => (b.book?.published_year ?? 0) - (a.book?.published_year ?? 0));
      break;
    case "year_old":
      sorted.sort((a, b) => (a.book?.published_year ?? 9999) - (b.book?.published_year ?? 9999));
      break;
    default:
      sorted.sort((a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }
  return sorted;
}
