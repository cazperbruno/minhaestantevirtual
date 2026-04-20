import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ShoppingCart, Eye, MousePointerClick, TrendingUp, ExternalLink } from "lucide-react";
import { openAmazon } from "@/lib/amazon";
import type { Book } from "@/types/book";

type Interaction = {
  book_id: string;
  kind: string;
  created_at: string;
  meta: Record<string, unknown> | null;
};

type BookRow = Pick<Book, "id" | "title" | "authors" | "cover_url" | "isbn_10" | "isbn_13">;

type RankedBook = {
  book: BookRow;
  clicks: number;
  views: number;
  ctr: number; // 0..1
  lastClick: string;
};

const PERIOD_OPTIONS = [
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "all", label: "Todo o período" },
];

/**
 * Painel de afiliados Amazon — agrega cliques (kind='click', meta.target='amazon')
 * e views (kind='view') do `user_interactions` do usuário para calcular CTR
 * por livro e identificar campeões de conversão.
 *
 * Privacidade: usa apenas as interações do próprio usuário (RLS já garante isso).
 */
export function AffiliateClicksPanel() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("30d");
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [books, setBooks] = useState<Map<string, BookRow>>(new Map());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);

      // Janela temporal
      const from = (() => {
        if (period === "all") return null;
        const d = new Date();
        const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
        d.setDate(d.getDate() - days);
        return d.toISOString();
      })();

      let q = supabase
        .from("user_interactions")
        .select("book_id, kind, created_at, meta")
        .eq("user_id", user.id)
        .in("kind", ["click", "view"]);
      if (from) q = q.gte("created_at", from);
      const { data, error } = await q.limit(5000);
      if (cancelled) return;

      if (error || !data) {
        setInteractions([]);
        setBooks(new Map());
        setLoading(false);
        return;
      }

      const rows = data as Interaction[];
      setInteractions(rows);

      // Hidrata livros únicos (somente os que aparecem)
      const ids = Array.from(new Set(rows.map((r) => r.book_id)));
      if (ids.length) {
        const { data: bookRows } = await supabase
          .from("books")
          .select("id,title,authors,cover_url,isbn_10,isbn_13")
          .in("id", ids);
        if (cancelled) return;
        const map = new Map<string, BookRow>();
        (bookRows || []).forEach((b) => map.set(b.id, b as BookRow));
        setBooks(map);
      } else {
        setBooks(new Map());
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, period]);

  // Agregação: clicks Amazon vs views por book_id
  const ranked: RankedBook[] = useMemo(() => {
    const agg = new Map<string, { clicks: number; views: number; lastClick: string }>();
    for (const it of interactions) {
      const cur = agg.get(it.book_id) ?? { clicks: 0, views: 0, lastClick: "" };
      if (it.kind === "view") {
        cur.views += 1;
      } else if (it.kind === "click") {
        const target = (it.meta && (it.meta as Record<string, unknown>).target) as string | undefined;
        // Conta apenas cliques de Amazon (afiliado). Outros cliques (navegação interna) ignoramos.
        if (target === "amazon") {
          cur.clicks += 1;
          if (!cur.lastClick || it.created_at > cur.lastClick) cur.lastClick = it.created_at;
        }
      }
      agg.set(it.book_id, cur);
    }
    const out: RankedBook[] = [];
    agg.forEach((v, bookId) => {
      if (v.clicks === 0) return; // só livros com pelo menos 1 clique afiliado
      const book = books.get(bookId);
      if (!book) return;
      out.push({
        book,
        clicks: v.clicks,
        views: v.views,
        ctr: v.views > 0 ? v.clicks / v.views : 0,
        lastClick: v.lastClick,
      });
    });
    return out.sort((a, b) => b.clicks - a.clicks).slice(0, 20);
  }, [interactions, books]);

  // Métricas globais
  const totals = useMemo(() => {
    const totalClicks = interactions.filter(
      (i) => i.kind === "click" && (i.meta as Record<string, unknown> | null)?.target === "amazon"
    ).length;
    const totalViews = interactions.filter((i) => i.kind === "view").length;
    const ctr = totalViews > 0 ? totalClicks / totalViews : 0;
    const uniqueBooks = ranked.length;
    return { totalClicks, totalViews, ctr, uniqueBooks };
  }, [interactions, ranked]);

  return (
    <Card className="p-5 bg-card/60 backdrop-blur">
      <header className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <h3 className="font-display text-xl font-bold flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            Cliques na Amazon
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Quais livros geram mais interesse de compra (link de afiliado).
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <MetricCard
          icon={MousePointerClick}
          label="Cliques"
          value={loading ? "—" : totals.totalClicks.toLocaleString("pt-BR")}
        />
        <MetricCard
          icon={Eye}
          label="Visualizações"
          value={loading ? "—" : totals.totalViews.toLocaleString("pt-BR")}
        />
        <MetricCard
          icon={TrendingUp}
          label="CTR"
          value={loading ? "—" : `${(totals.ctr * 100).toFixed(1)}%`}
        />
        <MetricCard
          icon={ShoppingCart}
          label="Livros clicados"
          value={loading ? "—" : String(totals.uniqueBooks)}
        />
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : ranked.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Nenhum clique na Amazon registrado neste período.
        </div>
      ) : (
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-5 py-2 font-medium">#</th>
                <th className="text-left px-3 py-2 font-medium">Livro</th>
                <th className="text-right px-3 py-2 font-medium">Cliques</th>
                <th className="text-right px-3 py-2 font-medium hidden sm:table-cell">Views</th>
                <th className="text-right px-3 py-2 font-medium hidden md:table-cell">CTR</th>
                <th className="text-right px-5 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => (
                <tr key={r.book.id} className="border-t border-border/60 hover:bg-accent/20">
                  <td className="px-5 py-3 text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {r.book.cover_url && (
                        <img
                          src={r.book.cover_url}
                          alt=""
                          loading="lazy"
                          className="w-8 h-12 rounded object-cover shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium truncate">{r.book.title}</p>
                        {r.book.authors?.[0] && (
                          <p className="text-xs text-muted-foreground truncate">
                            {r.book.authors[0]}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold">{r.clicks}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                    {r.views || "—"}
                  </td>
                  <td className="px-3 py-3 text-right hidden md:table-cell">
                    {r.views > 0 ? (
                      <Badge variant="secondary" className="tabular-nums">
                        {(r.ctr * 100).toFixed(1)}%
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => openAmazon(r.book)}
                      aria-label={`Abrir ${r.book.title} na Amazon`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Amazon</span>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ShoppingCart;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="font-display text-xl md:text-2xl font-bold mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}
