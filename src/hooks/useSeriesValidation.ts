/**
 * useSeriesValidation — diagnóstico de integridade das séries.
 *
 * Executa a função SQL `validate_series_integrity()` que retorna apenas
 * séries com algum tipo de inconsistência:
 *  - lacunas: faltam volumes na sequência 1..total
 *  - duplicados: mesmo volume_number em mais de um livro
 *  - sem número: livros vinculados sem volume_number definido
 *
 * Além de listar, expõe `repair` para corrigir numeração de uma série
 * automaticamente (preenche lacunas com livros sem volume).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CACHE } from "@/lib/query-client";
import { toast } from "sonner";

export interface SeriesIntegrityRow {
  series_id: string;
  series_title: string;
  content_type: string;
  total_volumes: number | null;
  books_count: number;
  numbered_count: number;
  unnumbered_count: number;
  min_volume: number | null;
  max_volume: number | null;
  missing_volumes: number[];
  duplicate_volumes: number[];
  has_gaps: boolean;
  has_duplicates: boolean;
  has_unnumbered: boolean;
  is_complete: boolean;
  severity: "high" | "medium" | "low";
}

export function useSeriesValidation(enabled: boolean = true) {
  return useQuery<SeriesIntegrityRow[]>({
    queryKey: ["series-validation"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("validate_series_integrity");
      if (error) throw error;
      return (data ?? []) as SeriesIntegrityRow[];
    },
    ...CACHE.PERSONAL,
  });
}

export function useRepairSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (seriesId: string) => {
      const { data, error } = await supabase.rpc("repair_series_numbering", {
        _series_id: seriesId,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        book_id: string;
        old_volume: number | null;
        new_volume: number;
      }>;
    },
    onSuccess: (rows, seriesId) => {
      toast.success(
        rows.length === 0
          ? "Nada a corrigir nesta série."
          : `Corrigidos ${rows.length} volume(s).`,
      );
      qc.invalidateQueries({ queryKey: ["series-validation"] });
      qc.invalidateQueries({ queryKey: ["series", seriesId] });
      qc.invalidateQueries({ queryKey: ["my-series"] });
      qc.invalidateQueries({ queryKey: ["library"] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Falha ao reparar série");
    },
  });
}
