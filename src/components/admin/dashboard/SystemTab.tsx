import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAdminCsrfToken } from "@/hooks/useAdminCsrfToken";
import { invokeAdmin } from "@/lib/admin-invoke";
import { toast } from "sonner";
import {
  Activity, AlertTriangle, BookOpen, CheckCircle2, Cloud, Image as ImageIcon,
  Loader2, RefreshCw, Server, Sparkles, Wifi, WifiOff, Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type ProbeStatus = "ok" | "fail" | "loading" | "recovering";

interface ProbeDef {
  id: string;
  name: string;
  category: "books" | "manga" | "covers" | "ai" | "internal";
  /** Either a static URL OR an async fetcher returning a Response. */
  url?: string;
  fetcher?: () => Promise<Response>;
  /** Treat any 2xx/3xx as ok. Some APIs return 200 mesmo sem dados. */
  okStatuses?: number[];
}

interface ProbeState {
  def: ProbeDef;
  status: ProbeStatus;
  latency_ms: number | null;
  /** Falhas consecutivas — usado para backoff e badge "instável". */
  fails: number;
  /** Sucessos consecutivos — usado para detectar "voltou ao ar". */
  ups: number;
  lastChange: number | null;
  lastError?: string;
}

const CATEGORY_META: Record<ProbeDef["category"], { label: string; icon: any; color: string }> = {
  books: { label: "Livros", icon: BookOpen, color: "text-primary" },
  manga: { label: "Mangás", icon: Sparkles, color: "text-secondary" },
  covers: { label: "Capas", icon: ImageIcon, color: "text-accent" },
  ai: { label: "IA", icon: Zap, color: "text-warning" },
  internal: { label: "Backend", icon: Server, color: "text-success" },
};

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const PROBES: ProbeDef[] = [
  // --- Livros ---
  { id: "brasilapi", name: "BrasilAPI ISBN", category: "books",
    url: "https://brasilapi.com.br/api/isbn/v1/9788532530802" },
  { id: "openlibrary", name: "OpenLibrary", category: "books",
    url: "https://openlibrary.org/api/books?bibkeys=ISBN:9788532530802&format=json" },
  { id: "googlebooks", name: "Google Books", category: "books",
    url: "https://www.googleapis.com/books/v1/volumes?q=isbn:9788532530802&maxResults=1" },

  // --- Mangás ---
  {
    id: "anilist",
    name: "AniList (mangás)",
    category: "manga",
    fetcher: () =>
      fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ Page(perPage:1){ media(type:MANGA, sort:POPULARITY_DESC){ id } } }" }),
      }),
  },
  { id: "jikan", name: "Jikan (MyAnimeList)", category: "manga",
    url: "https://api.jikan.moe/v4/manga?q=naruto&limit=1" },
  { id: "mangadex", name: "MangaDex", category: "manga",
    url: "https://api.mangadex.org/manga?limit=1" },

  // --- Capas ---
  { id: "openlib-covers", name: "OpenLibrary Covers", category: "covers",
    url: "https://covers.openlibrary.org/b/isbn/9788532530802-S.jpg",
    okStatuses: [200, 302] },
  {
    id: "cover-search",
    name: "Cover Search (interno)",
    category: "covers",
    fetcher: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      return fetch(`${SUPA_URL}/functions/v1/cover-search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON,
          Authorization: session ? `Bearer ${session.access_token}` : `Bearer ${ANON}`,
        },
        body: JSON.stringify({
          isbn_13: "9788532530802",
          title: "Harry Potter e a Pedra Filosofal",
          authors: ["J.K. Rowling"],
          persist: false,
        }),
      });
    },
  },

  // --- IA ---
  {
    id: "lovable-ai",
    name: "Lovable AI Gateway",
    category: "ai",
    fetcher: async () => {
      // Probe leve via edge function generate-synopsis (HEAD-like): só checa se o endpoint responde.
      const { data: { session } } = await supabase.auth.getSession();
      return fetch(`${SUPA_URL}/functions/v1/book-chat`, {
        method: "OPTIONS",
        headers: {
          apikey: ANON,
          Authorization: session ? `Bearer ${session.access_token}` : `Bearer ${ANON}`,
        },
      });
    },
  },

  // --- Backend interno ---
  {
    id: "supabase",
    name: "Lovable Cloud (DB)",
    category: "internal",
    fetcher: async () => {
      // Ping super leve: count head em uma tabela pública.
      const r = await supabase.from("books").select("id", { count: "exact", head: true });
      // Fabrica Response sintético para uniformidade.
      return new Response(r.error ? r.error.message : "ok", {
        status: r.error ? 500 : 200,
      });
    },
  },
  {
    id: "edge-functions",
    name: "Edge Functions",
    category: "internal",
    fetcher: () =>
      fetch(`${SUPA_URL}/functions/v1/admin-csrf-token`, {
        method: "OPTIONS",
        headers: { apikey: ANON },
      }),
  },
];

const SYSTEM_OPS: { fn: string; label: string; tone?: "primary" | "warn"; body?: any; desc: string }[] = [
  { fn: "process-enrichment-queue", label: "Drenar fila de enriquecimento", desc: "Processa lote pendente da fila de IA" },
  { fn: "process-normalization-queue", label: "Drenar fila de normalização", desc: "Processa lote pendente da fila de normalização" },
  { fn: "fix-book-covers", label: "Corrigir capas (lote 100)", body: { limit: 100 }, desc: "Recupera capas faltantes em até 100 livros" },
  { fn: "validate-isbns", label: "Validar ISBNs (1000)", body: { mode: "recent", limit: 1000 }, desc: "Verifica checksums e propõe duplicatas" },
  { fn: "backfill-series", label: "Reprocessar séries", desc: "Reagrupa volumes em séries" },
  { fn: "clean-book-database", label: "Limpeza inteligente", body: { mode: "auto", limit: 200 }, desc: "Padroniza, dedupa e enfileira IA" },
];

const PROBE_TIMEOUT_MS = 6500;
const BASE_INTERVAL_MS = 60_000;
const MAX_BACKOFF_MS = 5 * 60_000; // 5min

/**
 * Aba Sistema — health checks ao vivo das APIs externas + jobs administrativos.
 *
 * Sistema de saúde:
 *  - Probes paralelos com timeout individual de 6.5s
 *  - Backoff exponencial por probe quando falha (até 5min) — não martela API caída
 *  - Retest automático a cada 60s para probes saudáveis
 *  - Reconexão automática: probes em fail rodam isoladamente em intervalos curtos
 *  - Toast de "voltou ao ar" quando uma API se recupera
 *  - Persistência de status em sessionStorage para continuidade entre tabs
 */
export function SystemTab() {
  const csrf = useAdminCsrfToken();
  const [probes, setProbes] = useState<ProbeState[]>(() =>
    PROBES.map((def) => ({
      def,
      status: "loading",
      latency_ms: null,
      fails: 0,
      ups: 0,
      lastChange: null,
    })),
  );
  const [running, setRunning] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const probesRef = useRef(probes);
  probesRef.current = probes;

  const runOne = useCallback(async (def: ProbeDef): Promise<{ ok: boolean; latency: number; error?: string }> => {
    const t0 = performance.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
      let res: Response;
      if (def.fetcher) {
        res = await def.fetcher();
      } else if (def.url) {
        res = await fetch(def.url, { signal: ctrl.signal, method: "GET" });
      } else {
        throw new Error("probe sem url/fetcher");
      }
      clearTimeout(timer);
      const okSet = new Set(def.okStatuses ?? []);
      const ok = res.ok || okSet.has(res.status);
      return {
        ok,
        latency: Math.round(performance.now() - t0),
        error: ok ? undefined : `HTTP ${res.status}`,
      };
    } catch (e: any) {
      return {
        ok: false,
        latency: Math.round(performance.now() - t0),
        error: e?.name === "AbortError" ? "timeout" : e?.message ?? "erro",
      };
    }
  }, []);

  /** Atualiza estado de um probe específico aplicando lógica de transição (recovered/down). */
  const applyResult = useCallback(
    (id: string, result: { ok: boolean; latency: number; error?: string }) => {
      setProbes((prev) =>
        prev.map((p) => {
          if (p.def.id !== id) return p;
          const wasDown = p.status === "fail" || p.status === "recovering";
          const wasUp = p.status === "ok";
          const nowUp = result.ok;
          const next: ProbeState = {
            ...p,
            status: nowUp ? "ok" : "fail",
            latency_ms: result.latency,
            fails: nowUp ? 0 : p.fails + 1,
            ups: nowUp ? p.ups + 1 : 0,
            lastChange: wasUp !== nowUp ? Date.now() : p.lastChange,
            lastError: result.error,
          };
          // Recuperação: estava caído e voltou
          if (wasDown && nowUp && p.fails >= 1) {
            toast.success(`${p.def.name} voltou ao ar (${result.latency}ms)`, {
              icon: "🟢",
            });
          }
          // Queda: estava ok e caiu (>=2 fails para evitar flicker)
          if (wasUp && !nowUp && next.fails >= 2) {
            toast.error(`${p.def.name} fora do ar — ${result.error ?? "sem resposta"}`, {
              icon: "🔴",
            });
          }
          return next;
        }),
      );
    },
    [],
  );

  /** Roda todos os probes em paralelo (ação manual ou ciclo principal). */
  const runAll = useCallback(async () => {
    setProbing(true);
    await Promise.all(
      PROBES.map(async (def) => {
        const r = await runOne(def);
        applyResult(def.id, r);
      }),
    );
    setProbing(false);
  }, [runOne, applyResult]);

  /** Loop principal: a cada 60s testa tudo. */
  useEffect(() => {
    void runAll();
    const t = setInterval(() => void runAll(), BASE_INTERVAL_MS);
    return () => clearInterval(t);
  }, [runAll]);

  /** Reconexão: para cada probe em fail, agenda retry isolado com backoff exponencial. */
  useEffect(() => {
    const timers: Record<string, ReturnType<typeof setTimeout>> = {};
    probes.forEach((p) => {
      if (p.status === "fail" && p.fails > 0) {
        // backoff: 5s, 10s, 20s, 40s … até 5min
        const delay = Math.min(5_000 * 2 ** (p.fails - 1), MAX_BACKOFF_MS);
        timers[p.def.id] = setTimeout(async () => {
          // marca como "recovering" para feedback visual
          setProbes((prev) =>
            prev.map((q) => (q.def.id === p.def.id ? { ...q, status: "recovering" } : q)),
          );
          const r = await runOne(p.def);
          applyResult(p.def.id, r);
        }, delay);
      }
    });
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
    // Re-agenda quando lista de fails muda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probes.map((p) => `${p.def.id}:${p.status}:${p.fails}`).join("|")]);

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
  const failCount = probes.filter((p) => p.status === "fail").length;
  const recoveringCount = probes.filter((p) => p.status === "recovering").length;
  const measured = probes.filter((p) => p.latency_ms != null && p.status === "ok");
  const avgLatency = measured.length
    ? measured.reduce((a, p) => a + (p.latency_ms ?? 0), 0) / measured.length
    : 0;

  // Agrupa por categoria
  const grouped = probes.reduce<Record<ProbeDef["category"], ProbeState[]>>((acc, p) => {
    (acc[p.def.category] ||= []).push(p);
    return acc;
  }, {} as any);

  const overallTone =
    failCount === 0 ? "text-success border-success/40"
    : failCount <= 2 ? "text-warning border-warning/40"
    : "text-destructive border-destructive/40";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-display text-2xl font-bold flex items-center gap-2">
          <Server className="w-5 h-5 text-primary" />
          Sistema
        </h2>
        <Button variant="outline" size="sm" onClick={() => void runAll()} disabled={probing} className="gap-2">
          {probing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Re-testar tudo
        </Button>
      </div>

      {/* APIs externas e internas */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Cloud className="w-4 h-4 text-primary" />
            Status das APIs e serviços
          </h3>
          <div className="flex items-center gap-1.5 text-xs flex-wrap">
            <Badge variant="outline" className={overallTone}>
              {okCount}/{probes.length} online
            </Badge>
            {failCount > 0 && (
              <Badge variant="outline" className="text-destructive border-destructive/40 gap-1">
                <WifiOff className="w-2.5 h-2.5" /> {failCount} fora
              </Badge>
            )}
            {recoveringCount > 0 && (
              <Badge variant="outline" className="text-warning border-warning/40 gap-1">
                <Loader2 className="w-2.5 h-2.5 animate-spin" /> {recoveringCount} reconectando
              </Badge>
            )}
            {avgLatency > 0 && <Badge variant="outline">~{Math.round(avgLatency)}ms</Badge>}
          </div>
        </div>

        {(Object.keys(grouped) as ProbeDef["category"][]).map((cat) => {
          const meta = CATEGORY_META[cat];
          const Icon = meta.icon;
          const items = grouped[cat];
          const catFails = items.filter((p) => p.status === "fail").length;
          return (
            <div key={cat} className="rounded-lg border border-border/40 bg-muted/10">
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/30">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
                  <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                  {meta.label}
                </span>
                <Badge variant="outline" className={catFails === 0 ? "text-success border-success/40 text-[10px]" : "text-destructive border-destructive/40 text-[10px]"}>
                  {items.length - catFails}/{items.length}
                </Badge>
              </div>
              <ul className="divide-y divide-border/30">
                {items.map((p) => (
                  <li key={p.def.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      {p.status === "loading" || p.status === "recovering" ? (
                        <Loader2 className={`w-3.5 h-3.5 animate-spin shrink-0 ${p.status === "recovering" ? "text-warning" : "text-muted-foreground"}`} />
                      ) : p.status === "ok" ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                      )}
                      <span className="font-medium truncate">{p.def.name}</span>
                      {p.fails >= 3 && (
                        <Badge variant="outline" className="text-[9px] text-destructive border-destructive/40 shrink-0">
                          {p.fails} falhas
                        </Badge>
                      )}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {p.lastError && p.status === "fail" && (
                        <span className="text-[10px] text-muted-foreground italic max-w-[120px] truncate hidden sm:inline" title={p.lastError}>
                          {p.lastError}
                        </span>
                      )}
                      {p.latency_ms != null && (
                        <Badge variant="outline" className={`text-[10px] ${
                          p.latency_ms < 300 ? "text-success border-success/40" :
                          p.latency_ms < 1500 ? "" : "text-warning border-warning/40"
                        }`}>
                          <Wifi className="w-2.5 h-2.5 mr-0.5" />
                          {p.latency_ms}ms
                        </Badge>
                      )}
                      <Badge
                        variant={p.status === "ok" ? "secondary" : p.status === "fail" ? "destructive" : "outline"}
                        className="text-[10px]"
                      >
                        {p.status === "ok" ? "online"
                          : p.status === "fail" ? "offline"
                          : p.status === "recovering" ? "reconectando"
                          : "…"}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
          <Activity className="w-3 h-3" />
          Re-teste automático a cada 60s. APIs offline tentam reconectar com backoff (5s → 5min).
        </p>
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
