import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ArrowRight, Sparkles, TrendingUp, Calendar, BookOpen } from "lucide-react";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

interface Row {
  status: string;
  finished_at: string | null;
  book: { categories: string[] | null; authors: string[] } | null;
}

/**
 * Aba "Relatórios" — análise + insights automáticos a partir dos
 * próprios dados do usuário (sem chamada de IA, instantâneo).
 */
export function ProfileReportsTab({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("user_books")
        .select("status, finished_at, book:books(categories, authors)")
        .eq("user_id", userId);
      if (!mounted) return;
      setRows((data as unknown as Row[]) || []);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [userId]);

  const insights = useMemo(() => {
    const finished = rows.filter((r) => r.status === "read" && r.finished_at);
    const now = new Date();
    const year = now.getFullYear();
    const thisMonth = now.getMonth();

    // Por mês (12m móveis)
    const monthly = MONTHS.map((m, i) => ({ month: m, livros: 0, idx: i }));
    finished.forEach((r) => {
      const d = new Date(r.finished_at!);
      if (d.getFullYear() === year) monthly[d.getMonth()].livros += 1;
    });

    const finishedThisMonth = monthly[thisMonth].livros;
    const finishedPrevMonth = thisMonth > 0 ? monthly[thisMonth - 1].livros : 0;
    const monthDelta = finishedThisMonth - finishedPrevMonth;

    // Gênero do mês
    const genreThisMonth = new Map<string, number>();
    finished.forEach((r) => {
      const d = new Date(r.finished_at!);
      if (d.getFullYear() !== year || d.getMonth() !== thisMonth) return;
      (r.book?.categories || []).forEach((c) => {
        const key = c.split("/").pop()?.trim() || c;
        genreThisMonth.set(key, (genreThisMonth.get(key) || 0) + 1);
      });
    });
    const topGenre = Array.from(genreThisMonth.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];

    // Autor mais lido total
    const authorMap = new Map<string, number>();
    finished.forEach((r) => (r.book?.authors || []).forEach((a) => authorMap.set(a, (authorMap.get(a) || 0) + 1)));
    const topAuthor = Array.from(authorMap.entries()).sort((a, b) => b[1] - a[1])[0];

    // Média mensal nos últimos 6 meses (com dados)
    const last6 = monthly.slice(Math.max(0, thisMonth - 5), thisMonth + 1);
    const avg6 = last6.length ? last6.reduce((a, b) => a + b.livros, 0) / last6.length : 0;

    return {
      finished: finished.length,
      finishedThisYear: monthly.reduce((a, b) => a + b.livros, 0),
      finishedThisMonth,
      monthDelta,
      monthly,
      topGenre,
      topAuthor,
      avg6,
    };
  }, [rows]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    );
  }

  if (insights.finished === 0) {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <TrendingUp className="w-10 h-10 text-primary/60 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          Marque livros como lidos para desbloquear seus relatórios e insights.
        </p>
      </div>
    );
  }

  const insightCards: { icon: React.ReactNode; text: React.ReactNode }[] = [];
  if (insights.monthDelta > 0) {
    insightCards.push({
      icon: <TrendingUp className="w-4 h-4 text-status-read" />,
      text: <>Você leu <b>{insights.monthDelta}</b> livro(s) a mais que mês passado. Bora!</>,
    });
  } else if (insights.monthDelta < 0 && insights.finishedThisMonth > 0) {
    insightCards.push({
      icon: <TrendingUp className="w-4 h-4 text-status-wishlist" />,
      text: <>Mês passado você leu mais <b>{Math.abs(insights.monthDelta)}</b>. Ainda dá tempo de virar.</>,
    });
  }
  if (insights.topGenre) {
    insightCards.push({
      icon: <Sparkles className="w-4 h-4 text-primary" />,
      text: <>Este mês você foi de <b>{insights.topGenre}</b>.</>,
    });
  }
  if (insights.topAuthor && insights.topAuthor[1] > 1) {
    insightCards.push({
      icon: <BookOpen className="w-4 h-4 text-primary" />,
      text: <>Seu autor mais lido é <b>{insights.topAuthor[0]}</b> ({insights.topAuthor[1]} livros).</>,
    });
  }
  insightCards.push({
    icon: <Calendar className="w-4 h-4 text-muted-foreground" />,
    text: <>Média de <b>{insights.avg6.toFixed(1)}</b> livro(s)/mês nos últimos 6 meses.</>,
  });

  return (
    <div className="space-y-5">
      {/* Insights automáticos */}
      <section className="glass rounded-2xl p-5">
        <h3 className="font-display text-lg font-semibold flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-primary" /> Insights
        </h3>
        <ul className="space-y-2.5">
          {insightCards.map((c, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              <span className="mt-0.5 shrink-0">{c.icon}</span>
              <span className="leading-snug">{c.text}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Evolução por mês */}
      <section className="glass rounded-2xl p-5">
        <h3 className="font-display text-lg font-semibold flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-primary" /> Evolução por mês
        </h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={insights.monthly} margin={{ top: 5, right: 8, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="reportBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                cursor={{ fill: "hsl(var(--primary) / 0.08)" }}
              />
              <Bar dataKey="livros" fill="url(#reportBar)" radius={[6, 6, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <Button asChild variant="outline" className="w-full gap-1.5">
        <Link to="/estatisticas">Ver análise completa <ArrowRight className="w-4 h-4" /></Link>
      </Button>
    </div>
  );
}
