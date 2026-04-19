import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Calendar, Flame, Library as LibraryIcon, Target, TrendingUp, Sparkles } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

interface UserBookRow {
  status: "not_read" | "reading" | "read" | "wishlist";
  finished_at: string | null;
  book: { authors: string[]; categories: string[] | null; title: string } | null;
}

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
// Brand-friendly palette using HSL semantic ranges (gold/wine/cream)
const COLORS = [
  "hsl(38 75% 62%)", "hsl(8 65% 55%)", "hsl(28 60% 50%)", "hsl(48 70% 65%)",
  "hsl(15 55% 45%)", "hsl(35 50% 70%)", "hsl(20 45% 40%)", "hsl(42 60% 55%)",
];

function StatCard({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string | number; hint?: string }) {
  return (
    <div className="glass rounded-2xl p-5 group hover:shadow-glow transition-all">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
          <p className="font-display text-3xl font-bold text-foreground mt-1.5">{value}</p>
          {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
        </div>
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
          <Icon className="w-5 h-5 text-primary" />
        </div>
      </div>
    </div>
  );
}

function ChartCard({ icon: Icon, title, subtitle, children }: { icon: any; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-5 md:p-6">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-4.5 h-4.5 text-primary" />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

const tooltipStyle = {
  contentStyle: {
    background: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    fontSize: 12,
    color: "hsl(var(--popover-foreground))",
  },
  labelStyle: { color: "hsl(var(--foreground))", fontWeight: 600 },
  cursor: { fill: "hsl(var(--primary) / 0.08)" },
};

export default function StatsPage() {
  const { user } = useAuth();
  const year = new Date().getFullYear();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<UserBookRow[]>([]);
  const [target, setTarget] = useState(0);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: ub }, { data: goal }, { data: s }] = await Promise.all([
        supabase
          .from("user_books")
          .select("status, finished_at, book:books(title, authors, categories)")
          .eq("user_id", user.id),
        supabase.from("reading_goals").select("target_books").eq("user_id", user.id).eq("year", year).maybeSingle(),
        supabase.rpc("reading_streak", { _user_id: user.id }),
      ]);
      setRows((ub as unknown as UserBookRow[]) || []);
      setTarget(goal?.target_books ?? 0);
      setStreak((s as unknown as number) ?? 0);
      setLoading(false);
    })();
  }, [user, year]);

  // ============ Aggregations ============
  const stats = useMemo(() => {
    const finished = rows.filter((r) => r.status === "read");
    const reading = rows.filter((r) => r.status === "reading").length;
    const finishedThisYear = finished.filter((r) => r.finished_at && new Date(r.finished_at).getFullYear() === year);

    // By month (current year)
    const monthly = MONTHS.map((m, i) => ({ month: m, livros: 0, idx: i }));
    finishedThisYear.forEach((r) => {
      if (!r.finished_at) return;
      const m = new Date(r.finished_at).getMonth();
      monthly[m].livros += 1;
    });

    // Cumulative vs goal
    const today = new Date();
    const cumulative: { month: string; lidos: number; meta: number | null }[] = [];
    let acc = 0;
    for (let i = 0; i < 12; i++) {
      acc += monthly[i].livros;
      const passed = i <= today.getMonth() || today.getFullYear() > year;
      cumulative.push({
        month: MONTHS[i],
        lidos: passed ? acc : null as any,
        meta: target ? Math.round((target / 12) * (i + 1)) : null,
      });
    }

    // Genres
    const genreMap = new Map<string, number>();
    finished.forEach((r) => {
      (r.book?.categories || []).forEach((c) => {
        const key = c.split("/").pop()?.trim() || c;
        genreMap.set(key, (genreMap.get(key) || 0) + 1);
      });
    });
    const genres = Array.from(genreMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value]) => ({ name, value }));

    // Authors
    const authorMap = new Map<string, number>();
    finished.forEach((r) => {
      (r.book?.authors || []).forEach((a) => authorMap.set(a, (authorMap.get(a) || 0) + 1));
    });
    const authors = Array.from(authorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, livros]) => ({ name: name.length > 22 ? name.slice(0, 20) + "…" : name, livros }));

    // Status distribution
    const statusDist = [
      { name: "Lidos", value: finished.length },
      { name: "Lendo", value: reading },
      { name: "Quero ler", value: rows.filter((r) => r.status === "wishlist").length },
      { name: "Não lidos", value: rows.filter((r) => r.status === "not_read").length },
    ].filter((s) => s.value > 0);

    return {
      total: rows.length,
      finishedAll: finished.length,
      finishedYear: finishedThisYear.length,
      reading,
      monthly,
      cumulative,
      genres,
      authors,
      statusDist,
    };
  }, [rows, year, target]);

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 pb-16 max-w-6xl mx-auto">
        <header className="mb-8 animate-fade-in">
          <h1 className="font-display text-4xl font-bold text-gradient-gold flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-primary" /> Estatísticas
          </h1>
          <p className="text-muted-foreground mt-1">Sua jornada de leitura em números</p>
        </header>

        {loading ? (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
            </div>
            <Skeleton className="h-72 rounded-2xl" />
            <div className="grid md:grid-cols-2 gap-6">
              <Skeleton className="h-72 rounded-2xl" />
              <Skeleton className="h-72 rounded-2xl" />
            </div>
          </div>
        ) : stats.total === 0 ? (
          <div className="glass rounded-2xl p-12 text-center animate-fade-in">
            <Sparkles className="w-12 h-12 text-primary/60 mx-auto mb-4" />
            <h2 className="font-display text-xl font-semibold mb-2">Sem dados ainda</h2>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              Adicione livros à sua biblioteca e marque alguns como lidos para ver suas estatísticas ganharem vida.
            </p>
          </div>
        ) : (
          <div className="space-y-6 animate-fade-in">
            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={LibraryIcon} label="Biblioteca" value={stats.total} hint={`${stats.finishedAll} lidos no total`} />
              <StatCard icon={Target} label={`Lidos em ${year}`} value={stats.finishedYear} hint={target ? `Meta: ${target}` : "Defina sua meta"} />
              <StatCard icon={TrendingUp} label="Lendo agora" value={stats.reading} hint={stats.reading === 1 ? "livro" : "livros"} />
              <StatCard icon={Flame} label="Sequência" value={`${streak}d`} hint="dias seguidos" />
            </div>

            {/* Cumulative vs Goal */}
            <ChartCard icon={Target} title={`Ritmo vs meta de ${year}`} subtitle="Acumulado de livros lidos comparado ao ritmo necessário">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.cumulative} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip {...tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    {target > 0 && (
                      <Line
                        type="monotone" dataKey="meta" name="Meta linear"
                        stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeWidth={2} dot={false}
                      />
                    )}
                    <Line
                      type="monotone" dataKey="lidos" name="Você"
                      stroke="hsl(var(--primary))" strokeWidth={3}
                      dot={{ fill: "hsl(var(--primary))", r: 4 }}
                      activeDot={{ r: 6, fill: "hsl(var(--primary))" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            {/* Books per month */}
            <ChartCard icon={Calendar} title={`Livros por mês em ${year}`} subtitle="Quando você mais leu">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.monthly} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                    <defs>
                      <linearGradient id="barGold" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(38 75% 70%)" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="hsl(38 75% 50%)" stopOpacity={0.7} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="livros" fill="url(#barGold)" radius={[8, 8, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Genres */}
              <ChartCard icon={Sparkles} title="Gêneros mais lidos" subtitle="Top 6 categorias">
                {stats.genres.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nenhum livro com gênero ainda.</p>
                ) : (
                  <div className="h-64 flex">
                    <ResponsiveContainer width="60%" height="100%">
                      <PieChart>
                        <Pie
                          data={stats.genres}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={45}
                          outerRadius={85}
                          paddingAngle={2}
                          stroke="hsl(var(--background))"
                          strokeWidth={2}
                        >
                          {stats.genres.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip {...tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                    <ul className="flex-1 flex flex-col justify-center gap-2 text-xs pr-2">
                      {stats.genres.map((g, i) => (
                        <li key={g.name} className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                          <span className="flex-1 truncate text-foreground">{g.name}</span>
                          <span className="text-muted-foreground font-medium">{g.value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </ChartCard>

              {/* Status distribution */}
              <ChartCard icon={LibraryIcon} title="Sua biblioteca" subtitle="Distribuição por status">
                <div className="h-64 flex">
                  <ResponsiveContainer width="60%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.statusDist}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={45}
                        outerRadius={85}
                        paddingAngle={2}
                        stroke="hsl(var(--background))"
                        strokeWidth={2}
                      >
                        {stats.statusDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip {...tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  <ul className="flex-1 flex flex-col justify-center gap-2 text-xs pr-2">
                    {stats.statusDist.map((s, i) => (
                      <li key={s.name} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="flex-1 truncate text-foreground">{s.name}</span>
                        <span className="text-muted-foreground font-medium">{s.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </ChartCard>
            </div>

            {/* Top authors */}
            <ChartCard icon={Sparkles} title="Autores favoritos" subtitle="Os que você mais leu">
              {stats.authors.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Marque livros como lidos para ver seus autores favoritos.</p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.authors} layout="vertical" margin={{ top: 5, right: 16, bottom: 0, left: 10 }}>
                      <defs>
                        <linearGradient id="barWine" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="hsl(8 65% 55%)" stopOpacity={0.7} />
                          <stop offset="100%" stopColor="hsl(38 75% 62%)" stopOpacity={0.95} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <YAxis dataKey="name" type="category" tick={{ fill: "hsl(var(--foreground))", fontSize: 12 }} axisLine={false} tickLine={false} width={140} />
                      <Tooltip {...tooltipStyle} />
                      <Bar dataKey="livros" fill="url(#barWine)" radius={[0, 8, 8, 0]} maxBarSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>
        )}
      </div>
    </AppShell>
  );
}
