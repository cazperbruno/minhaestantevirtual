import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Search, ScanLine, Download, ShoppingCart, AlertTriangle, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

type Row = {
  day: string;
  event: string;
  total: number;
  sessions: number;
  users: number;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
};

const RANGE_DAYS = 14;

const KPI_DEFS: Array<{
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  events: string[];
  /** Se definido, mostra "rate" (esses / base) em vez de só total */
  ratio?: { numerator: string[]; denominator: string[]; label: string };
  tone: "primary" | "success" | "warn" | "muted";
}> = [
  {
    key: "search",
    label: "Buscas",
    icon: Search,
    events: ["search_executed"],
    tone: "primary",
  },
  {
    key: "scanner",
    label: "Scans de ISBN",
    icon: ScanLine,
    events: ["scanner_isbn_found", "scanner_isbn_not_found", "scanner_isbn_error"],
    ratio: {
      numerator: ["scanner_isbn_not_found", "scanner_isbn_error"],
      denominator: ["scanner_isbn_found", "scanner_isbn_not_found", "scanner_isbn_error"],
      label: "taxa de falha",
    },
    tone: "success",
  },
  {
    key: "import",
    label: "Importações externas",
    icon: Download,
    events: ["import_external_book_ok", "import_external_book_failed"],
    ratio: {
      numerator: ["import_external_book_failed"],
      denominator: ["import_external_book_ok", "import_external_book_failed"],
      label: "taxa de falha",
    },
    tone: "muted",
  },
  {
    key: "amazon",
    label: "Cliques Amazon (fallback)",
    icon: ShoppingCart,
    events: ["amazon_fallback_clicked"],
    tone: "warn",
  },
];

export function EventsAnalyticsPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - RANGE_DAYS);
      const { data, error } = await supabase
        .from("app_events_daily")
        .select("*")
        .gte("day", since.toISOString())
        .order("day", { ascending: false });
      if (!alive) return;
      if (error) {
        setRows([]);
        return;
      }
      setRows((data ?? []) as Row[]);
    })();
    return () => { alive = false; };
  }, []);

  const kpis = useMemo(() => {
    if (!rows) return null;
    return KPI_DEFS.map((def) => {
      const matching = rows.filter((r) => def.events.includes(r.event));
      const total = matching.reduce((acc, r) => acc + (r.total ?? 0), 0);
      const sessions = new Set(matching.map((r) => `${r.day}|${r.sessions}`)).size; // proxy
      const sessionsSum = matching.reduce((acc, r) => acc + (r.sessions ?? 0), 0);
      const p95s = matching.map((r) => r.p95_latency_ms).filter((v): v is number => Number.isFinite(v as number));
      const p95 = p95s.length ? Math.max(...p95s) : null;

      let ratio: { value: number; label: string } | null = null;
      if (def.ratio) {
        const num = rows.filter((r) => def.ratio!.numerator.includes(r.event)).reduce((a, r) => a + r.total, 0);
        const den = rows.filter((r) => def.ratio!.denominator.includes(r.event)).reduce((a, r) => a + r.total, 0);
        ratio = den > 0 ? { value: (num / den) * 100, label: def.ratio.label } : null;
      }

      return { ...def, total, sessions: sessionsSum, p95, ratio };
    });
  }, [rows]);

  const recentTimeline = useMemo(() => {
    if (!rows) return [];
    const byDay = new Map<string, number>();
    for (const r of rows) {
      const day = r.day.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + r.total);
    }
    return [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-RANGE_DAYS);
  }, [rows]);

  if (rows === null) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-primary" />
          <h2 className="font-display text-xl font-semibold">Telemetria de produto</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="w-5 h-5 text-primary" />
          <h2 className="font-display text-xl font-semibold">Telemetria de produto</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Sem eventos nos últimos {RANGE_DAYS} dias. Conforme usuários buscarem, escanearem ou importarem livros,
          os dados aparecerão aqui automaticamente.
        </p>
      </Card>
    );
  }

  const maxBar = Math.max(...recentTimeline.map(([, v]) => v), 1);

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <h2 className="font-display text-xl font-semibold">Telemetria de produto</h2>
        </div>
        <Badge variant="outline" className="text-[11px]">últimos {RANGE_DAYS} dias</Badge>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis?.map((k) => (
          <div
            key={k.key}
            className={cn(
              "rounded-xl p-4 border bg-card/40 transition-all hover:bg-card/70",
              k.tone === "primary" && "border-primary/30",
              k.tone === "success" && "border-emerald-500/30",
              k.tone === "warn" && "border-amber-500/30",
              k.tone === "muted" && "border-border",
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <k.icon className={cn(
                "w-4 h-4",
                k.tone === "primary" && "text-primary",
                k.tone === "success" && "text-emerald-500",
                k.tone === "warn" && "text-amber-500",
                k.tone === "muted" && "text-muted-foreground",
              )} />
              <span className="text-xs uppercase tracking-wider text-muted-foreground">{k.label}</span>
            </div>
            <div className="font-display text-2xl font-bold leading-none">
              {k.total.toLocaleString("pt-BR")}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              <span>{k.sessions.toLocaleString("pt-BR")} sessões</span>
              {k.p95 !== null && <span>p95 {Math.round(k.p95)}ms</span>}
              {k.ratio && (
                <span className={cn(
                  "font-medium",
                  k.ratio.value > 30 && "text-amber-500",
                  k.ratio.value > 50 && "text-destructive",
                )}>
                  <AlertTriangle className="w-2.5 h-2.5 inline mr-0.5" />
                  {k.ratio.value.toFixed(1)}% {k.ratio.label}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Sparkline */}
      {recentTimeline.length > 1 && (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
            Eventos por dia
          </p>
          <div className="flex items-end gap-1 h-20">
            {recentTimeline.map(([day, val]) => (
              <div
                key={day}
                title={`${day}: ${val} eventos`}
                className="flex-1 bg-primary/60 hover:bg-primary rounded-t transition-colors"
                style={{ height: `${Math.max(4, (val / maxBar) * 100)}%` }}
              />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>{recentTimeline[0]?.[0]}</span>
            <span>{recentTimeline[recentTimeline.length - 1]?.[0]}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
