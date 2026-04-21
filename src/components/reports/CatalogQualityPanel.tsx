import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Database, Sparkles, Loader2, RefreshCw, BookOpen, Image, FileText, Tag, Wand2, GitMerge, Brush, Zap, Download, ShieldCheck } from "lucide-react";

interface Quality {
  total_books: number;
  with_isbn13: number;
  with_cover: number;
  with_rich_desc: number;
  with_categories: number;
  with_pages: number;
  with_series: number;
  avg_quality_score: number;
  poor_quality_count: number;
}

interface QueueStat {
  status: string;
  count: number;
}

export function CatalogQualityPanel() {
  const [quality, setQuality] = useState<Quality | null>(null);
  const [enrichQueue, setEnrichQueue] = useState<QueueStat[]>([]);
  const [normQueue, setNormQueue] = useState<QueueStat[]>([]);
  const [mergeSuggestions, setMergeSuggestions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [draining, setDraining] = useState<null | "enrich" | "normalize" | "clean" | "clean-aggressive" | "seed" | "isbn">(null);

  const aggregate = (rows: any[] | null): QueueStat[] => {
    if (!rows) return [];
    const map = new Map<string, number>();
    rows.forEach((r: any) => map.set(r.status, (map.get(r.status) ?? 0) + 1));
    return Array.from(map, ([status, count]) => ({ status, count }));
  };

  const load = async () => {
    setLoading(true);
    const [{ data: q }, eq, nq, ms] = await Promise.all([
      (supabase.from("books_quality_report" as any).select("*").maybeSingle() as any),
      supabase.from("enrichment_queue").select("status"),
      supabase.from("metadata_normalization_queue" as any).select("status") as any,
      supabase.from("merge_suggestions" as any).select("id", { count: "exact", head: true }).eq("status", "pending") as any,
    ]);
    setQuality(q as Quality | null);
    setEnrichQueue(aggregate(eq.data));
    setNormQueue(aggregate(nq.data));
    setMergeSuggestions((ms as any)?.count ?? 0);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const drain = async (kind: "enrich" | "normalize") => {
    setDraining(kind);
    try {
      const fn = kind === "enrich" ? "process-enrichment-queue" : "process-normalization-queue";
      const { data, error } = await supabase.functions.invoke(fn);
      if (error) throw error;
      toast.success(`Processados ${data?.processed ?? 0} (${data?.success ?? 0} OK, ${data?.skipped ?? 0} pulados, ${data?.failed ?? 0} falhas)`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao processar fila");
    } finally {
      setDraining(null);
    }
  };

  const runClean = async (mode: "auto" | "aggressive") => {
    setDraining(mode === "aggressive" ? "clean-aggressive" : "clean");
    try {
      const { data, error } = await supabase.functions.invoke("clean-book-database", {
        body: { mode, limit: mode === "aggressive" ? 500 : 200 },
      });
      if (error) throw error;
      const d: any = data ?? {};
      toast.success(
        `Limpos ${d.picked ?? 0} livros · padronizou ${d.standardized ?? 0} · ` +
        `+${d.enqueued_normalization ?? 0} norm · +${d.enqueued_enrichment ?? 0} enrich · ` +
        `${d.duplicate_suggestions_created ?? 0} duplicatas (score ${d.avg_score_before}→${d.avg_score_after})`,
      );
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao limpar catálogo");
    } finally {
      setDraining(null);
    }
  };

  const runSeed = async () => {
    setDraining("seed");
    try {
      const { data, error } = await supabase.functions.invoke("seed-book-database", {
        body: { mode: "mixed", limit: 200 },
      });
      if (error) throw error;
      const d: any = data ?? {};
      const v = d.isbn_validation;
      const isbnNote = v
        ? ` · ISBN: ${v.updated ?? 0} corrigidos, ${v.invalid_dropped ?? 0} inválidos`
        : "";
      toast.success(
        `Importou ${d.inserted ?? 0} livros novos · ${d.already_existed ?? 0} já existiam · ` +
        `${d.enqueued_for_enrichment ?? 0} na fila de enriquecimento${isbnNote}`,
      );
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao importar");
    } finally {
      setDraining(null);
    }
  };

  const runValidateIsbns = async () => {
    setDraining("isbn");
    try {
      const { data, error } = await supabase.functions.invoke("validate-isbns", {
        body: { mode: "recent", limit: 1000 },
      });
      if (error) throw error;
      const d: any = data ?? {};
      toast.success(
        `Verificou ${d.checked ?? 0} livros · ${d.updated ?? 0} corrigidos · ` +
        `${d.invalid_dropped ?? 0} inválidos limpos · ${d.derived_pair ?? 0} pares derivados · ` +
        `${d.duplicate_conflict_suggested ?? 0} duplicatas sugeridas`,
      );
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao validar ISBNs");
    } finally {
      setDraining(null);
    }
  };

  if (loading) {
    return (
      <Card className="p-6 space-y-4">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      </Card>
    );
  }

  if (!quality) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Sem dados de qualidade ainda.</p>
      </Card>
    );
  }

  const total = quality.total_books || 1;
  const pct = (n: number) => Math.round((n / total) * 100);
  const enrichPending = enrichQueue.find((q) => q.status === "pending")?.count ?? 0;
  const enrichFailed = enrichQueue.find((q) => q.status === "failed")?.count ?? 0;
  const normPending = normQueue.find((q) => q.status === "pending")?.count ?? 0;
  const normFailed = normQueue.find((q) => q.status === "failed")?.count ?? 0;

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-display text-xl font-semibold flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            Qualidade do catálogo
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {quality.total_books} livros · nota média{" "}
            <span className="font-semibold text-foreground">{quality.avg_quality_score}</span>/100
            <span className="ml-2 text-xs">· limpeza diária 03:15 UTC · filas a cada 5/10 min</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={load} aria-label="Atualizar">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={runSeed}
            disabled={draining !== null}
            className="gap-2"
            title="Importa 200 livros públicos novos do OpenLibrary (idempotente). Roda validação de ISBN automaticamente."
          >
            {draining === "seed" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Importar lote
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={runValidateIsbns}
            disabled={draining !== null}
            className="gap-2"
            title="Valida ISBN-10/13 com checksum, deriva pares, limpa inválidos e propõe merge para duplicatas"
          >
            {draining === "isbn" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Validar ISBNs
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => runClean("auto")}
            disabled={draining !== null}
            className="gap-2"
            title="Padroniza, detecta duplicatas, enfileira IA e corrige capas dos 200 piores"
          >
            {draining === "clean" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brush className="w-4 h-4" />}
            Limpar agora
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => runClean("aggressive")}
            disabled={draining !== null}
            className="gap-2"
            title="Limpeza agressiva: 500 piores, IA + capas com fallback"
          >
            {draining === "clean-aggressive" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Agressivo
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => drain("normalize")}
            disabled={draining !== null || normPending === 0}
            className="gap-2"
          >
            {draining === "normalize" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            Normalizar IA ({normPending})
          </Button>
          <Button
            size="sm"
            onClick={() => drain("enrich")}
            disabled={draining !== null || enrichPending === 0}
            className="gap-2"
          >
            {draining === "enrich" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Enriquecer ({enrichPending})
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric icon={<Tag className="w-4 h-4" />} label="Com ISBN-13" value={pct(quality.with_isbn13)} suffix="%" />
        <Metric icon={<Image className="w-4 h-4" />} label="Com capa" value={pct(quality.with_cover)} suffix="%" />
        <Metric icon={<FileText className="w-4 h-4" />} label="Descrição rica" value={pct(quality.with_rich_desc)} suffix="%" />
        <Metric icon={<BookOpen className="w-4 h-4" />} label="Com categorias" value={pct(quality.with_categories)} suffix="%" />
      </div>

      <div className="flex flex-wrap gap-2 text-xs pt-2 border-t border-border/50">
        {enrichPending > 0 && <Badge variant="secondary"><Sparkles className="w-3 h-3 mr-1" />{enrichPending} a enriquecer</Badge>}
        {enrichFailed > 0 && <Badge variant="destructive">{enrichFailed} enrich falhou</Badge>}
        {normPending > 0 && <Badge variant="secondary"><Wand2 className="w-3 h-3 mr-1" />{normPending} a normalizar</Badge>}
        {normFailed > 0 && <Badge variant="destructive">{normFailed} norm falhou</Badge>}
        {mergeSuggestions > 0 && (
          <Badge variant="outline" className="text-primary">
            <GitMerge className="w-3 h-3 mr-1" />{mergeSuggestions} duplicatas sugeridas
          </Badge>
        )}
        {quality.poor_quality_count > 0 && (
          <Badge variant="outline" className="text-warning">
            {quality.poor_quality_count} com qualidade &lt;50
          </Badge>
        )}
        {enrichPending + normPending + mergeSuggestions === 0 && (
          <Badge variant="outline" className="text-success">Catálogo saudável ✓</Badge>
        )}
      </div>
    </Card>
  );
}

function Metric({ icon, label, value, suffix }: { icon: React.ReactNode; label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-xl bg-muted/30 border border-border/50 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
        {icon} {label}
      </div>
      <div className="font-display text-2xl font-bold">
        {value}
        {suffix && <span className="text-sm font-normal text-muted-foreground ml-0.5">{suffix}</span>}
      </div>
    </div>
  );
}
