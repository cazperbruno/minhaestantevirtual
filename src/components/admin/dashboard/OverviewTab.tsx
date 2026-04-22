import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity, BarChart3, BookOpen, CheckCircle2, Database, Loader2, RefreshCw,
  Sparkles, TrendingUp, Users,
} from "lucide-react";
import { MetricCard } from "./MetricCard";
import { useAdminMetrics } from "@/hooks/useAdminMetrics";

/**
 * Visão Geral — KPIs em tempo real (30s polling) com deltas semanais.
 * Mostra status de saúde do catálogo e da fila num painel resumo.
 */
export function OverviewTab() {
  const { metrics, loading, refreshing, refresh, error } = useAdminMetrics({ pollMs: 30_000 });

  // Crescimento semanal (esta semana vs. semana anterior em novos cadastros)
  const usersDelta = (() => {
    const prev = metrics.users_new_prev_week;
    if (prev === 0) return metrics.users_new_week > 0 ? 100 : null;
    return ((metrics.users_new_week - prev) / prev) * 100;
  })();

  const ageSec = metrics.fetched_at ? Math.round((Date.now() - metrics.fetched_at) / 1000) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Visão geral
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Atualização automática a cada 30s
            {ageSec != null && ` · capturado há ${ageSec}s`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing} className="gap-2">
          {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Atualizar agora
        </Button>
      </div>

      {error && (
        <Card className="p-3 border-destructive/40 bg-destructive/5 text-sm text-destructive">
          {error}
        </Card>
      )}

      {/* KPIs principais */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <MetricCard
          icon={<Users className="w-3.5 h-3.5" />}
          label="Usuários"
          value={metrics.users_total}
          delta={usersDelta}
          hint={`+${metrics.users_new_today} hoje · +${metrics.users_new_week} semana`}
          loading={loading}
          tone="primary"
        />
        <MetricCard
          icon={<Activity className="w-3.5 h-3.5" />}
          label="DAU"
          value={metrics.dau}
          hint={`MAU: ${metrics.mau.toLocaleString("pt-BR")}`}
          loading={loading}
        />
        <MetricCard
          icon={<BookOpen className="w-3.5 h-3.5" />}
          label="Livros"
          value={metrics.books_total}
          hint={`+${metrics.books_new_today} hoje · qualidade ${metrics.books_avg_quality}/100`}
          loading={loading}
          tone="primary"
        />
        <MetricCard
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          label="Atividades hoje"
          value={metrics.activities_today}
          hint={`${metrics.activities_last_hour} na última hora`}
          loading={loading}
          tone="success"
        />
      </section>

      {/* Saúde do sistema */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">Saúde do catálogo</h3>
          </div>
          <div className="space-y-2 text-sm">
            <Row
              label="Sem capa"
              value={metrics.books_without_cover}
              total={metrics.books_total}
              warnIf={(p) => p > 10}
            />
            <Row
              label="Qualidade < 50/100"
              value={metrics.books_low_quality}
              total={metrics.books_total}
              warnIf={(p) => p > 25}
            />
            <Row label="Qualidade média" value={`${metrics.books_avg_quality}/100`} />
          </div>
        </Card>

        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">Filas em background</h3>
          </div>
          <div className="space-y-2 text-sm">
            <Row label="Enriquecimento pendente" value={metrics.enrichment_pending} warnIf={() => metrics.enrichment_pending > 100} />
            <Row label="Enriquecimento falho" value={metrics.enrichment_failed} warnIf={() => metrics.enrichment_failed > 0} />
            <Row label="Normalização pendente" value={metrics.normalization_pending} warnIf={() => metrics.normalization_pending > 50} />
            <Row label="Duplicatas sugeridas" value={metrics.merge_suggestions} />
          </div>
          {metrics.enrichment_pending + metrics.normalization_pending + metrics.enrichment_failed === 0 && (
            <Badge variant="outline" className="text-success border-success/40 gap-1.5">
              <CheckCircle2 className="w-3 h-3" /> Tudo processado
            </Badge>
          )}
        </Card>
      </section>
    </div>
  );
}

function Row({
  label, value, total, warnIf,
}: { label: string; value: number | string; total?: number; warnIf?: (pct: number) => boolean }) {
  const num = typeof value === "number" ? value : null;
  const pct = num != null && total ? Math.round((num / Math.max(1, total)) * 100) : null;
  const warn = pct != null && warnIf?.(pct);
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono tabular-nums ${warn ? "text-warning font-semibold" : ""}`}>
        {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
        {pct != null && <span className="ml-1.5 text-[11px] text-muted-foreground">({pct}%)</span>}
      </span>
    </div>
  );
}
