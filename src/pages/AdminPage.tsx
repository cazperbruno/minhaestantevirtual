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
import {
  Shield, Users, BookOpen, Activity, Loader2, Database, Download,
  ListChecks, BarChart3, RefreshCw, FileSearch, ShieldCheck, ShieldAlert,
} from "lucide-react";

interface Stats {
  users: number;
  books: number;
  activities: number;
  books_last_24h: number;
  books_last_7d: number;
  enrichment_pending: number;
}

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
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Import-by-ISBN state
  const [isbnInput, setIsbnInput] = useState("");
  const [language, setLanguage] = useState<string>("any");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [importResult, setImportResult] = useState<any>(null);

  const loadStats = async () => {
    setLoading(true);
    try {
      const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const [usersR, booksR, actsR, b24R, b7R, enrichR, logsR] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("books").select("id", { count: "exact", head: true }),
        supabase.from("activities").select("id", { count: "exact", head: true }),
        supabase.from("books").select("id", { count: "exact", head: true }).gte("created_at", since24h),
        supabase.from("books").select("id", { count: "exact", head: true }).gte("created_at", since7d),
        supabase.from("enrichment_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("book_audit_log").select("id, process, action, created_at, details").order("created_at", { ascending: false }).limit(20),
      ]);
      setStats({
        users: usersR.count ?? 0,
        books: booksR.count ?? 0,
        activities: actsR.count ?? 0,
        books_last_24h: b24R.count ?? 0,
        books_last_7d: b7R.count ?? 0,
        enrichment_pending: enrichR.count ?? 0,
      });
      setLogs((logsR.data as AuditRow[]) || []);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao carregar estatísticas");
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
  const parseIsbns = (raw: string): string[] => {
    return raw
      .split(/[\s,;\n\r]+/)
      .map((s) => s.replace(/[^0-9Xx]/g, ""))
      .filter((s) => s.length === 10 || s.length === 13);
  };

  const runIsbnImport = async () => {
    const all = parseIsbns(isbnInput);
    if (all.length === 0) {
      toast.error("Cole pelo menos um ISBN válido (10 ou 13 dígitos).");
      return;
    }
    setImporting(true);
    setImportResult(null);
    setProgress({ done: 0, total: all.length });
    const aggregated = {
      received: 0, invalid: 0, already_existed: 0,
      not_found_external: 0, inserted: 0, enqueued_for_enrichment: 0,
      errors: [] as string[],
    };
    try {
      const csrfToken = await csrf.ensureToken();
      if (!csrfToken) {
        toast.error("Não foi possível obter o token de segurança. Recarregue a página.");
        return;
      }
      // batches de 50 ISBNs (a função aceita até 100, mas 50 é mais responsivo)
      for (let i = 0; i < all.length; i += 50) {
        const chunk = all.slice(i, i + 50);
        const { data, error } = await invokeAdmin("import-books-by-isbn", {
          csrfToken,
          body: {
            isbns: chunk,
            language: language === "any" ? null : language,
          },
        });
        if (error) throw error;
        const d: any = data ?? {};
        aggregated.received += d.received ?? 0;
        aggregated.invalid += d.invalid ?? 0;
        aggregated.already_existed += d.already_existed ?? 0;
        aggregated.not_found_external += d.not_found_external ?? 0;
        aggregated.inserted += d.inserted ?? 0;
        aggregated.enqueued_for_enrichment += d.enqueued_for_enrichment ?? 0;
        if (d.errors?.length) aggregated.errors.push(...d.errors);
        setProgress({ done: Math.min(i + chunk.length, all.length), total: all.length });
      }
      setImportResult(aggregated);
      toast.success(
        `Importação: ${aggregated.inserted} novos · ${aggregated.already_existed} já existiam · ${aggregated.not_found_external} não encontrados`,
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
          <Button variant="outline" onClick={loadStats} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </header>

        {/* Stats */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard icon={<Users className="w-4 h-4" />} label="Usuários" value={stats?.users} loading={loading} />
          <StatCard icon={<BookOpen className="w-4 h-4" />} label="Livros" value={stats?.books} loading={loading} />
          <StatCard icon={<Activity className="w-4 h-4" />} label="Atividades" value={stats?.activities} loading={loading} />
          <StatCard icon={<BarChart3 className="w-4 h-4" />} label="Livros 24h" value={stats?.books_last_24h} loading={loading} highlight />
          <StatCard icon={<BarChart3 className="w-4 h-4" />} label="Livros 7d" value={stats?.books_last_7d} loading={loading} />
          <StatCard icon={<ListChecks className="w-4 h-4" />} label="Enrich pendente" value={stats?.enrichment_pending} loading={loading} />
        </section>

        {/* Catalog quality (já existente, gated) */}
        <CatalogQualityPanel />

        {/* Progresso em tempo real da fila de enriquecimento */}
        <EnrichmentProgressPanel />

        {/* Importação por ISBN */}
        <Card className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="font-display text-xl font-semibold flex items-center gap-2">
                <Download className="w-5 h-5 text-primary" />
                Importar livros por lista de ISBN
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Cole ISBNs (10 ou 13 dígitos), um por linha ou separados por vírgula. Processa em lotes de 50.
                Verifica banco interno antes de chamar APIs externas.
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
              <p className="text-xs text-muted-foreground mt-1">
                {parseIsbns(isbnInput).length} ISBNs válidos detectados
              </p>
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
            <div className="rounded-xl border border-border/50 bg-muted/30 p-4 space-y-2">
              <p className="text-sm font-semibold">Resultado da importação</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                <ResultPill label="Recebidos" value={importResult.received} />
                <ResultPill label="Inválidos" value={importResult.invalid} variant="warn" />
                <ResultPill label="Já existiam" value={importResult.already_existed} variant="muted" />
                <ResultPill label="Não encontrados" value={importResult.not_found_external} variant="warn" />
                <ResultPill label="Inseridos ✓" value={importResult.inserted} variant="success" />
                <ResultPill label="Na fila enrich" value={importResult.enqueued_for_enrichment} variant="success" />
              </div>
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

        {/* Operações de sistema */}
        <Card className="p-6 space-y-4">
          <h3 className="font-display text-xl font-semibold flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            Operações do sistema
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
            <Button variant="outline" size="sm" onClick={() => runFn("process-enrichment-queue", "Processar enrich")}>
              Processar fila enrich
            </Button>
            <Button variant="outline" size="sm" onClick={() => runFn("process-normalization-queue", "Processar normalize")}>
              Processar fila normalize
            </Button>
            <Button variant="outline" size="sm" onClick={() => runFn("backfill-series", "Reprocessar séries")}>
              Reprocessar séries
            </Button>
            <Button variant="outline" size="sm" onClick={() => runFn("fix-book-covers", "Corrigir capas", { limit: 100 })}>
              Corrigir capas
            </Button>
          </div>
        </Card>

        {/* Logs */}
        <Card className="p-6 space-y-3">
          <h3 className="font-display text-xl font-semibold flex items-center gap-2">
            <FileSearch className="w-5 h-5 text-primary" />
            Últimas operações
          </h3>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem registros.</p>
          ) : (
            <div className="divide-y divide-border/50">
              {logs.map((l) => (
                <div key={l.id} className="py-2 flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary">{l.process}</Badge>
                      <span className="text-muted-foreground text-xs">{l.action}</span>
                    </div>
                    {l.details && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {JSON.stringify(l.details).slice(0, 180)}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(l.created_at).toLocaleString("pt-BR")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
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
}: { label: string; value: number; variant?: "success" | "warn" | "muted" }) {
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
