import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, TrendingUp, Activity, Calendar, Layers } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CohortRow {
  cohort_week: string;
  cohort_size: number;
  d1_returned: number;
  d7_returned: number;
  d30_returned: number;
  d1_pct: number | null;
  d7_pct: number | null;
  d30_pct: number | null;
}

interface EngagementSnapshot {
  dau: number;
  wau: number;
  mau: number;
  sticky_pct: number | null;
}

interface DepthRow {
  event: string;
  unique_users: number;
  total_events: number;
  avg_per_user: number | null;
}

const DEPTH_LABELS: Record<string, string> = {
  book_opened: "Livro aberto",
  reading_session_logged: "Sessão de leitura",
  review_shared: "Resenha compartilhada",
  feed_scrolled_deep: "Feed explorado",
  shelf_explored: "Prateleira aberta",
  surprise_box_opened: "Caixa surpresa aberta",
  league_viewed: "Liga visualizada",
};

/** Cor da célula segundo a % de retenção. */
function pctColor(pct: number | null) {
  if (pct == null) return "text-muted-foreground";
  if (pct >= 60) return "text-emerald-500 font-bold";
  if (pct >= 30) return "text-sky-500 font-semibold";
  if (pct >= 15) return "text-amber-500";
  return "text-rose-500";
}

export function RetentionCohortPanel() {
  const { data: cohorts, isLoading: lc } = useQuery<CohortRow[]>({
    queryKey: ["cohort-retention", 8],
    queryFn: async () => {
      const { data } = await supabase.rpc("cohort_retention", { _weeks_back: 8 });
      return (data as CohortRow[]) || [];
    },
    staleTime: 5 * 60_000,
  });

  const { data: snapshot, isLoading: ls } = useQuery<EngagementSnapshot>({
    queryKey: ["engagement-snapshot"],
    queryFn: async () => {
      const { data } = await supabase.rpc("engagement_snapshot");
      const row = (data as any[])?.[0];
      return row ?? { dau: 0, wau: 0, mau: 0, sticky_pct: null };
    },
    staleTime: 5 * 60_000,
  });

  const { data: depth, isLoading: ld } = useQuery<DepthRow[]>({
    queryKey: ["engagement-depth", 14],
    queryFn: async () => {
      const { data } = await supabase.rpc("engagement_depth_summary", { _days: 14 });
      return (data as DepthRow[]) || [];
    },
    staleTime: 5 * 60_000,
  });

  return (
    <Card className="p-5 space-y-5">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-primary" />
        <h3 className="font-display font-bold text-lg">Retenção & Engajamento</h3>
      </div>

      {/* DAU/WAU/MAU snapshot */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SnapshotCard icon={Activity} label="DAU"  value={snapshot?.dau} loading={ls} />
        <SnapshotCard icon={Calendar} label="WAU" value={snapshot?.wau} loading={ls} />
        <SnapshotCard icon={Users}    label="MAU" value={snapshot?.mau} loading={ls} />
        <SnapshotCard
          icon={TrendingUp}
          label="Sticky"
          value={snapshot?.sticky_pct != null ? `${snapshot.sticky_pct}%` : "—"}
          loading={ls}
          hint="DAU/MAU"
        />
      </div>

      {/* Cohort table */}
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          Coorte semanal · % que voltou
        </p>
        {lc ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !cohorts || cohorts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Sem dados de coorte ainda. Aguarde mais cadastros para visualizar tendências.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="text-left py-2 px-2 font-medium">Semana</th>
                  <th className="text-right py-2 px-2 font-medium">Novos</th>
                  <th className="text-right py-2 px-2 font-medium">D1</th>
                  <th className="text-right py-2 px-2 font-medium">D7</th>
                  <th className="text-right py-2 px-2 font-medium">D30</th>
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c) => (
                  <tr key={c.cohort_week} className="border-b border-border/30">
                    <td className="py-2 px-2 font-medium">
                      {format(new Date(c.cohort_week), "dd MMM", { locale: ptBR })}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">{c.cohort_size}</td>
                    <td className={`py-2 px-2 text-right tabular-nums ${pctColor(c.d1_pct)}`}>
                      {c.d1_pct != null ? `${c.d1_pct}%` : "—"}
                    </td>
                    <td className={`py-2 px-2 text-right tabular-nums ${pctColor(c.d7_pct)}`}>
                      {c.d7_pct != null ? `${c.d7_pct}%` : "—"}
                    </td>
                    <td className={`py-2 px-2 text-right tabular-nums ${pctColor(c.d30_pct)}`}>
                      {c.d30_pct != null ? `${c.d30_pct}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-muted-foreground mt-2">
              Retenção = % de usuários que voltaram a interagir com livros após o cadastro.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

function SnapshotCard({
  icon: Icon,
  label,
  value,
  loading,
  hint,
}: {
  icon: typeof Activity;
  label: string;
  value: number | string | undefined;
  loading: boolean;
  hint?: string;
}) {
  return (
    <div className="rounded-xl bg-muted/30 border border-border/50 p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="font-display text-2xl font-bold mt-1 tabular-nums">
        {loading ? <Skeleton className="h-7 w-12" /> : (value ?? "—")}
      </div>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}
