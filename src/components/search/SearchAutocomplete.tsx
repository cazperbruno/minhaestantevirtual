import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2, BookOpen, ArrowRight, ScanLine, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { suggestBooks, saveBook, lookupIsbn, type SearchSuggestion } from "@/lib/books-api";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  autoFocus?: boolean;
  /** When user picks "search all", we navigate to /buscar?q=... unless overridden. */
  onSubmit?: (query: string) => void;
  placeholder?: string;
  /** When true, dropdown anchors absolutely inside the parent (default). */
  showShortcutHint?: boolean;
}

const RECENT_KEY = "pagina:recent-searches";

function getRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").slice(0, 5);
  } catch {
    return [];
  }
}
function pushRecent(q: string) {
  if (!q.trim()) return;
  const cur = getRecent().filter((x) => x.toLowerCase() !== q.toLowerCase());
  cur.unshift(q.trim());
  localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, 5)));
}

export function SearchAutocomplete({
  className,
  autoFocus,
  onSubmit,
  placeholder = "Buscar livros, autores ou ISBN…",
  showShortcutHint = true,
}: Props) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const debounced = useDebouncedValue(q, 180);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SearchSuggestion[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load recent on first focus
  useEffect(() => {
    setRecent(getRecent());
  }, []);

  // Global ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Click-outside to close
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Live suggestions
  useEffect(() => {
    abortRef.current?.abort();
    if (debounced.trim().length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    suggestBooks(debounced, ctrl.signal)
      .then((s) => {
        if (!ctrl.signal.aborted) {
          setItems(s);
          setActiveIdx(-1);
        }
      })
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [debounced]);

  const handleSubmit = useCallback(
    (raw?: string) => {
      const value = (raw ?? q).trim();
      if (!value) return;
      pushRecent(value);
      setRecent(getRecent());
      setOpen(false);
      if (onSubmit) onSubmit(value);
      else navigate(`/buscar?q=${encodeURIComponent(value)}`);
    },
    [q, navigate, onSubmit],
  );

  const openSuggestion = useCallback(
    async (s: SearchSuggestion) => {
      setOpen(false);
      pushRecent(s.title);
      // Cache hit → direct navigation
      if (s.id) {
        navigate(`/livro/${s.id}`);
        return;
      }
      // Need to materialize: try ISBN first if we have one, else save shape directly
      try {
        if (s.isbn) {
          const book = await lookupIsbn(s.isbn);
          if (book?.id) {
            navigate(`/livro/${book.id}`);
            return;
          }
        }
        const saved = await saveBook({
          title: s.title,
          subtitle: s.subtitle ?? null,
          authors: s.authors,
          cover_url: s.cover_url,
          published_year: s.published_year ?? null,
          isbn_13: s.isbn && s.isbn.length === 13 ? s.isbn : null,
          isbn_10: s.isbn && s.isbn.length === 10 ? s.isbn : null,
          source: s.source,
        } as any);
        if (saved?.id) navigate(`/livro/${saved.id}`);
        else handleSubmit(s.title);
      } catch {
        handleSubmit(s.title);
      }
    },
    [navigate, handleSubmit],
  );

  const visibleList: Array<{ kind: "recent" | "suggestion"; value: any }> =
    q.trim().length >= 2
      ? items.map((s) => ({ kind: "suggestion" as const, value: s }))
      : recent.map((r) => ({ kind: "recent" as const, value: r }));

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (e.key === "Enter") {
      if (activeIdx >= 0 && visibleList[activeIdx]) {
        const it = visibleList[activeIdx];
        if (it.kind === "suggestion") openSuggestion(it.value);
        else handleSubmit(it.value);
      } else {
        handleSubmit();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIdx((i) => Math.min(visibleList.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(-1, i - 1));
    }
  };

  return (
    <div ref={wrapRef} className={cn("relative w-full", className)}>
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="pl-12 pr-24 h-14 text-base bg-card/80 backdrop-blur border-border/80 focus-visible:ring-primary/50 shadow-card"
          aria-label="Buscar livros"
          aria-autocomplete="list"
          aria-expanded={open}
          autoComplete="off"
          spellCheck={false}
        />
        {q && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              inputRef.current?.focus();
            }}
            className="absolute right-14 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted text-muted-foreground"
            aria-label="Limpar busca"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        {showShortcutHint && !q && (
          <kbd className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 items-center gap-1 px-2 h-6 rounded border border-border bg-muted/40 text-[10px] font-mono text-muted-foreground">
            ⌘K
          </kbd>
        )}
      </div>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 mt-2 z-50 glass rounded-xl overflow-hidden shadow-elevated animate-fade-in"
        >
          {/* Loading state */}
          {loading && (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Buscando…
            </div>
          )}

          {/* Recent searches when input is empty */}
          {!loading && q.trim().length < 2 && recent.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Recentes
              </p>
              {recent.map((r, i) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleSubmit(r)}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors",
                    activeIdx === i ? "bg-primary/10 text-primary" : "hover:bg-muted/40",
                  )}
                >
                  <Search className="w-4 h-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{r}</span>
                </button>
              ))}
            </div>
          )}

          {/* Empty hint */}
          {!loading && q.trim().length < 2 && recent.length === 0 && (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              <p className="font-display text-foreground mb-1">Comece digitando</p>
              <p>Título, autor, palavra-chave ou ISBN — buscamos em todo o catálogo.</p>
            </div>
          )}

          {/* Live suggestions */}
          {!loading && q.trim().length >= 2 && (
            <>
              {items.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  <p className="font-display text-foreground mb-1">Nada encontrado por aqui</p>
                  <p>Pressione Enter para buscar em fontes externas.</p>
                </div>
              ) : (
                <ul className="max-h-[60vh] overflow-y-auto">
                  {items.map((s, i) => (
                    <li key={`${s.title}-${i}`}>
                      <button
                        type="button"
                        onClick={() => openSuggestion(s)}
                        onMouseEnter={() => setActiveIdx(i)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                          activeIdx === i ? "bg-primary/10" : "hover:bg-muted/40",
                        )}
                      >
                        <div className="w-10 h-14 shrink-0 rounded overflow-hidden bg-gradient-spine border border-border/40 flex items-center justify-center">
                          {s.cover_url ? (
                            <img
                              src={s.cover_url}
                              alt=""
                              loading="lazy"
                              className="w-full h-full object-cover"
                              onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                            />
                          ) : (
                            <BookOpen className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm leading-tight truncate">{s.title}</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {(s.authors[0] || "Autor desconhecido")}
                            {s.published_year ? ` · ${s.published_year}` : ""}
                          </p>
                        </div>
                        {s.source === "cache" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">
                            na sua busca
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Bottom action: search all */}
              <button
                type="button"
                onClick={() => handleSubmit()}
                onMouseEnter={() => setActiveIdx(items.length)}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-3 text-sm border-t border-border/40 transition-colors",
                  activeIdx === items.length ? "bg-primary/10 text-primary" : "hover:bg-muted/40",
                )}
              >
                <span className="flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  Buscar “<span className="font-medium">{q}</span>” em toda a internet
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Footer hint */}
          <div className="hidden md:flex items-center justify-between px-4 py-2 border-t border-border/40 bg-muted/20 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-3">
              <span><kbd className="font-mono">↑↓</kbd> navegar</span>
              <span><kbd className="font-mono">↵</kbd> abrir</span>
              <span><kbd className="font-mono">Esc</kbd> fechar</span>
            </span>
            <button
              type="button"
              onClick={() => navigate("/scanner")}
              className="flex items-center gap-1.5 hover:text-primary transition-colors"
            >
              <ScanLine className="w-3.5 h-3.5" /> Scanner
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
