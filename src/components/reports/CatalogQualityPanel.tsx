import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Database, Sparkles, Loader2, RefreshCw, BookOpen, Image, FileText, Tag } from "lucide-react";

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
  const [queue, setQueue] = useState<QueueStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [draining, setDraining] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: q }, { data: qq }] = await Promise.all([
      (supabase.from("books_quality_report" as any).select("*").maybeSingle() as any),
      supabase
        .from("enrichment_queue")
        .select("status")
        .then((res) => {
          if (!res.data) return { data: [] as QueueStat[] };
          const map = new Map<string, number>();
          res.data.forEach((r: any) => map.set(r.status, (map.get(r.status) ?? 0) + 1));
          return { data: Array.from(map, ([status, count]) => ({ status, count })) };
        }),
    ]);
    setQuality(q as Quality | null);
    setQueue(qq);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const drainQueue = async () => {
    setDraining(true);
    try {
      const { data, error } = await supabase.functions.invoke("process-enrichment-queue");
      if (error) throw error;
      toast.success(`Processados ${data?.processed ?? 0} livros (${data?.success ?? 0} OK, ${data?.skipped ?? 0} pulados, ${data?.failed ?? 0} falhas)`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao processar fila");
    } finally {
      setDraining(false);
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
  const pendingCount = queue.find((q) => q.status === "pending")?.count ?? 0;
  const failedCount = queue.find((q) => q.status === "failed")?.count ?? 0;

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
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={load} aria-label="Atualizar">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            onClick={drainQueue}
            disabled={draining || pendingCount === 0}
            className="gap-2"
          >
            {draining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {draining ? "Processando…" : `Enriquecer agora (${pendingCount})`}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric icon={<Tag className="w-4 h-4" />} label="Com ISBN-13" value={pct(quality.with_isbn13)} suffix="%" />
        <Metric icon={<Image className="w-4 h-4" />} label="Com capa" value={pct(quality.with_cover)} suffix="%" />
        <Metric icon={<FileText className="w-4 h-4" />} label="Descrição rica" value={pct(quality.with_rich_desc)} suffix="%" />
        <Metric icon={<BookOpen className="w-4 h-4" />} label="Com categorias" value={pct(quality.with_categories)} suffix="%" />
      </div>

      {(pendingCount > 0 || failedCount > 0) && (
        <div className="flex flex-wrap gap-2 text-xs pt-2 border-t border-border/50">
          {pendingCount > 0 && <Badge variant="secondary">{pendingCount} aguardando</Badge>}
          {failedCount > 0 && <Badge variant="destructive">{failedCount} falharam</Badge>}
          {quality.poor_quality_count > 0 && (
            <Badge variant="outline" className="text-warning">
              {quality.poor_quality_count} com qualidade &lt;50
            </Badge>
          )}
        </div>
      )}
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
