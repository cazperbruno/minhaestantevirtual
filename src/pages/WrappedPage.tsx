import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Sparkles, BookOpen, Users, BookText, Trophy, Share2, ArrowRight,
  ChevronLeft, ChevronRight, Calendar, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { toast } from "sonner";

interface RawRow {
  status: "not_read" | "reading" | "read" | "wishlist";
  finished_at: string | null;
  current_page: number | null;
  book: {
    title: string;
    authors: string[];
    categories: string[] | null;
    page_count: number | null;
  } | null;
}

interface WrappedData {
  year: number;
  totalBooks: number;
  totalPages: number;
  topAuthor: { name: string; count: number } | null;
  topGenres: Array<{ name: string; count: number }>;
  longestBook: { title: string; pages: number } | null;
  monthlyTop: { month: string; count: number } | null;
  pagesRanking: Array<{ title: string; pages: number }>;
  finishedBooks: Array<{ title: string; authors: string[] }>;
}

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function aggregate(rows: RawRow[], year: number): WrappedData {
  const finished = rows.filter(
    (r) => r.finished_at && new Date(r.finished_at).getFullYear() === year && r.book,
  );

  const totalBooks = finished.length;
  let totalPages = 0;
  const authorMap = new Map<string, number>();
  const genreMap = new Map<string, number>();
  const monthMap = new Map<number, number>();
  let longest: WrappedData["longestBook"] = null;
  const pagesRanking: WrappedData["pagesRanking"] = [];

  for (const r of finished) {
    const b = r.book!;
    const pages = r.current_page ?? b.page_count ?? 0;
    totalPages += pages;
    if (pages > 0) {
      pagesRanking.push({ title: b.title, pages });
      if (!longest || pages > longest.pages) longest = { title: b.title, pages };
    }
    for (const a of b.authors || []) {
      if (!a) continue;
      authorMap.set(a, (authorMap.get(a) || 0) + 1);
    }
    for (const c of b.categories || []) {
      if (!c) continue;
      genreMap.set(c, (genreMap.get(c) || 0) + 1);
    }
    const m = new Date(r.finished_at!).getMonth();
    monthMap.set(m, (monthMap.get(m) || 0) + 1);
  }

  const topAuthor =
    authorMap.size > 0
      ? [...authorMap.entries()].sort((a, b) => b[1] - a[1])[0]
      : null;

  const topGenres = [...genreMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, count]) => ({ name, count }));

  const monthlyTopEntry = [...monthMap.entries()].sort((a, b) => b[1] - a[1])[0];
  const monthlyTop = monthlyTopEntry
    ? { month: MONTHS[monthlyTopEntry[0]], count: monthlyTopEntry[1] }
    : null;

  pagesRanking.sort((a, b) => b.pages - a.pages);

  return {
    year,
    totalBooks,
    totalPages,
    topAuthor: topAuthor ? { name: topAuthor[0], count: topAuthor[1] } : null,
    topGenres,
    longestBook: longest,
    monthlyTop,
    pagesRanking: pagesRanking.slice(0, 5),
    finishedBooks: finished.slice(0, 12).map((r) => ({
      title: r.book!.title,
      authors: r.book!.authors,
    })),
  };
}

/**
 * Wrapped — stats anuais estilo Spotify.
 * 6 telas cinemáticas: capa, total, gênero, autor, ranking páginas, encerramento.
 * Botões: navegar, compartilhar (Web Share), voltar p/ início.
 */
export default function WrappedPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const now = new Date();
  // Em janeiro/fevereiro, o usuário provavelmente quer ver o ano anterior.
  const defaultYear = now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear();
  const [year, setYear] = useState(defaultYear);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [slide, setSlide] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const startX = useRef<number | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("user_books")
        .select("status, finished_at, current_page, book:books(title, authors, categories, page_count)")
        .eq("user_id", user.id);
      if (!cancelled) {
        setRows((data as unknown as RawRow[]) || []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const data = useMemo(() => aggregate(rows, year), [rows, year]);

  const slides: Array<{
    id: string;
    bg: string;
    glow: string;
    render: () => JSX.Element;
  }> = useMemo(
    () => [
      {
        id: "intro",
        bg: "from-primary/40 via-accent/20 to-background",
        glow: "bg-primary/40",
        render: () => (
          <div className="flex flex-col items-center text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-4">
              {data.year} · Wrapped
            </p>
            <h2 className="font-display text-6xl md:text-8xl font-bold leading-[1.05] tracking-tight">
              Seu ano,
              <br />
              <span className="text-primary italic">em livros.</span>
            </h2>
            <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-md">
              Vamos passar pelos seus números mais marcantes deste ano.
            </p>
          </div>
        ),
      },
      {
        id: "total",
        bg: "from-status-read/30 via-background to-background",
        glow: "bg-status-read/40",
        render: () => (
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-4">
              Você leu
            </p>
            <p className="font-display text-[8rem] md:text-[12rem] leading-none font-bold text-foreground tabular-nums">
              {data.totalBooks}
            </p>
            <p className="mt-2 font-display text-2xl md:text-4xl font-semibold">
              {data.totalBooks === 1 ? "livro" : "livros"} em {data.year}
            </p>
            {data.totalPages > 0 && (
              <p className="mt-6 text-base md:text-lg text-muted-foreground">
                Foram <span className="text-foreground font-bold">{data.totalPages.toLocaleString("pt-BR")}</span> páginas viradas.
              </p>
            )}
            {data.monthlyTop && data.monthlyTop.count > 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                Seu mês mais intenso foi <span className="text-primary font-semibold">{data.monthlyTop.month}</span>{" "}
                · {data.monthlyTop.count} {data.monthlyTop.count === 1 ? "livro" : "livros"}.
              </p>
            )}
          </div>
        ),
      },
      {
        id: "author",
        bg: "from-status-reading/30 via-background to-background",
        glow: "bg-status-reading/40",
        render: () => (
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-4">
              Seu autor mais lido
            </p>
            {data.topAuthor ? (
              <>
                <h3 className="font-display text-5xl md:text-7xl font-bold leading-[1.05] tracking-tight">
                  {data.topAuthor.name}
                </h3>
                <p className="mt-6 text-lg text-muted-foreground">
                  com <span className="text-foreground font-bold">{data.topAuthor.count}</span>{" "}
                  {data.topAuthor.count === 1 ? "livro lido" : "livros lidos"} este ano.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">Sem leituras suficientes para destacar um autor.</p>
            )}
          </div>
        ),
      },
      {
        id: "genres",
        bg: "from-accent/30 via-background to-background",
        glow: "bg-accent/40",
        render: () => (
          <div className="text-center w-full">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-6">
              Seus gêneros favoritos
            </p>
            {data.topGenres.length > 0 ? (
              <ul className="flex flex-wrap justify-center gap-3 max-w-2xl mx-auto">
                {data.topGenres.map((g, i) => (
                  <li
                    key={g.name}
                    className={cn(
                      "px-5 py-3 rounded-full border font-display font-semibold transition-all",
                      i === 0 && "bg-primary text-primary-foreground border-primary text-2xl md:text-3xl shadow-glow",
                      i === 1 && "bg-foreground/10 border-foreground/20 text-xl md:text-2xl",
                      i >= 2 && "bg-muted/40 border-border text-base md:text-lg",
                    )}
                  >
                    {g.name}
                    <span className="ml-2 text-xs opacity-70 tabular-nums">{g.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Sem gêneros suficientes nas leituras deste ano.</p>
            )}
          </div>
        ),
      },
      {
        id: "pages-ranking",
        bg: "from-status-wishlist/25 via-background to-background",
        glow: "bg-status-wishlist/40",
        render: () => (
          <div className="w-full max-w-xl mx-auto">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-4 text-center">
              Top viradas de página
            </p>
            <h3 className="font-display text-3xl md:text-5xl font-bold leading-tight tracking-tight text-center mb-8">
              Os mais{" "}
              <span className="text-primary italic">grossos</span> da estante.
            </h3>
            {data.pagesRanking.length > 0 ? (
              <ol className="space-y-3">
                {data.pagesRanking.map((b, i) => (
                  <li
                    key={`${b.title}-${i}`}
                    className="glass rounded-2xl px-4 py-3 flex items-center gap-4"
                  >
                    <span
                      className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center font-display font-bold tabular-nums shrink-0",
                        i === 0
                          ? "bg-primary text-primary-foreground"
                          : "bg-foreground/10 text-foreground",
                      )}
                    >
                      {i + 1}
                    </span>
                    <p className="flex-1 min-w-0 font-medium truncate">{b.title}</p>
                    <span className="font-mono text-sm text-muted-foreground tabular-nums">
                      {b.pages.toLocaleString("pt-BR")} pg
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-center text-muted-foreground">Sem páginas registradas.</p>
            )}
          </div>
        ),
      },
      {
        id: "outro",
        bg: "from-primary/40 via-accent/30 to-background",
        glow: "bg-primary/50",
        render: () => (
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-4">
              Que ano!
            </p>
            <h3 className="font-display text-5xl md:text-7xl font-bold leading-[1.05] tracking-tight">
              Obrigado por
              <br />
              <span className="text-primary italic">ler com a gente.</span>
            </h3>
            <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-md mx-auto">
              Compartilhe seus números e inspire amigos a abrir o próximo livro.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Button variant="hero" size="lg" onClick={share} className="gap-2 shadow-lg">
                <Share2 className="w-4 h-4" /> Compartilhar meu Wrapped
              </Button>
              <Button variant="outline" size="lg" onClick={() => navigate("/")}>
                Voltar ao início
              </Button>
            </div>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, navigate],
  );

  const isLast = slide === slides.length - 1;
  const isFirst = slide === 0;

  function next() {
    haptic("tap");
    setSlide((s) => Math.min(slides.length - 1, s + 1));
  }
  function prev() {
    haptic("tap");
    setSlide((s) => Math.max(0, s - 1));
  }

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (startX.current == null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    if (Math.abs(dx) > 50) {
      if (dx < 0) next();
      else prev();
    }
    startX.current = null;
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function share() {
    haptic("success");
    const lines = [
      `📚 Meu Wrapped ${data.year}`,
      `${data.totalBooks} ${data.totalBooks === 1 ? "livro lido" : "livros lidos"}`,
      data.totalPages > 0 ? `${data.totalPages.toLocaleString("pt-BR")} páginas viradas` : null,
      data.topAuthor ? `Autor mais lido: ${data.topAuthor.name}` : null,
      data.topGenres[0] ? `Gênero favorito: ${data.topGenres[0].name}` : null,
    ].filter(Boolean);
    const text = lines.join("\n");
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Wrapped ${data.year}`, text, url });
      } catch {/* user cancel */}
    } else {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      toast.success("Resumo copiado!");
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="px-5 md:px-10 pt-12 pb-32 max-w-3xl mx-auto space-y-6">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-96 rounded-3xl" />
        </div>
      </AppShell>
    );
  }

  if (data.totalBooks === 0) {
    return (
      <AppShell>
        <div className="px-5 md:px-10 pt-16 pb-32 max-w-2xl mx-auto text-center animate-fade-in">
          <Sparkles className="w-12 h-12 text-primary mx-auto mb-4" />
          <h1 className="font-display text-4xl md:text-5xl font-bold leading-tight mb-3">
            Seu Wrapped {data.year} ainda está em branco.
          </h1>
          <p className="text-muted-foreground mb-2">
            Marque livros como lidos com a data de conclusão para construir o seu resumo.
          </p>
          <YearSwitcher year={year} setYear={setYear} />
          <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
            <Button variant="hero" asChild>
              <Link to="/biblioteca">Ir para biblioteca</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/buscar">Adicionar livros</Link>
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  const current = slides[slide];

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-6 pb-32 max-w-3xl mx-auto">
        {/* Header com seletor de ano */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-primary" /> Wrapped
            </p>
            <h1 className="font-display text-2xl md:text-3xl font-bold">
              Seu ano em livros
            </h1>
          </div>
          <YearSwitcher year={year} setYear={setYear} />
        </div>

        {/* Card cinemático */}
        <div
          ref={cardRef}
          className={cn(
            "relative overflow-hidden rounded-3xl border border-border min-h-[28rem] md:min-h-[34rem] flex items-center justify-center px-6 py-10 md:px-12 md:py-14 select-none",
            "bg-gradient-to-br transition-colors duration-700",
            current.bg,
          )}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/* Glows */}
          <div
            className={cn(
              "pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full blur-3xl opacity-70 animate-fade-in",
              current.glow,
            )}
          />
          <div
            className={cn(
              "pointer-events-none absolute -bottom-32 -left-24 h-72 w-72 rounded-full blur-3xl opacity-50 animate-fade-in",
              current.glow,
            )}
          />
          {/* Grão sutil */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-overlay"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence baseFrequency='0.9' numOctaves='2' /></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
            }}
          />

          {/* Progress bars no topo */}
          <div className="absolute top-4 left-4 right-4 flex gap-1.5 z-10">
            {slides.map((s, i) => (
              <div
                key={s.id}
                className="h-[3px] flex-1 rounded-full overflow-hidden bg-foreground/10"
              >
                <div
                  className="h-full bg-foreground/90 transition-[width] duration-500 ease-out"
                  style={{ width: i < slide ? "100%" : i === slide ? "100%" : "0%" }}
                />
              </div>
            ))}
          </div>

          {/* Slide content */}
          <div key={current.id} className="relative z-[1] w-full animate-fade-in">
            {current.render()}
          </div>

          {/* Nav buttons (desktop) */}
          {!isFirst && (
            <button
              onClick={prev}
              aria-label="Anterior"
              className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-background/60 hover:bg-background/90 backdrop-blur items-center justify-center border border-border z-10"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          {!isLast && (
            <button
              onClick={next}
              aria-label="Próximo"
              className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-background/60 hover:bg-background/90 backdrop-blur items-center justify-center border border-border z-10"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Footer ações */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="flex gap-2">
            {slides.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setSlide(i)}
                aria-label={`Ir para tela ${i + 1}`}
                className={cn(
                  "h-2 rounded-full transition-all",
                  i === slide ? "w-8 bg-foreground" : "w-2 bg-foreground/30 hover:bg-foreground/50",
                )}
              />
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={share} className="gap-1.5">
              <Share2 className="w-3.5 h-3.5" /> Compartilhar
            </Button>
            {!isLast ? (
              <Button variant="hero" size="sm" onClick={next} className="gap-1.5">
                Próximo <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <Button variant="hero" size="sm" asChild>
                <Link to="/">Início</Link>
              </Button>
            )}
          </div>
        </div>

        <p className="mt-3 text-center text-[10px] uppercase tracking-widest text-muted-foreground/60 md:hidden">
          Deslize para navegar
        </p>
      </div>
    </AppShell>
  );
}

function YearSwitcher({ year, setYear }: { year: number; setYear: (y: number) => void }) {
  const current = new Date().getFullYear();
  const years = [current, current - 1, current - 2];
  return (
    <div
      className="inline-flex items-center gap-1 p-1 rounded-full bg-card/60 border border-border"
      role="radiogroup"
      aria-label="Ano do wrapped"
    >
      {years.map((y) => (
        <button
          key={y}
          role="radio"
          aria-checked={y === year}
          onClick={() => setYear(y)}
          className={cn(
            "px-3 h-7 text-xs font-semibold rounded-full transition-all tabular-nums",
            y === year
              ? "bg-primary text-primary-foreground shadow-glow"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {y}
        </button>
      ))}
    </div>
  );
}
