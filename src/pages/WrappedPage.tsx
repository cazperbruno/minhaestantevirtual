import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Sparkles, BookOpen, Users, BookText, Trophy, Share2, ArrowRight,
  ChevronLeft, ChevronRight, Calendar, Download, Loader2,
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
    cover_url: string | null;
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
  finishedBooks: Array<{ title: string; authors: string[]; cover_url: string | null; finished_at: string }>;
  monthly: Array<{ month: number; count: number }>;
  firstBook: { title: string; authors: string[]; date: string } | null;
  lastBook: { title: string; authors: string[]; date: string } | null;
}

interface FriendStat {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  count: number;
  pages: number;
  isMe?: boolean;
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

  // Mês a mês — array completo de 12 posições
  const monthly = Array.from({ length: 12 }, (_, m) => ({
    month: m,
    count: monthMap.get(m) || 0,
  }));

  // Primeira e última leitura do ano (ordenadas por data)
  const sortedByDate = [...finished].sort(
    (a, b) => new Date(a.finished_at!).getTime() - new Date(b.finished_at!).getTime(),
  );
  const firstBook = sortedByDate[0]
    ? {
        title: sortedByDate[0].book!.title,
        authors: sortedByDate[0].book!.authors,
        date: sortedByDate[0].finished_at!,
      }
    : null;
  const lastBook = sortedByDate.length > 1
    ? {
        title: sortedByDate[sortedByDate.length - 1].book!.title,
        authors: sortedByDate[sortedByDate.length - 1].book!.authors,
        date: sortedByDate[sortedByDate.length - 1].finished_at!,
      }
    : null;

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
      cover_url: r.book!.cover_url ?? null,
      finished_at: r.finished_at!,
    })),
    monthly,
    firstBook,
    lastBook,
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
  const [friends, setFriends] = useState<FriendStat[]>([]);
  const [slide, setSlide] = useState(0);
  const [savingStory, setSavingStory] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const startX = useRef<number | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("user_books")
        .select("status, finished_at, current_page, book:books(title, authors, categories, page_count, cover_url)")
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

  // Buscar ranking entre quem você segue (e você mesmo) — leituras concluídas no ano
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: f } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id);
      const ids = [user.id, ...((f || []).map((x) => x.following_id) as string[])];
      if (ids.length === 0) {
        setFriends([]);
        return;
      }

      const start = `${year}-01-01`;
      const end = `${year + 1}-01-01`;
      const [{ data: ub }, { data: profs }] = await Promise.all([
        supabase
          .from("user_books")
          .select("user_id, current_page, book:books(page_count)")
          .in("user_id", ids)
          .eq("status", "read")
          .gte("finished_at", start)
          .lt("finished_at", end),
        supabase
          .from("profiles")
          .select("id, display_name, username, avatar_url")
          .in("id", ids),
      ]);

      const profMap = new Map<string, { display_name: string | null; username: string | null; avatar_url: string | null }>();
      for (const p of (profs as any[]) || []) {
        profMap.set(p.id, { display_name: p.display_name, username: p.username, avatar_url: p.avatar_url });
      }

      const agg = new Map<string, { count: number; pages: number }>();
      for (const r of (ub as any[]) || []) {
        const k = r.user_id as string;
        const cur = agg.get(k) || { count: 0, pages: 0 };
        cur.count += 1;
        cur.pages += (r.current_page ?? r.book?.page_count ?? 0);
        agg.set(k, cur);
      }

      const stats: FriendStat[] = ids.map((id) => {
        const a = agg.get(id) || { count: 0, pages: 0 };
        const p = profMap.get(id) || { display_name: null, username: null, avatar_url: null };
        return {
          user_id: id,
          display_name: p.display_name,
          username: p.username,
          avatar_url: p.avatar_url,
          count: a.count,
          pages: a.pages,
          isMe: id === user.id,
        };
      })
        .filter((s) => s.count > 0 || s.isMe)
        .sort((a, b) => b.count - a.count || b.pages - a.pages);

      if (!cancelled) setFriends(stats);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, year]);

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
        id: "monthly",
        bg: "from-status-reading/25 via-background to-background",
        glow: "bg-status-reading/40",
        render: () => {
          const max = Math.max(1, ...data.monthly.map((m) => m.count));
          return (
            <div className="w-full max-w-xl mx-auto">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-3 text-center">
                Mês a mês
              </p>
              <h3 className="font-display text-3xl md:text-5xl font-bold leading-tight tracking-tight text-center mb-8">
                Seu ritmo de <span className="text-primary italic">leitura</span>.
              </h3>
              <div className="flex items-end justify-between gap-1.5 h-44 px-1">
                {data.monthly.map((m) => {
                  const h = m.count > 0 ? Math.max(8, (m.count / max) * 100) : 4;
                  const isTop = data.monthlyTop && MONTHS[m.month] === data.monthlyTop.month && m.count > 0;
                  return (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                      <span className="text-[10px] tabular-nums font-mono text-muted-foreground/70 h-3">
                        {m.count > 0 ? m.count : ""}
                      </span>
                      <div
                        className={cn(
                          "w-full rounded-t-md transition-all",
                          isTop ? "bg-primary shadow-glow" : "bg-foreground/15",
                        )}
                        style={{ height: `${h}%` }}
                      />
                      <span className={cn(
                        "text-[10px] uppercase tracking-wider",
                        isTop ? "text-primary font-bold" : "text-muted-foreground",
                      )}>
                        {MONTHS[m.month]}
                      </span>
                    </div>
                  );
                })}
              </div>
              {data.monthlyTop && (
                <p className="mt-6 text-center text-sm text-muted-foreground">
                  <span className="text-primary font-semibold">{data.monthlyTop.month}</span> foi seu mês mais intenso · {data.monthlyTop.count} {data.monthlyTop.count === 1 ? "livro" : "livros"}.
                </p>
              )}
            </div>
          );
        },
      },
      {
        id: "first-last",
        bg: "from-accent/25 via-background to-background",
        glow: "bg-accent/40",
        render: () => (
          <div className="w-full max-w-xl mx-auto">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-3 text-center">
              Como começou e terminou
            </p>
            <h3 className="font-display text-3xl md:text-5xl font-bold leading-tight tracking-tight text-center mb-8">
              A <span className="text-primary italic">jornada</span> do ano.
            </h3>
            <div className="space-y-4">
              {data.firstBook && (
                <FirstLastCard label="Primeira leitura" book={data.firstBook} accent="from-status-reading/30 to-status-reading/5" />
              )}
              {data.lastBook && (
                <FirstLastCard label="Última leitura" book={data.lastBook} accent="from-primary/30 to-primary/5" />
              )}
              {!data.firstBook && (
                <p className="text-center text-muted-foreground">Sem leituras registradas com data.</p>
              )}
            </div>
          </div>
        ),
      },
      {
        id: "friends",
        bg: "from-status-wishlist/30 via-background to-background",
        glow: "bg-status-wishlist/40",
        render: () => {
          const top = friends.slice(0, 6);
          const myIdx = top.findIndex((f) => f.isMe);
          return (
            <div className="w-full max-w-xl mx-auto">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-3 text-center">
                Entre você e quem você segue
              </p>
              <h3 className="font-display text-3xl md:text-5xl font-bold leading-tight tracking-tight text-center mb-8">
                Sua <span className="text-primary italic">posição</span> no ranking.
              </h3>
              {top.length > 1 ? (
                <ol className="space-y-2.5">
                  {top.map((f, i) => (
                    <li
                      key={f.user_id}
                      className={cn(
                        "rounded-2xl px-4 py-3 flex items-center gap-3 border transition-all",
                        f.isMe
                          ? "bg-primary/15 border-primary/40 shadow-glow"
                          : "glass border-border",
                      )}
                    >
                      <span
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center font-display font-bold tabular-nums shrink-0 text-sm",
                          i === 0 ? "bg-primary text-primary-foreground" : "bg-foreground/10 text-foreground",
                        )}
                      >
                        {i + 1}
                      </span>
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-muted shrink-0 ring-1 ring-border">
                        {f.avatar_url ? (
                          <img src={f.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">
                            {(f.display_name || f.username || "?").charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate text-sm">
                          {f.isMe ? "Você" : (f.display_name || f.username || "Anônimo")}
                        </p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          {f.pages.toLocaleString("pt-BR")} pg
                        </p>
                      </div>
                      <span className="font-mono font-bold tabular-nums text-foreground/90">
                        {f.count}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-center text-muted-foreground text-sm">
                  Siga outros leitores na busca para comparar seu ano.
                </p>
              )}
              {myIdx > 0 && top.length > 1 && (
                <p className="mt-5 text-center text-sm text-muted-foreground">
                  Você está em <span className="text-primary font-semibold">#{myIdx + 1}</span> entre {top.length} leitores.
                </p>
              )}
            </div>
          );
        },
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
              <Button variant="outline" size="lg" onClick={shareStory} disabled={savingStory} className="gap-2">
                {savingStory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Salvar como story
              </Button>
              <Button variant="ghost" size="lg" onClick={() => navigate("/")}>
                Voltar ao início
              </Button>
            </div>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, friends, navigate, savingStory],
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

  /**
   * Gera uma imagem 9:16 (1080x1920) estilo story do Instagram com os números
   * principais do ano. Tenta compartilhar via Web Share API com `files`; se
   * não suportar, faz download direto.
   */
  async function shareStory() {
    setSavingStory(true);
    haptic("tap");
    try {
      const W = 1080;
      const H = 1920;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponível");

      // Gradiente de fundo (cores semânticas do app — convertidas pra hex pra canvas)
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, "#7c3aed");
      grad.addColorStop(0.5, "#1e1b3a");
      grad.addColorStop(1, "#0a0613");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Glow circular topo direito
      const glow = ctx.createRadialGradient(W * 0.85, H * 0.15, 50, W * 0.85, H * 0.15, 600);
      glow.addColorStop(0, "rgba(168, 85, 247, 0.55)");
      glow.addColorStop(1, "rgba(168, 85, 247, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      // Glow circular inferior esquerdo
      const glow2 = ctx.createRadialGradient(W * 0.1, H * 0.85, 50, W * 0.1, H * 0.85, 700);
      glow2.addColorStop(0, "rgba(99, 102, 241, 0.45)");
      glow2.addColorStop(1, "rgba(99, 102, 241, 0)");
      ctx.fillStyle = glow2;
      ctx.fillRect(0, 0, W, H);

      // Header
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "600 32px system-ui, -apple-system, 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`WRAPPED · ${data.year}`, W / 2, 200);

      // Big number (livros)
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 380px Georgia, 'Times New Roman', serif";
      ctx.fillText(String(data.totalBooks), W / 2, 600);

      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = "600 56px Georgia, 'Times New Roman', serif";
      ctx.fillText(data.totalBooks === 1 ? "livro lido" : "livros lidos", W / 2, 700);

      // Páginas
      if (data.totalPages > 0) {
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.font = "500 38px system-ui, -apple-system, 'Segoe UI', sans-serif";
        ctx.fillText(
          `${data.totalPages.toLocaleString("pt-BR")} páginas viradas`,
          W / 2,
          780,
        );
      }

      // Linha divisória
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W * 0.2, 880);
      ctx.lineTo(W * 0.8, 880);
      ctx.stroke();

      // Stats grid
      let y = 1000;
      const drawStat = (label: string, value: string) => {
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.font = "600 30px system-ui, -apple-system, 'Segoe UI', sans-serif";
        ctx.fillText(label.toUpperCase(), W / 2, y);
        y += 55;
        ctx.fillStyle = "#ffffff";
        ctx.font = "700 60px Georgia, 'Times New Roman', serif";
        // Trunca se muito grande
        let v = value;
        while (ctx.measureText(v).width > W - 160 && v.length > 12) {
          v = v.slice(0, -2) + "…";
        }
        ctx.fillText(v, W / 2, y);
        y += 110;
      };

      if (data.topAuthor) drawStat("Autor mais lido", data.topAuthor.name);
      if (data.topGenres[0]) drawStat("Gênero favorito", data.topGenres[0].name);
      if (data.monthlyTop) {
        drawStat(
          "Mês mais intenso",
          `${data.monthlyTop.month} · ${data.monthlyTop.count}`,
        );
      }

      // Footer
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "500 32px system-ui, -apple-system, 'Segoe UI', sans-serif";
      ctx.fillText("readify · seu ano em livros", W / 2, H - 120);

      // Export
      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob falhou"))), "image/png", 0.95),
      );
      const file = new File([blob], `wrapped-${data.year}.png`, { type: "image/png" });

      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] }) && navigator.share) {
        try {
          await navigator.share({
            files: [file],
            title: `Meu Wrapped ${data.year}`,
            text: "Meu ano em livros 📚",
          });
          haptic("success");
        } catch {/* user cancel */}
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `wrapped-${data.year}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("Story salvo na galeria");
      }
    } catch (e) {
      console.error("[wrapped] story error", e);
      toast.error("Não foi possível gerar a imagem");
    } finally {
      setSavingStory(false);
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
