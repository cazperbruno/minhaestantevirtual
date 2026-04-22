import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { FileSearch, Loader2, RefreshCw } from "lucide-react";

interface AuditRow {
  id: string;
  process: string;
  action: string;
  created_at: string;
  details: any;
}

const RANGES: { value: string; label: string; ms: number | null }[] = [
  { value: "1h", label: "Última hora", ms: 3600_000 },
  { value: "24h", label: "Últimas 24h", ms: 86_400_000 },
  { value: "7d", label: "Últimos 7 dias", ms: 7 * 86_400_000 },
  { value: "all", label: "Tudo", ms: null },
];

/**
 * Aba Logs — audit log do banco com filtros por processo, ação, período e busca.
 */
export function LogsTab() {
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [process, setProcess] = useState<string>("all");
  const [range, setRange] = useState<string>("24h");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(50);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("book_audit_log")
      .select("id, process, action, created_at, details")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (process !== "all") q = q.eq("process", process);
    const r = RANGES.find((x) => x.value === range);
    if (r?.ms) {
      q = q.gte("created_at", new Date(Date.now() - r.ms).toISOString());
    }
    const { data, error } = await q;
    if (!error) setLogs(((data as AuditRow[]) || []));
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [process, range, limit]);

  const processes = useMemo(() => {
    const set = new Set<string>(logs.map((l) => l.process));
    return Array.from(set).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    if (!search.trim()) return logs;
    const s = search.trim().toLowerCase();
    return logs.filter((l) =>
      l.action.toLowerCase().includes(s) ||
      l.process.toLowerCase().includes(s) ||
      JSON.stringify(l.details ?? {}).toLowerCase().includes(s)
    );
  }, [logs, search]);

  return (
    <div className="space-y-5">
      <h2 className="font-display text-2xl font-bold flex items-center gap-2">
        <FileSearch className="w-5 h-5 text-primary" />
        Logs do sistema
      </h2>

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <Select value={process} onValueChange={setProcess}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os processos</SelectItem>
              {processes.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar texto…"
          />
          <Button variant="outline" onClick={load} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Atualizar
          </Button>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{filtered.length} de {logs.length} registros</span>
          <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
            <SelectTrigger className="w-24 h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="200">200</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Sem logs no filtro atual.</p>
        ) : (
          <ul className="divide-y divide-border/40 max-h-[60vh] overflow-y-auto">
            {filtered.map((l) => <LogRow key={l.id} log={l} />)}
          </ul>
        )}
      </Card>
    </div>
  );
}

function LogRow({ log }: { log: AuditRow }) {
  const d = log.details ?? {};
  const isError = log.action === "not-found" || log.action === "failed" || log.action === "error";
  const isImport = log.process === "import-books-by-isbn" && log.action === "import";
  const summary = (() => {
    if (isImport && d.inserted != null) {
      return `${d.inserted} novos · ${d.already_existed ?? 0} existiam · ${d.not_found_external ?? 0} não encontrados · qualidade ${d.avg_quality_score ?? "—"}/100`;
    }
    if (log.action === "not-found" && d.isbn) {
      return `ISBN ${d.isbn} · fontes: ${(d.sources_tried || []).join(", ")}`;
    }
    return JSON.stringify(d).slice(0, 200);
  })();
  return (
    <li className="p-3 hover:bg-muted/10 transition-colors">
      <div className="flex items-start justify-between gap-3 text-sm">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={`text-[10px] ${
                isError ? "text-warning border-warning/40" :
                isImport && d.inserted > 0 ? "text-success border-success/40" : ""
              }`}
            >
              {log.process}
            </Badge>
            <span className="text-muted-foreground text-xs">{log.action}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 font-mono">{summary}</p>
        </div>
        <span className="text-[11px] text-muted-foreground shrink-0 whitespace-nowrap font-mono">
          {new Date(log.created_at).toLocaleString("pt-BR", {
            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
          })}
        </span>
      </div>
    </li>
  );
}
