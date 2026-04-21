/**
 * useEnrichSeries — chama a edge function enrich-series para que IA/AniList
 * busquem metadados oficiais (volumes totais, status, sinopse, capa).
 *
 * Aprende globalmente: o resultado é salvo em series_enrichment_cache
 * para que próximos usuários que adicionarem a mesma série recebam direto
 * do banco, sem chamadas externas.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { qk } from "@/lib/query-client";
import { toast } from "sonner";
import { trackEvent } from "@/lib/track";

interface EnrichResult {
  ok?: boolean;
  skipped?: boolean;
  reason?: string;
  from?: "cache" | "anilist" | "ai";
  series?: { id: string; title: string; total_volumes: number | null };
}

export function useEnrichSeries() {
  const qc = useQueryClient();
  return useMutation<EnrichResult, Error, { seriesId: string; force?: boolean; silent?: boolean }>({
    mutationFn: async ({ seriesId, force }) => {
      const t0 = performance.now();
      const { data, error } = await supabase.functions.invoke("enrich-series", {
        body: { series_id: seriesId, force: !!force },
      });
      trackEvent("enrich_series", {
        series_id: seriesId,
        success: !error,
        from: (data as any)?.from ?? null,
        latency_ms: Math.round(performance.now() - t0),
      });
      if (error) throw new Error(error.message || "Falha ao enriquecer série");
      return data as EnrichResult;
    },
    onSuccess: (res, vars) => {
      // Invalida queries dependentes
      qc.invalidateQueries({ queryKey: ["series", vars.seriesId] });
      qc.invalidateQueries({ queryKey: qk.mySeries() });
      qc.invalidateQueries({ queryKey: ["manage-series"] });
      qc.invalidateQueries({ queryKey: ["series-validation"] });

      if (vars.silent) return;
      if (res.skipped) {
        toast.info("Série já enriquecida recentemente.");
        return;
      }
      const from = res.from === "cache"
        ? "do banco compartilhado"
        : res.from === "anilist"
        ? "do AniList"
        : res.from === "ai"
        ? "da IA"
        : "";
      const total = res.series?.total_volumes;
      if (total) {
        toast.success(`Atualizado ${from}: ${total} volumes no total.`);
      } else {
        toast.warning("Não conseguimos confirmar o total de volumes.");
      }
    },
    onError: (err, vars) => {
      if (vars.silent) return;
      toast.error(err.message);
    },
  });
}
