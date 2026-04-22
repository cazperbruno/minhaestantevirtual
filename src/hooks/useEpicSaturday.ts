import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Indica se hoje é "sábado épico" (BRT) — caixa surpresa com odds aumentadas.
 * Usado pra UI exibir badge/CTA chamativo.
 */
export function useEpicSaturday() {
  return useQuery<boolean>({
    queryKey: ["is-epic-saturday"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.rpc("is_epic_saturday");
      return Boolean(data);
    },
  });
}
