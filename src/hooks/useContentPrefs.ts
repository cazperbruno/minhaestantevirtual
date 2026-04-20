/**
 * Preferências de tipo de conteúdo do usuário (livros, mangás, HQs, revistas).
 *
 * Fonte de verdade: profiles.content_types.
 * Cache local por sessão para evitar refetch (invalidado no update).
 */
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { queryClient } from "@/lib/query-client";
import type { ContentType } from "@/types/book";

const DEFAULT: ContentType[] = ["book"];

export function useContentPrefs() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["content-prefs", user?.id || "anon"],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ContentType[]> => {
      if (!user) return DEFAULT;
      const { data } = await supabase
        .from("profiles")
        .select("content_types")
        .eq("id", user.id)
        .maybeSingle();
      const list = (data?.content_types as ContentType[] | null) ?? DEFAULT;
      return list.length > 0 ? list : DEFAULT;
    },
  });
}

export function useUpdateContentPrefs() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (types: ContentType[]) => {
      if (!user) throw new Error("not_authenticated");
      const safe = types.length > 0 ? types : DEFAULT;
      const { error } = await supabase
        .from("profiles")
        .update({ content_types: safe })
        .eq("id", user.id);
      if (error) throw error;
      return safe;
    },
    onSuccess: (types) => {
      queryClient.setQueryData(["content-prefs", user?.id || "anon"], types);
      // Recomendações dependem disso — invalida prateleiras e feed
      queryClient.invalidateQueries({ queryKey: ["shelves"] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });
}
