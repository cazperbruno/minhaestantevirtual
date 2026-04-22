import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAdminCsrfToken } from "@/hooks/useAdminCsrfToken";
import { invokeAdmin } from "@/lib/admin-invoke";
import { toast } from "sonner";
import {
  Activity, BookOpen, CheckCircle2, Clock, Database, Image as ImageIcon,
  Loader2, Play, RefreshCw, Sparkles, XCircle, Trophy, Bell, Tag,
} from "lucide-react";

interface RunRow {
  id: string;
  job_type: string;
  source: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  result: any;
  error: string | null;
}

interface JobConfig {
  id: string;
  label: string;
  schedule: string;
  description: string;
  fn: string;
  body: any;
  icon: typeof BookOpen;
}

const JOBS: JobConfig[] = [
  {
    id: "seed",
    label: "Importar novo lote",
    schedule: "1x/dia • 04h UTC",
    description: "Importa ~200 livros novos por dia (mixto: PT, mangás, populares)",
    fn: "seed-book-database",
    body: { mode: "mixed", limit: 200 },
    icon: BookOpen,
  },
  {
    id: "validate-isbns",
    label: "Validar ISBNs",
    schedule: "2x/dia • 06h e 18h",
    description: "Verifica e corrige checksums de ISBN",
    fn: "validate-isbns",
    body: { mode: "recent", limit: 500 },
    icon: CheckCircle2,
  },
  {
    id: "clean",
    label: "Limpeza inteligente",
    schedule: "1x/dia • 03h15",
    description: "Padroniza, deduplica e enfileira para enriquecimento",
    fn: "clean-book-database",
    body: { mode: "auto", limit: 200 },
    icon: Sparkles,
  },
  {
    id: "covers-missing",
    label: "Buscar capas faltantes",
    schedule: "4x/dia • 00h, 06h, 12h, 18h",
    description: "Procura capas para livros sem imagem (cooldown 3 dias)",
    fn: "fix-book-covers",
    body: { mode: "missing", limit: 40, noAi: true },
    icon: ImageIcon,
  },
  {
    id: "covers-auto",
    label: "Revalidar capas existentes",
    schedule: "1x/dia • 03h",
    description: "Re-checa capas (pula as boas validadas há <30 dias)",
    fn: "fix-book-covers",
    body: { mode: "auto", limit: 80, noAi: true },
    icon: ImageIcon,
  },
  {
    id: "enrich",
    label: "Drenar fila de enriquecimento",
    schedule: "a cada 5 min",
    description: "Processa livros enfileirados (cooldown 14 dias)",
    fn: "process-enrichment-queue",
    body: {},
    icon: Database,
  },
  {
    id: "streak-risk",
    label: "Avisar streak em risco",
    schedule: "1x/dia • 20h BRT",
    description: "Notifica usuários cujo streak vence hoje (Fase 1)",
    fn: "notify-streak-risk",
    body: {},
    icon: Bell,
  },
  {
    id: "league-finale",
    label: "Finalística da liga",
    schedule: "domingo • 18h BRT",
    description: "Avisa posição na divisão antes do reset semanal (Fase 3)",
    fn: "notify-league-finale",
    body: {},
    icon: Trophy,
  },
  {
    id: "classify-clubs",
    label: "Classificar clubes (IA)",
    schedule: "manual",
    description: "Atribui categoria via IA aos clubes ainda em 'Geral' (lote de 50)",
    fn: "classify-clubs",
    body: {},
    icon: Tag,
  },
];

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}m atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}min`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    success: { label: "Sucesso", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
    error: { label: "Erro", className: "bg-destructive/15 text-destructive border-destructive/30" },
    partial: { label: "Parcial", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
    running: { label: "Rodando", className: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
  };
  const c = map[status] ?? map.running;
  return <Badge variant="outline" className={c.className}>{c.label}</Badge>;
}

export function AutomationTab() {
  const csrf = useAdminCsrfToken();
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("automation_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(20);
    if (!error && data) setRuns(data as RunRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const runJob = useCallback(
    async (job: JobConfig) => {
      if (!csrf.token) {
        toast.error("Token CSRF não disponível — recarregue a página");
        return;
      }
      setRunning(job.id);
      const { data, error } = await invokeAdmin(job.fn, {
        body: job.body,
        csrfToken: csrf.token,
      });
      setRunning(null);
      if (error) {
        toast.error(`${job.label}: ${error.message}`);
      } else {
        toast.success(`${job.label} executado`, {
          description: data ? JSON.stringify(data).slice(0, 120) : undefined,
        });
        load();
      }
    },
    [csrf.token, load],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Automação do catálogo
          </h2>
          <p className="text-sm text-muted-foreground">
            Jobs cron + execução manual. Cooldowns evitam reprocessar livros já bons.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {JOBS.map((job) => {
          const Icon = job.icon;
          const isRunning = running === job.id;
          return (
            <Card key={job.id} className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-primary/10 p-2">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{job.label}</div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" />
                    {job.schedule}
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{job.description}</p>
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                disabled={isRunning || !csrf.token}
                onClick={() => runJob(job)}
              >
                {isRunning ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Executar agora
              </Button>
            </Card>
          );
        })}
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Últimas 20 execuções</h3>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        {runs.length === 0 && !loading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            Nenhuma execução registrada ainda.
          </div>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {runs.map((r) => (
              <div
                key={r.id}
                className="flex items-start gap-3 p-2.5 rounded-md hover:bg-muted/50 border border-border/50"
              >
                <div className="mt-0.5">
                  {r.status === "success" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : r.status === "error" ? (
                    <XCircle className="h-4 w-4 text-destructive" />
                  ) : (
                    <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-medium">{r.job_type}</span>
                    <StatusBadge status={r.status} />
                    <Badge variant="outline" className="text-[10px]">
                      {r.source}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2">
                    <span>{formatRelative(r.started_at)}</span>
                    <span>•</span>
                    <span>{formatDuration(r.duration_ms)}</span>
                  </div>
                  {r.error && (
                    <div className="text-[11px] text-destructive mt-1 truncate">
                      {r.error}
                    </div>
                  )}
                  {r.result && typeof r.result === "object" && (
                    <div className="text-[11px] text-muted-foreground mt-1 font-mono truncate">
                      {Object.entries(r.result)
                        .filter(([, v]) => typeof v === "number" || typeof v === "string")
                        .slice(0, 4)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" • ")}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
