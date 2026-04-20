/**
 * Série (mangá / HQ) com seus volumes e progresso do usuário.
 *
 * Junta `series` + `books` (volumes) + `user_books` (progresso).
 * Cache CATALOG no série, PERSONAL no progresso (invalidado ao atualizar).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CACHE } from "@/lib/query-client";
import type { Book, UserBook } from "@/types/book";
import type { ContentType } from "@/types/book";

export interface Series {
  id: string;
  title: string;
  authors: string[];
  content_type: ContentType;
  cover_url: string | null;
  description: string | null;
  total_volumes: number | null;
  status: string | null;
  source: string | null;
  source_id: string | null;
}

export interface SeriesVolume extends Book {
  user_book?: UserBook | null;
}

export interface SeriesDetail {
  series: Series;
  volumes: SeriesVolume[];
  /** Numero de volumes lidos pelo usuário. */
  read_count: number;
  /** Total esperado (anilist) ou volumes existentes no banco. */
  total: number;
}

async function fetchSeriesDetail(id: string, userId: string | null): Promise<SeriesDetail | null> {
  const { data: series, error } = await supabase
    .from("series").select("*").eq("id", id).maybeSingle();
  if (error || !series) return null;

  const { data: vols } = await supabase
    .from("books")
    .select("*")
    .eq("series_id", id)
    .order("volume_number", { ascending: true, nullsFirst: false });

  const volumes: SeriesVolume[] = (vols as Book[] || []).map((b) => ({ ...b }));

  if (userId && volumes.length > 0) {
    const { data: ubs } = await supabase
      .from("user_books").select("*")
      .eq("user_id", userId)
      .in("book_id", volumes.map((v) => v.id));
    const byBook = new Map((ubs as UserBook[] || []).map((u) => [u.book_id, u]));
    for (const v of volumes) v.user_book = byBook.get(v.id) ?? null;
  }

  const read_count = volumes.filter((v) => v.user_book?.status === "read").length;
  const total = (series as any).total_volumes ?? volumes.length;

  return { series: series as Series, volumes, read_count, total };
}

export function useSeriesDetail(id?: string) {
  const { user } = useAuth();
  return useQuery<SeriesDetail | null>({
    queryKey: ["series", id, user?.id || "anon"],
    queryFn: () => fetchSeriesDetail(id!, user?.id ?? null),
    enabled: !!id,
    ...CACHE.PERSONAL,
  });
}
