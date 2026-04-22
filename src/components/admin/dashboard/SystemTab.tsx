import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminCsrfToken } from "@/hooks/useAdminCsrfToken";
import { invokeAdmin } from "@/lib/admin-invoke";
import { toast } from "sonner";
import {
  Activity, AlertTriangle, CheckCircle2, Cloud, Loader2, RefreshCw, Server, Wifi,
} from "lucide-react";

interface Probe {
  name: string;
  url: string;
  status: "ok" | "fail" | "loading";
  latency_ms: number | null;
}

const PROBES: { name: string; url: string }[] = [
  { name: "BrasilAPI ISBN", url: "https://brasilapi.com.br/api/isbn/v1/9788532530802" },
  { name: "OpenLibrary", url: "https://openlibrary.org/api/books?bibkeys=ISBN:9788532530802&format=json" },
  { name: "Google Books", url: "https://www.googleapis.com/books/v1/volumes?q=isbn:9788532530802&maxResults=1" },
];

const SYSTEM_OPS: { fn: string; label: string; tone?: "primary" | "warn"; body?: any; desc: string }[] = [
  { fn: "process-enrichment-queue", label: "Drenar fila de enriquecimento", desc: "Processa lote pendente da fila de IA" },
  { fn: "process-normalization-queue", label: "Drenar fila de normalização", desc: "Processa lote pendente da fila de normalização" },
  { fn: "fix-book-covers", label: "Corrigir capas (lote 100)", body: { limit: 100 }, desc: "Recupera capas faltantes em até 100 livros" },
  { fn: "validate-isbns", label: "Validar ISBNs (1000)", body: { mode: "recent", limit: 1000 }, desc: "Verifica checksums e propõe duplicatas" },
  { fn: "backfill-series", label: "Reprocessar séries", desc: "Reagrupa volumes em séries" },
  { fn: "clean-book-database", label: "Limpeza inteligente", body: { mode: "auto", limit: 200 }, desc: "Padroniza, dedupa e enfileira IA" },
];

/**
 * Aba Sistema — health checks ao vivo das APIs externas + jobs administrativos.
 */
export function SystemTab() {
  const csrf = useAdminCsrfToken();
  const [probes, setProbes] = useState<Probe[]>(
    PROBES.map((p) => ({ ...p, status: "loading", latency_ms: null })),
  );
  const [running, setRunning] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);

  const runProbes = async () => {
    setProbing(true);
    const results: Probe[] = await Promise.all(
      PROBES.map(async (p) => {
        const t0 = performance.now();
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 6500);
          const r = await fetch(p.url, { signal: ctrl.signal });
          clearTimeout(timer);
          return {
            ...p,
            status: r.ok ? "ok" : "fail",
            latency_ms: Math.round(performance.now() - t0),
          };
        } catch {
          return { ...p, status: "fail", latency_ms: Math.round(performance.now() - t0) };
        }
      }),
    );
    setProbes(results);
    setProbing(false);
  };

  useEffect(() => {
    void runProbes();
    const t = setInterval(() => void runProbes(), 60_000);
    return () => clearInterval(t);
  }, []);

  const runOp = async (fn: string, label: string, body?: any) => {
    setRunning(fn);
    const id = toast.loading(`Executando ${label}…`);
    try {
      const csrfToken = await csrf.ensureToken();
      if (!csrfToken) throw new Error("Token CSRF ausente");
      const { data, error } = await invokeAdmin(fn, { csrfToken, body });
      if (error) throw error;
      const summary = JSON.stringify(data ?? {}).slice(0, 140);
      toast.success(`${label}: ${summary}`, { id });
    } catch (e: any) {
      toast.error(e?.message ?? `Falha em ${label}`, { id });
    } finally {
      setRunning(null);
    }
  };

  const okCount = probes.filter((p) => p.status === "ok").length;
  const avgLatency = probes
    .filter((p) => p.latency_ms != null)
    .reduce((a, p) => a + (p.latency_ms ?? 0), 0) / Math.max(1, probes.length);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-display text-2xl font-bold flex items-center gap-2">
          <Server className="w-5 h-5 text-primary" />
          Sistema
        </h2>
        <Button variant="outline" size="sm" onClick={() => void runProbes()} disabled={probing} className="gap-2">
          {probing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Re-testar APIs
        </Button>
      </div>

      {/* APIs externas */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Cloud className="w-4 h-4 text-primary" />
            Status das APIs externas
          </h3>
          <div className="flex items-center gap-1.5 text-xs">
            <Badge variant="outline" className={okCount === probes.length ? "text-success border-success/40" : "text-warning border-warning/40"}>
              {okCount}/{probes.length} online
            </Badge>
            <Badge variant="outline">~{Math.round(avgLatency)}ms</Badge>
          </div>
        </div>
        <ul className="divide-y divide-border/40">
          {probes.map((p) => (
            <li key={p.name} className="flex items-center justify-between gap-2 py-2.5 text-sm">
              <span className="flex items-center gap-2">
                {p.status === "loading" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                ) : p.status === "ok" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                )}
                <span className="font-medium">{p.name}</span>
              </span>
              <div className="flex items-center gap-2">
                {p.latency_ms != null && (
                  <Badge variant="outline" className={`text-[10px] ${
                    p.latency_ms < 300 ? "text-success border-success/40" :
                    p.latency_ms < 1500 ? "" : "text-warning border-warning/40"
                  }`}>
                    <Wifi className="w-2.5 h-2.5 mr-0.5" />
                    {p.latency_ms}ms
                  </Badge>
                )}
                <Badge variant={p.status === "ok" ? "secondary" : p.status === "fail" ? "destructive" : "outline"} className="text-[10px]">
                  {p.status === "ok" ? "online" : p.status === "fail" ? "offline" : "…"}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* Operações administrativas */}
      <Card className="p-5 space-y-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          Jobs e operações
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SYSTEM_OPS.map((op) => (
            <button
              key={op.fn}
              type="button"
              onClick={() => void runOp(op.fn, op.label, op.body)}
              disabled={running !== null}
              className="text-left rounded-lg border border-border/50 bg-muted/10 hover:bg-muted/30 hover:border-primary/40 p-3 transition-all disabled:opacity-50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{op.label}</span>
                {running === op.fn && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{op.desc}</p>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
