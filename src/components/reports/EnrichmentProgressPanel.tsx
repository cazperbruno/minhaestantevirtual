import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAdminCsrfToken } from "@/hooks/useAdminCsrfToken";
import { invokeAdmin } from "@/lib/admin-invoke";
import { toast } from "sonner";
import {
  Activity, AlertTriangle, CheckCircle2, Loader2, Pause, Play, RefreshCw, Sparkles, Zap,
} from "lucide-react";

interface Counts {
  pending: number;
  processing: number;
  done: number;
  skipped: number;
  failed: number;
}

interface RecentBook {
  id: string;
  title: string;
  cover_url: string | null;
  fields_filled: string[] | null;
  processed_at: string;
}

interface FailedJob {
  id: string;
  book_id: string;
  attempts: number;
  last_error: string | null;
  next_attempt_at: string;
  book?: { title: string } | null;
}

const POLL_MS = 3500;
const DRAIN_MAX_ROUNDS = 30; // 30 rodadas × 20 itens = 600 itens por sessão

/**
 * Painel real-time da fila de enriquecimento.
 *  - Postgres realtime + polling de fallback (3.5s)
 *  - Botão "Drenar agora" dispara o processador em loop pelo browser
 *    sem depender do cron (resolve filas travadas).
 */
export function EnrichmentProgressPanel() {
  const csrf = useAdminCsrfToken();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [recent, setRecent] = useState<RecentBook[]>([]);
  const [failures, setFailures] = useState<FailedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [live, setLive] = useState(true);
  const [lastTick, setLastTick] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draining, setDraining] = useState(false);
  const [drainStats, setDrainStats] = useState<{
    rounds: number; processed: number; success: number; failed: number; skipped: number;
  } | null>(null);
  const drainAbort = useRef<{ stopped: boolean } | null>(null);

  // Baseline para barra "desta sessão"
  const baselineRef = useRef<{ pending: number; processing: number } | null>(null);

  const aggregate = (rows: { status: string }[] | null): Counts => {
    const c: Counts = { pending: 0, processing: 0, done: 0, skipped: 0, failed: 0 };
    (rows || []).forEach((r) => {
      if (r.status in c) (c as any)[r.status]++;
    });
    return c;
  };

  const load = async (opts?: { silent?: boolean; manual?: boolean }) => {
    if (opts?.manual) setRefreshing(true);
    try {
      const [statusR, recentR, failR] = await Promise.all([
        supabase.from("enrichment_queue").select("status"),
        supabase
          .from("enrichment_queue")
          .select("id, book_id, fields_filled, processed_at, book:books(title, cover_url)")
          .eq("status", "done")
          .order("processed_at", { ascending: false })
          .limit(8),
        supabase
          .from("enrichment_queue")
          .select("id, book_id, attempts, last_error, next_attempt_at, book:books(title)")
          .in("status", ["failed", "pending"])
          .not("last_error", "is", null)
          .order("next_attempt_at", { ascending: false })
          .limit(5),
      ]);

      const firstError = statusR.error || recentR.error || failR.error;
      if (firstError) throw firstError;

      const c = aggregate(statusR.data as any);
      setCounts(c);
      if (!baselineRef.current) {
        baselineRef.current = { pending: c.pending, processing: c.processing };
      }
      setRecent(
        (recentR.data || []).map((r: any) => ({
          id: r.id,
          title: r.book?.title || "Sem título",
          cover_url: r.book?.cover_url ?? null,
          fields_filled: r.fields_filled,
          processed_at: r.processed_at,
        })),
      );
      setFailures(
        (failR.data || []).map((r: any) => ({
          id: r.id,
          book_id: r.book_id,
          attempts: r.attempts,
          last_error: r.last_error,
          next_attempt_at: r.next_attempt_at,
          book: r.book,
        })),
      );
      setLoadError(null);
      setLastTick(new Date());
    } catch (e: any) {
      const message = e?.message ?? "Falha ao atualizar progresso";
      setLoadError(message);
      if (!opts?.silent) toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Polling
  useEffect(() => {
    void load({ silent: true });
    if (!live) return;
    const t = setInterval(() => { void load({ silent: true }); }, POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  // Realtime sobre a fila — atualiza imediatamente quando um job muda de status
  useEffect(() => {
    if (!live) return;
    const ch = supabase
      .channel("enrichment_queue_progress")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "enrichment_queue" },
        () => { void load({ silent: true }); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  const sessionTotal = useMemo(() => {
    if (!counts || !baselineRef.current) return 0;
    return baselineRef.current.pending + baselineRef.current.processing;
  }, [counts]);

  const sessionDone = useMemo(() => {
    if (!counts || !baselineRef.current) return 0;
    const remaining = counts.pending + counts.processing;
    return Math.max(0, sessionTotal - remaining);
  }, [counts, sessionTotal]);

  const pct = sessionTotal === 0 ? 100 : Math.round((sessionDone / sessionTotal) * 100);
  const isIdle = (counts?.pending ?? 0) + (counts?.processing ?? 0) === 0;

  const resetBaseline = () => {
    if (!counts) return;
    baselineRef.current = { pending: counts.pending, processing: counts.processing };
    setCounts({ ...counts });
    toast.success("Barra recalibrada com os valores atuais da fila.");
  };

  const toggleLive = async () => {
    const next = !live;
    setLive(next);
    if (next) {
      toast.success("Atualização automática retomada.");
      await load({ silent: true });
    } else {
      toast.message("Atualização automática pausada.");
    }
  };

  /**
   * Drena a fila chamando process-enrichment-queue em loop pelo navegador.
   * Não depende do cron — útil quando a fila está travada.
   */
  const drainNow = async () => {
    if (draining) {
      drainAbort.current && (drainAbort.current.stopped = true);
      return;
    }
    const csrfToken = await csrf.ensureToken();
    if (!csrfToken) {
      toast.error("Token de segurança ausente. Recarregue o painel.");
      return;
    }
    setDraining(true);
    drainAbort.current = { stopped: false };
    const stats = { rounds: 0, processed: 0, success: 0, failed: 0, skipped: 0 };
    setDrainStats(stats);
    const toastId = toast.loading("Drenando fila…");
    try {
      for (let i = 0; i < DRAIN_MAX_ROUNDS; i++) {
        if (drainAbort.current?.stopped) break;
        const { data, error } = await invokeAdmin<{
          processed: number; success: number; skipped: number; failed: number; auth_failed?: number;
        }>("process-enrichment-queue", { csrfToken, body: {} });
        if (error) {
          toast.error(`Drenagem falhou: ${error.message}`, { id: toastId });
          break;
        }
        stats.rounds += 1;
        stats.processed += data?.processed ?? 0;
        stats.success += data?.success ?? 0;
        stats.failed += data?.failed ?? 0;
        stats.skipped += data?.skipped ?? 0;
        setDrainStats({ ...stats });
        toast.loading(
          `Drenando… rodada ${stats.rounds} · ${stats.success} ok · ${stats.failed} falhas`,
          { id: toastId },
        );
        if ((data?.processed ?? 0) === 0) break; // fila esvaziou
        if ((data?.auth_failed ?? 0) > 0 && (data?.success ?? 0) === 0) {
          toast.error("Falha de autenticação ao chamar enrich-book — verifique secrets.", { id: toastId });
          break;
        }
        await load({ silent: true });
        // pequena pausa entre rodadas
        await new Promise((r) => setTimeout(r, 400));
      }
      toast.success(
        `Drenagem concluída: ${stats.success} ok · ${stats.skipped} pulados · ${stats.failed} falhas`,
        { id: toastId },
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Erro inesperado na drenagem", { id: toastId });
    } finally {
      setDraining(false);
      drainAbort.current = null;
      void load({ silent: true });
    }
  };

  if (loading) {
    return (
      <Card className="p-6 space-y-3">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-3 w-full" />
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display text-xl font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Progresso de importação · tempo real
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Realtime + polling {POLL_MS / 1000}s
            {lastTick && (
              <span className="ml-2 text-xs">
                · atualizado {lastTick.toLocaleTimeString("pt-BR")}
              </span>
            )}
          </p>
          {loadError && <p className="text-xs text-destructive mt-1">{loadError}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant={draining ? "destructive" : "default"}
            onClick={() => void drainNow()}
            className="gap-2"
            disabled={!draining && (counts?.pending ?? 0) === 0}
          >
            {draining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            {draining ? "Parar drenagem" : "Drenar agora"}
          </Button>
          <Button
            size="sm"
            variant={live ? "outline" : "outline"}
            onClick={() => void toggleLive()}
            className="gap-2"
          >
            {live ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {live ? "Pausar" : "Retomar"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void load({ manual: true })} aria-label="Atualizar agora" disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" variant="ghost" onClick={resetBaseline} title="Reinicia a barra usando os valores atuais como ponto zero">
            Zerar barra
          </Button>
        </div>
      </div>

      {/* Barra principal */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {isIdle ? (
              <span className="text-success flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Fila vazia · sistema ocioso
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                {sessionDone}/{sessionTotal} processados nesta sessão
              </span>
            )}
          </span>
          <span className="font-mono text-xs text-muted-foreground">{pct}%</span>
        </div>
        <Progress value={pct} className="h-2.5" />
        {drainStats && drainStats.rounds > 0 && (
          <p className="text-xs text-muted-foreground">
            Drenagem manual: {drainStats.rounds} rodada(s) · {drainStats.success} ok · {drainStats.skipped} pulados · {drainStats.failed} falhas
          </p>
        )}
      </div>

      {/* Status grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <StatusCell label="Pendentes" value={counts?.pending ?? 0} tone="info" />
        <StatusCell label="Processando" value={counts?.processing ?? 0} tone="active" />
        <StatusCell label="Concluídos" value={counts?.done ?? 0} tone="success" />
        <StatusCell label="Pulados" value={counts?.skipped ?? 0} tone="muted" />
        <StatusCell label="Falhas" value={counts?.failed ?? 0} tone="danger" />
      </div>

      {/* Recentemente enriquecidos */}
      <div className="space-y-2">
        <p className="text-sm font-semibold flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-primary" /> Últimos enriquecidos
        </p>
        {recent.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum livro enriquecido ainda.</p>
        ) : (
          <ul className="divide-y divide-border/40 rounded-lg border border-border/40 bg-muted/10">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center gap-3 p-2.5">
                {r.cover_url ? (
                  <img
                    src={r.cover_url}
                    alt=""
                    className="w-8 h-11 rounded object-cover shrink-0 border border-border/40"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-8 h-11 rounded bg-muted shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{r.title}</p>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {(r.fields_filled || []).slice(0, 5).map((f) => (
                      <Badge key={f} variant="secondary" className="text-[10px] px-1.5 py-0">{f}</Badge>
                    ))}
                    {(!r.fields_filled || r.fields_filled.length === 0) && (
                      <span className="text-[10px] text-muted-foreground">sem campos novos</span>
                    )}
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {new Date(r.processed_at).toLocaleTimeString("pt-BR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Falhas recentes */}
      {failures.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold flex items-center gap-1.5 text-warning">
            <AlertTriangle className="w-4 h-4" /> Erros recentes
          </p>
          <ul className="divide-y divide-border/40 rounded-lg border border-warning/30 bg-warning/5">
            {failures.map((f) => (
              <li key={f.id} className="p-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{f.book?.title || f.book_id}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    tentativa {f.attempts}
                  </Badge>
                </div>
                {f.last_error && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{f.last_error}</p>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">
                  Próxima tentativa: {new Date(f.next_attempt_at).toLocaleString("pt-BR")}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function StatusCell({
  label, value, tone,
}: { label: string; value: number; tone: "info" | "active" | "success" | "muted" | "danger" }) {
  const cls = {
    info: "border-primary/30 bg-primary/5 text-primary",
    active: "border-primary/40 bg-primary/10 text-primary",
    success: "border-success/30 bg-success/5 text-success",
    muted: "border-border/50 bg-muted/30 text-muted-foreground",
    danger: "border-destructive/30 bg-destructive/5 text-destructive",
  }[tone];
  return (
    <div className={`rounded-lg border p-2.5 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="font-display text-xl font-bold mt-0.5">{value.toLocaleString("pt-BR")}</div>
    </div>
  );
}
