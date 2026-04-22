import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Métricas globais do super admin: usuários, livros, atividade, crescimento semanal.
 *
 * Buscadas em paralelo (contagens HEAD são MUITO baratas no Postgres).
 * Polling padrão 30s — não invade o backend e mantém a sensação "real time"
 * para um painel administrativo.
 */
export interface AdminMetrics {
  // Usuários
  users_total: number;
  users_new_today: number;
  users_new_week: number;
  users_new_prev_week: number;
  dau: number;
  mau: number;
  // Conteúdo
  books_total: number;
  books_new_today: number;
  books_new_week: number;
  books_without_cover: number;
  books_low_quality: number; // score < 50
  books_avg_quality: number;
  // Social
  activities_total: number;
  activities_today: number;
  activities_last_hour: number;
  // Sistema
  enrichment_pending: number;
  enrichment_failed: number;
  normalization_pending: number;
  merge_suggestions: number;
  // Atualização
  fetched_at: number;
}

const ZERO_METRICS: AdminMetrics = {
  users_total: 0, users_new_today: 0, users_new_week: 0, users_new_prev_week: 0,
  dau: 0, mau: 0,
  books_total: 0, books_new_today: 0, books_new_week: 0, books_without_cover: 0,
  books_low_quality: 0, books_avg_quality: 0,
  activities_total: 0, activities_today: 0, activities_last_hour: 0,
  enrichment_pending: 0, enrichment_failed: 0, normalization_pending: 0,
  merge_suggestions: 0,
  fetched_at: 0,
};

const isoAgo = (ms: number) => new Date(Date.now() - ms).toISOString();

export function useAdminMetrics({ pollMs = 30_000, enabled = true } = {}) {
  const [metrics, setMetrics] = useState<AdminMetrics>(ZERO_METRICS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const inflight = useRef<Promise<void> | null>(null);

  const load = async (silent = false) => {
    if (inflight.current) return inflight.current;
    if (!silent) setRefreshing(true);
    const p = (async () => {
      try {
        const dayAgo = isoAgo(24 * 3600 * 1000);
        const weekAgo = isoAgo(7 * 24 * 3600 * 1000);
        const prevWeekStart = isoAgo(14 * 24 * 3600 * 1000);
        const monthAgo = isoAgo(30 * 24 * 3600 * 1000);
        const hourAgo = isoAgo(3600 * 1000);

        const head = (q: any) => q.select("id", { count: "exact", head: true });

        const [
          usersTotal, usersToday, usersWeek, usersPrevWeek,
          dauR, mauR,
          booksTotal, booksToday, booksWeek, booksNoCover, booksLowQ,
          actsTotal, actsToday, actsHour,
          enrichPending, enrichFailed, normPending, mergeSug,
          qualityAvg,
        ] = await Promise.all([
          head(supabase.from("profiles")),
          head(supabase.from("profiles").gte("created_at", dayAgo)),
          head(supabase.from("profiles").gte("created_at", weekAgo)),
          supabase.from("profiles").select("id", { count: "exact", head: true })
            .gte("created_at", prevWeekStart).lt("created_at", weekAgo),
          // DAU/MAU baseado em quem postou atividade no período (proxy honesto)
          supabase.from("activities").select("user_id").gte("created_at", dayAgo).limit(1000),
          supabase.from("activities").select("user_id").gte("created_at", monthAgo).limit(5000),
          head(supabase.from("books")),
          head(supabase.from("books").gte("created_at", dayAgo)),
          head(supabase.from("books").gte("created_at", weekAgo)),
          head(supabase.from("books").or("cover_url.is.null,cover_url.eq.")),
          head(supabase.from("books").lt("quality_score", 50)),
          head(supabase.from("activities")),
          head(supabase.from("activities").gte("created_at", dayAgo)),
          head(supabase.from("activities").gte("created_at", hourAgo)),
          head(supabase.from("enrichment_queue").eq("status", "pending")),
          head(supabase.from("enrichment_queue").eq("status", "failed")),
          head(supabase.from("metadata_normalization_queue" as any).eq("status", "pending")),
          head(supabase.from("merge_suggestions" as any).eq("status", "pending")),
          // Média de qualidade
          (supabase.from("books_quality_report" as any).select("avg_quality_score").maybeSingle() as any),
        ]);

        const dauSet = new Set<string>(((dauR.data as any[]) || []).map((r) => r.user_id));
        const mauSet = new Set<string>(((mauR.data as any[]) || []).map((r) => r.user_id));

        setMetrics({
          users_total: usersTotal.count ?? 0,
          users_new_today: usersToday.count ?? 0,
          users_new_week: usersWeek.count ?? 0,
          users_new_prev_week: usersPrevWeek.count ?? 0,
          dau: dauSet.size,
          mau: mauSet.size,
          books_total: booksTotal.count ?? 0,
          books_new_today: booksToday.count ?? 0,
          books_new_week: booksWeek.count ?? 0,
          books_without_cover: booksNoCover.count ?? 0,
          books_low_quality: booksLowQ.count ?? 0,
          books_avg_quality: (qualityAvg as any)?.data?.avg_quality_score ?? 0,
          activities_total: actsTotal.count ?? 0,
          activities_today: actsToday.count ?? 0,
          activities_last_hour: actsHour.count ?? 0,
          enrichment_pending: enrichPending.count ?? 0,
          enrichment_failed: enrichFailed.count ?? 0,
          normalization_pending: normPending.count ?? 0,
          merge_suggestions: mergeSug.count ?? 0,
          fetched_at: Date.now(),
        });
        setError(null);
      } catch (e: any) {
        setError(e?.message ?? "Falha ao carregar métricas");
      } finally {
        setLoading(false);
        setRefreshing(false);
        inflight.current = null;
      }
    })();
    inflight.current = p;
    return p;
  };

  useEffect(() => {
    if (!enabled) return;
    void load(true);
    if (!pollMs) return;
    const t = setInterval(() => void load(true), pollMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pollMs]);

  return { metrics, loading, refreshing, error, refresh: () => load(false) };
}
