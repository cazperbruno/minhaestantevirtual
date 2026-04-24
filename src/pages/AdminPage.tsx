import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useAdminCsrfToken } from "@/hooks/useAdminCsrfToken";
import { invokeAdmin } from "@/lib/admin-invoke";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CatalogQualityPanel } from "@/components/reports/CatalogQualityPanel";
import { EnrichmentProgressPanel } from "@/components/reports/EnrichmentProgressPanel";
import { IsbnQuickLookup } from "@/components/admin/IsbnQuickLookup";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverviewTab } from "@/components/admin/dashboard/OverviewTab";
import { UsersTab } from "@/components/admin/dashboard/UsersTab";
import { SystemTab } from "@/components/admin/dashboard/SystemTab";
import { FeedTab } from "@/components/admin/dashboard/FeedTab";
import { LogsTab } from "@/components/admin/dashboard/LogsTab";
import { AutomationTab } from "@/components/admin/dashboard/AutomationTab";
import {
  Shield, Loader2, Download, RefreshCw, ShieldCheck, ShieldAlert,
  LayoutDashboard, Users, Server, Activity, FileSearch, Database, Wrench, Zap,
} from "lucide-react";

interface AuditRow {
  id: string;
  process: string;
  action: string;
  created_at: string;
  details: any;
}

export default function AdminPage() {
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const csrf = useAdminCsrfToken();
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");

  // Import-by-ISBN state
  const [isbnInput, setIsbnInput] = useState("");
  const [language, setLanguage] = useState<string>("any");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [importResult, setImportResult] = useState<any>(null);

  const loadStats = async () => {
    setLoading(true);
    try {
      const logsR = await supabase
        .from("book_audit_log")
        .select("id, process, action, created_at, details")
        .order("created_at", { ascending: false })
        .limit(10);
      setLogs((logsR.data as AuditRow[]) || []);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao carregar logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) void loadStats();
  }, [isAdmin]);

  if (adminLoading) {
    return (
      <AppShell>
        <div className="min-h-[50vh] flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  // ===== Import by ISBN =====
  // Parser inteligente: aceita ISBN-10/13, normaliza, deduplica e separa válidos de inválidos.
  const parseIsbnDetail = (raw: string) => {
    const seen = new Set<string>();
    const valid: string[] = [];
    const invalid: string[] = [];
    const tokens = raw.split(/[\s,;\n\r]+/).map((s) => s.trim()).filter(Boolean);
    for (const t of tokens) {
      const cleaned = t.replace(/[^0-9Xx]/g, "").toUpperCase();
      if (cleaned.length !== 10 && cleaned.length !== 13) {
        invalid.push(t);
        continue;
      }
      if (seen.has(cleaned)) continue;
      seen.add(cleaned);
      valid.push(cleaned);
    }
    return { valid, invalid, duplicates: tokens.length - valid.length - invalid.length };
  };
  const parseIsbns = (raw: string) => parseIsbnDetail(raw).valid;

  const runIsbnImport = async () => {
    const detail = parseIsbnDetail(isbnInput);
    // Item 4: aceita até 500 por execução (5 lotes de 100)
    const MAX_ISBNS = 500;
    let all = detail.valid;
    if (all.length === 0) {
      toast.error("Cole pelo menos um ISBN válido (10 ou 13 dígitos).");
      return;
    }
    if (all.length > MAX_ISBNS) {
      toast.warning(`${all.length} ISBNs colados — processando os primeiros ${MAX_ISBNS}`);
      all = all.slice(0, MAX_ISBNS);
    }
    if (detail.invalid.length > 0) {
      toast.warning(`${detail.invalid.length} entrada(s) ignorada(s) por não serem ISBN válido`);
    }
    setImporting(true);
    setImportResult(null);
    setProgress({ done: 0, total: all.length });
    const t0 = performance.now();
    const aggregated = {
      received: 0, invalid: detail.invalid.length, already_existed: 0,
      not_found_external: 0, inserted: 0, enqueued_for_enrichment: 0,
      ai_fallback_used: 0, avg_quality_score: 0,
      sample: [] as { isbn: string; title: string; score: number; source: string }[],
      errors: [] as string[],
      duration_ms: 0,
      batches: 0,
    };
    let scoreSum = 0;
    let scoreCount = 0;
    try {
      const csrfToken = await csrf.ensureToken();
      if (!csrfToken) {
        toast.error("Não foi possível obter o token de segurança. Recarregue a página.");
        return;
      }
      // Lotes de 100 (limite máximo do edge function) — 2 lotes em paralelo p/ acelerar.
      const BATCH = 100;
      const PARALLEL = 2;
      const batches: string[][] = [];
      for (let i = 0; i < all.length; i += BATCH) batches.push(all.slice(i, i + BATCH));
      aggregated.batches = batches.length;

      let processedIsbns = 0;
      for (let i = 0; i < batches.length; i += PARALLEL) {
        const slice = batches.slice(i, i + PARALLEL);
        const results = await Promise.all(
          slice.map((chunk) =>
            invokeAdmin("import-books-by-isbn", {
              csrfToken,
              body: {
                isbns: chunk,
                language: language === "any" ? null : language,
              },
            }),
          ),
        );
        for (let k = 0; k < results.length; k++) {
          const { data, error } = results[k];
          if (error) throw error;
          const d: any = data ?? {};
          aggregated.received += d.received ?? 0;
          aggregated.invalid += d.invalid ?? 0;
          aggregated.already_existed += d.already_existed ?? 0;
          aggregated.not_found_external += d.not_found_external ?? 0;
          aggregated.inserted += d.inserted ?? 0;
          aggregated.enqueued_for_enrichment += d.enqueued_for_enrichment ?? 0;
          aggregated.ai_fallback_used += d.ai_fallback_used ?? 0;
          if (typeof d.avg_quality_score === "number" && d.inserted > 0) {
            scoreSum += d.avg_quality_score * d.inserted;
            scoreCount += d.inserted;
          }
          if (Array.isArray(d.sample)) aggregated.sample.push(...d.sample);
          if (d.errors?.length) aggregated.errors.push(...d.errors);
          processedIsbns += slice[k].length;
        }
        setProgress({ done: Math.min(processedIsbns, all.length), total: all.length });
      }
      aggregated.avg_quality_score = scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0;
      aggregated.duration_ms = Math.round(performance.now() - t0);
      setImportResult(aggregated);
      toast.success(
        `${aggregated.inserted} novos · ${aggregated.already_existed} existentes · ${aggregated.not_found_external} não encontrados · ${(aggregated.duration_ms / 1000).toFixed(1)}s`,
      );
      await loadStats();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha na importação");
    } finally {
      setImporting(false);
      setProgress(null);
    }
  };

  const runFn = async (fn: string, label: string, body?: any) => {
    const id = toast.loading(`Rodando ${label}…`);
    try {
      const csrfToken = await csrf.ensureToken();
      if (!csrfToken) {
        toast.error("Token de segurança ausente. Recarregue a página.", { id });
        return;
      }
      const { data, error } = await invokeAdmin(fn, { csrfToken, body });
      if (error) throw error;
      toast.success(`${label}: ${JSON.stringify(data).slice(0, 120)}…`, { id });
      await loadStats();
    } catch (e: any) {
      toast.error(e?.message ?? `Falha em ${label}`, { id });
    }
  };

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-6">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <Shield className="h-3.5 w-3.5" /> Painel Super Admin
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
              Controle <span className="text-gradient-gold">total</span> do sistema
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Acesso restrito · operações afetam o banco de produção
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <CsrfBadge
              token={csrf.token}
              expiresAt={csrf.expiresAt}
              loading={csrf.loading}
              error={csrf.error}
              onRotate={async () => {
                const id = toast.loading("Rotacionando token CSRF…");
                try {
                  // Limpa estado antigo da sessão antes de pedir um novo
                  try {
                    sessionStorage.removeItem("readify.admin.csrf");
                  } catch { /* noop */ }
                  const newToken = await csrf.rotate();
                  if (newToken) {
                    toast.success("Novo token CSRF emitido com sucesso", { id });
                  } else {
                    toast.error(
                      csrf.error ?? "Falha ao emitir novo token CSRF",
                      { id },
                    );
                  }
                } catch (e: any) {
                  toast.error(e?.message ?? "Falha ao rotacionar token CSRF", { id });
                }
              }}
            />
            <Button variant="outline" onClick={loadStats} disabled={loading} className="gap-2">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </header>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid grid-cols-4 md:grid-cols-7 w-full h-auto gap-1 bg-muted/30 p-1">
            <TabsTrigger value="overview" className="gap-1.5 text-xs">
              <LayoutDashboard className="w-3.5 h-3.5" /> Visão geral
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-1.5 text-xs">
              <Users className="w-3.5 h-3.5" /> Usuários
            </TabsTrigger>
            <TabsTrigger value="content" className="gap-1.5 text-xs">
              <Database className="w-3.5 h-3.5" /> Conteúdo
            </TabsTrigger>
            <TabsTrigger value="automation" className="gap-1.5 text-xs">
              <Zap className="w-3.5 h-3.5" /> Automação
            </TabsTrigger>
            <TabsTrigger value="feed" className="gap-1.5 text-xs">
              <Activity className="w-3.5 h-3.5" /> Feed
            </TabsTrigger>
            <TabsTrigger value="system" className="gap-1.5 text-xs">
              <Server className="w-3.5 h-3.5" /> Sistema
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-1.5 text-xs">
              <FileSearch className="w-3.5 h-3.5" /> Logs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-5 mt-4">
            <OverviewTab />
          </TabsContent>

          <TabsContent value="users" className="mt-4">
            <UsersTab />
          </TabsContent>

          <TabsContent value="content" className="space-y-5 mt-4">
            <CatalogQualityPanel />
            <EnrichmentProgressPanel />
            <IsbnQuickLookup onImported={loadStats} />

            {/* Importação por ISBN */}
            <Card className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="font-display text-xl font-semibold flex items-center gap-2">
                    <Download className="w-5 h-5 text-primary" />
                    Importar livros por lista de ISBN
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Cole até <strong>500 ISBNs</strong> (10 ou 13 dígitos), um por linha ou separados por vírgula. Processa em <strong>lotes de 100</strong> com 2 lotes paralelos.
                    Cascade: BrasilAPI → OpenLibrary → Google Books → IA fallback. <strong>Prioridade PT-BR</strong> sempre ativa.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <Label className="text-xs">ISBNs</Label>
                  <Textarea
                    value={isbnInput}
                    onChange={(e) => setIsbnInput(e.target.value)}
                    placeholder={"9788532530802\n9788576572008\n9788595084742"}
                    rows={8}
                    className="font-mono text-sm"
                    disabled={importing}
                  />
                  {(() => {
                    const d = parseIsbnDetail(isbnInput);
                    const batches = Math.ceil(d.valid.length / 100);
                    return (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-xs">
                        <Badge variant="secondary" className="font-normal">
                          {d.valid.length} válidos
                        </Badge>
                        {d.invalid.length > 0 && (
                          <Badge variant="outline" className="font-normal text-warning border-warning/40">
                            {d.invalid.length} inválidos (ignorados)
                          </Badge>
                        )}
                        {batches > 0 && (
                          <span className="text-muted-foreground">
                            · {batches} lote{batches > 1 ? "s" : ""} de até 100
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Idioma preferido</Label>
                    <Select value={language} onValueChange={setLanguage} disabled={importing}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Qualquer</SelectItem>
                        <SelectItem value="pt">Português (pt-BR prioritário)</SelectItem>
                        <SelectItem value="en">Inglês</SelectItem>
                        <SelectItem value="es">Espanhol</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={runIsbnImport}
                    disabled={importing || parseIsbns(isbnInput).length === 0}
                    className="w-full gap-2"
                  >
                    {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Importar {parseIsbns(isbnInput).length || ""} ISBNs
                  </Button>
                </div>
              </div>

              {progress && (
                <div className="space-y-1">
                  <Progress value={(progress.done / progress.total) * 100} />
                  <p className="text-xs text-muted-foreground">
                    Processando {progress.done}/{progress.total}…
                  </p>
                </div>
              )}

              {importResult && (
                <div className="rounded-xl border border-border/50 bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-semibold">Resultado da importação</p>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {importResult.batches > 0 && (
                        <Badge variant="outline" className="font-normal">
                          {importResult.batches} lote{importResult.batches > 1 ? "s" : ""}
                        </Badge>
                      )}
                      {importResult.duration_ms > 0 && (
                        <Badge variant="outline" className="font-normal">
                          {(importResult.duration_ms / 1000).toFixed(1)}s
                        </Badge>
                      )}
                      {importResult.received > 0 && (
                        <Badge
                          variant="outline"
                          className={`font-normal ${
                            ((importResult.inserted + importResult.already_existed) / importResult.received) >= 0.8
                              ? "text-success border-success/40"
                              : "text-warning border-warning/40"
                          }`}
                        >
                          {Math.round(((importResult.inserted + importResult.already_existed) / Math.max(1, importResult.received)) * 100)}% sucesso
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <ResultPill label="Recebidos" value={importResult.received} />
                    <ResultPill label="Inválidos" value={importResult.invalid} variant="warn" />
                    <ResultPill label="Já existiam" value={importResult.already_existed} variant="muted" />
                    <ResultPill label="Não encontrados" value={importResult.not_found_external} variant="warn" />
                    <ResultPill label="Inseridos ✓" value={importResult.inserted} variant="success" />
                    <ResultPill label="Na fila enrich" value={importResult.enqueued_for_enrichment} variant="success" />
                    <ResultPill label="IA fallback" value={importResult.ai_fallback_used ?? 0} variant="muted" />
                    <ResultPill
                      label="Qualidade média"
                      value={importResult.avg_quality_score ? `${importResult.avg_quality_score}/100` : "—"}
                      variant={importResult.avg_quality_score >= 70 ? "success" : "warn"}
                    />
                  </div>
                  {importResult.sample?.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground">
                        {importResult.sample.length} amostras inseridas
                      </summary>
                      <ul className="mt-2 space-y-1">
                        {importResult.sample.slice(0, 20).map((s: any, i: number) => (
                          <li key={i} className="flex items-center justify-between gap-2">
                            <span className="truncate">{s.title}</span>
                            <span className="shrink-0 text-muted-foreground">
                              {s.score}/100 · {s.source}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {importResult.errors?.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-warning">{importResult.errors.length} erros</summary>
                      <pre className="mt-2 whitespace-pre-wrap text-muted-foreground">
                        {importResult.errors.slice(0, 5).join("\n")}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </Card>

            {/* Operações rápidas de conteúdo */}
            <Card className="p-6 space-y-4">
              <h3 className="font-display text-xl font-semibold flex items-center gap-2">
                <Wrench className="w-5 h-5 text-primary" />
                Operações rápidas
              </h3>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => runFn("seed-book-database", "Seed", { mode: "mixed", limit: 200 })}>
                  Importar lote (200 livros)
                </Button>
                <Button variant="outline" size="sm" onClick={() => runFn("clean-book-database", "Limpeza inteligente", { mode: "auto", limit: 200 })}>
                  Limpeza inteligente
                </Button>
                <Button variant="outline" size="sm" onClick={() => runFn("validate-isbns", "Validar ISBNs", { mode: "recent", limit: 1000 })}>
                  Validar ISBNs
                </Button>
                <Button variant="outline" size="sm" onClick={() => runFn("backfill-series", "Reprocessar séries")}>
                  Reprocessar séries
                </Button>
                <Button variant="outline" size="sm" onClick={() => runFn("fix-book-covers", "Corrigir capas", { limit: 100 })}>
                  Corrigir capas
                </Button>
              </div>
            </Card>

            {/* Últimas 10 operações */}
            <Card className="p-6 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h3 className="font-display text-xl font-semibold flex items-center gap-2">
                  <FileSearch className="w-5 h-5 text-primary" />
                  Últimas 10 operações
                </h3>
                <span className="text-xs text-muted-foreground">
                  {logs.length} registro{logs.length !== 1 ? "s" : ""}
                </span>
              </div>
              {loading ? (
                <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
              ) : logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem registros.</p>
              ) : (
                <div className="divide-y divide-border/50">
                  {logs.map((l) => <AuditLogRow key={l.id} log={l} />)}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="automation" className="mt-4">
            <AutomationTab />
          </TabsContent>

          <TabsContent value="feed" className="mt-4">
            <FeedTab />
          </TabsContent>

          <TabsContent value="system" className="mt-4">
            <SystemTab />
          </TabsContent>

          <TabsContent value="logs" className="mt-4">
            <LogsTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

/** Linha individual do log de auditoria — formata detalhes específicos por tipo. */
function AuditLogRow({ log }: { log: AuditRow }) {
  const d = log.details ?? {};
  const isImport = log.process === "import-books-by-isbn" && log.action === "import";
  const isNotFound = log.action === "not-found";
  const summary = (() => {
    if (isImport) {
      const parts: string[] = [];
      if (d.inserted != null) parts.push(`${d.inserted} novos`);
      if (d.already_existed != null) parts.push(`${d.already_existed} existiam`);
      if (d.not_found_external) parts.push(`${d.not_found_external} não encontrados`);
      if (d.invalid) parts.push(`${d.invalid} inválidos`);
      if (d.avg_quality_score) parts.push(`qualidade ${d.avg_quality_score}/100`);
      return parts.join(" · ");
    }
    if (isNotFound && d.isbn) {
      return `ISBN ${d.isbn} · fontes: ${(d.sources_tried || []).join(", ")}`;
    }
    return JSON.stringify(d).slice(0, 180);
  })();
  const tone =
    isNotFound ? "text-warning border-warning/40" :
    isImport && d.inserted > 0 ? "text-success border-success/40" :
    "";
  return (
    <div className="py-2.5 flex items-start justify-between gap-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={`text-[10px] ${tone}`}>{log.process}</Badge>
          <span className="text-muted-foreground text-xs">{log.action}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{summary}</p>
      </div>
      <span className="text-[11px] text-muted-foreground shrink-0 whitespace-nowrap">
        {new Date(log.created_at).toLocaleString("pt-BR", {
          day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
        })}
      </span>
    </div>
  );
}

function StatCard({
  icon, label, value, loading, highlight,
}: { icon: React.ReactNode; label: string; value?: number; loading: boolean; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border ${highlight ? "border-primary/40 bg-primary/5" : "border-border/50 bg-muted/20"} p-3`}>
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">{icon} {label}</div>
      <div className="font-display text-2xl font-bold">
        {loading ? <Skeleton className="h-7 w-16" /> : (value ?? 0).toLocaleString("pt-BR")}
      </div>
    </div>
  );
}

function ResultPill({
  label, value, variant,
}: { label: string; value: number | string; variant?: "success" | "warn" | "muted" }) {
  const cls =
    variant === "success" ? "text-success" :
    variant === "warn" ? "text-warning" :
    variant === "muted" ? "text-muted-foreground" : "";
  return (
    <div className="rounded-lg bg-background/50 px-3 py-2 border border-border/40">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-bold text-lg ${cls}`}>{value ?? 0}</div>
    </div>
  );
}

function CsrfBadge({
  token, expiresAt, loading, error, onRotate,
}: {
  token: string | null;
  expiresAt: number | null;
  loading: boolean;
  error: string | null;
  onRotate: () => void | Promise<void>;
}) {
  const [rotating, setRotating] = useState(false);
  const now = Date.now();
  const valid = !!token && !!expiresAt && expiresAt > now;
  const minsLeft = expiresAt ? Math.max(0, Math.round((expiresAt - now) / 60000)) : 0;
  const busy = loading || rotating;

  const handleRotate = async () => {
    if (busy) return;
    setRotating(true);
    try {
      await onRotate();
    } finally {
      setRotating(false);
    }
  };

  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
        error
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : valid
            ? "border-success/40 bg-success/10 text-success"
            : "border-warning/40 bg-warning/10 text-warning"
      }`}
      title={
        error
          ? `Erro: ${error}`
          : valid
            ? `Token CSRF ativo · expira em ~${minsLeft} min`
            : "Sem token CSRF — operações bloqueadas"
      }
    >
      {rotating ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : error ? (
        <ShieldAlert className="w-3.5 h-3.5" />
      ) : valid ? (
        <ShieldCheck className="w-3.5 h-3.5" />
      ) : (
        <Shield className="w-3.5 h-3.5" />
      )}
      <span className="font-medium">
        {rotating
          ? "Rotacionando…"
          : loading
            ? "Token CSRF…"
            : error
              ? "CSRF falhou"
              : valid
                ? `CSRF ativo (${minsLeft}m)`
                : "CSRF inativo"}
      </span>
      <button
        type="button"
        onClick={handleRotate}
        className="opacity-70 hover:opacity-100 underline disabled:opacity-40 disabled:no-underline"
        disabled={busy}
      >
        {rotating ? "aguarde…" : "rotacionar"}
      </button>
    </div>
  );
}
