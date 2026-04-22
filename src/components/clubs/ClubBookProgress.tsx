import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, CheckCircle2, TrendingUp, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface ProgressRow {
  book_id: string | null;
  page_count: number | null;
  total_members: number;
  reading_count: number;
  finished_count: number;
  avg_progress: number | null;
  total_pages_read: number;
}

interface Props {
  clubId: string;
  bookTitle?: string;
  /** Versão compacta para o header da aba Livro. */
  compact?: boolean;
  className?: string;
}

/** Barra de progresso coletivo dos membros sobre o livro do mês. */
export function ClubBookProgress({ clubId, bookTitle, compact, className }: Props) {
  const [data, setData] = useState<ProgressRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data: rows } = await supabase.rpc("club_book_progress", { _club_id: clubId });
      if (!cancelled) {
        setData((rows as ProgressRow[] | null)?.[0] ?? null);
        setLoading(false);
      }
    };
    load();

    // Realtime: invalida ao detectar mudanças nos progressos dos membros
    const ch = supabase
      .channel(`club-progress:${clubId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_books" },
        () => load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [clubId]);

  if (loading) {
    return (
      <div className={cn("glass rounded-2xl p-4 flex items-center justify-center", className)}>
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
      </div>
    );
  }

  if (!data?.book_id) return null;

  const pct = data.avg_progress ?? 0;
  const hasPageCount = !!data.page_count && data.page_count > 0;

  return (
    <div className={cn("glass rounded-2xl p-4", className)}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <TrendingUp className="w-4 h-4 text-primary shrink-0" />
          <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground truncate">
            Progresso do grupo
          </p>
        </div>
        <span className="text-sm font-bold tabular-nums text-primary">
          {hasPageCount ? `${pct.toFixed(0)}%` : `${data.reading_count}/${data.total_members}`}
        </span>
      </div>

      {hasPageCount ? (
        <Progress value={Math.min(100, pct)} className="h-2 mb-3" />
      ) : (
        <p className="text-xs text-muted-foreground italic mb-3">
          Sem total de páginas — exibindo contagem de leitores.
        </p>
      )}

      {!compact && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat
            icon={<BookOpen className="w-3.5 h-3.5" />}
            label="Lendo"
            value={data.reading_count}
            tone="primary"
          />
          <Stat
            icon={<CheckCircle2 className="w-3.5 h-3.5" />}
            label="Terminaram"
            value={data.finished_count}
            tone="success"
          />
          <Stat
            label="Páginas"
            value={data.total_pages_read}
            tone="muted"
          />
        </div>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  tone: "primary" | "success" | "muted";
}) {
  const toneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "success"
        ? "text-emerald-500"
        : "text-foreground";
  return (
    <div className="bg-card/40 rounded-lg py-2 px-1.5 border border-border/40">
      <div className={cn("inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider", toneClass)}>
        {icon}
        {label}
      </div>
      <div className="text-base font-bold tabular-nums mt-0.5">{value.toLocaleString("pt-BR")}</div>
    </div>
  );
}
