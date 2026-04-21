/**
 * Lista as séries (mangás/HQs) que o usuário está acompanhando, com
 * progresso agregado (volumes lidos / total) e ranking colecionador.
 *
 * Critério de "minha série": usuário tem pelo menos 1 volume da série
 * em user_books (status: reading / read / wishlist / not_read).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CACHE } from "@/lib/query-client";
import type { ContentType } from "@/types/book";

export interface MySeriesRow {
  id: string;
  title: string;
  cover_url: string | null;
  authors: string[];
  content_type: ContentType;
  total_volumes: number | null;
  status: string | null;
  /** volumes da série que o usuário possui (em qualquer status) */
  owned_count: number;
  /** volumes lidos */
  read_count: number;
  /** volumes lendo */
  reading_count: number;
  /** próximo volume a ler (menor volume_number não-lido que possui) */
  next_volume?: number | null;
  /** atualização mais recente em qualquer volume da série */
  last_activity: string | null;
  /** percentual completo (0-100) */
  completion_pct: number;
  /** quantos volumes faltam comprar (se total conhecido) */
  missing_count: number | null;
}

export function useMySeries() {
  const { user } = useAuth();
  return useQuery<MySeriesRow[]>({
    queryKey: ["my-series", user?.id || "anon"],
    enabled: !!user,
    ...CACHE.PERSONAL,
    queryFn: async () => {
      if (!user) return [];
      // 1) Pega todos os user_books do usuário, junto com o livro + série
      const { data, error } = await supabase
        .from("user_books")
        .select(
          "status, updated_at, book:books!inner(id, series_id, volume_number, content_type, series:series(id, title, cover_url, authors, content_type, total_volumes, status))"
        )
        .eq("user_id", user.id)
        .not("book.series_id", "is", null);
      if (error) throw error;

      // 2) Agrega por series_id
      const map = new Map<string, MySeriesRow & { _unread_volumes: number[] }>();
      for (const row of (data as any[]) || []) {
        const b = row.book;
        const s = b?.series;
        if (!s?.id) continue;
        const cur =
          map.get(s.id) ??
          ({
            id: s.id,
            title: s.title,
            cover_url: s.cover_url,
            authors: s.authors || [],
            content_type: s.content_type,
            total_volumes: s.total_volumes,
            status: s.status,
            owned_count: 0,
            read_count: 0,
            reading_count: 0,
            next_volume: null,
            last_activity: null,
            completion_pct: 0,
            missing_count: null,
            _unread_volumes: [],
          } as MySeriesRow & { _unread_volumes: number[] });
        cur.owned_count += 1;
        if (row.status === "read") cur.read_count += 1;
        else if (row.status === "reading") cur.reading_count += 1;
        if (row.status !== "read" && typeof b.volume_number === "number") {
          cur._unread_volumes.push(b.volume_number);
        }
        if (!cur.last_activity || row.updated_at > cur.last_activity) {
          cur.last_activity = row.updated_at;
        }
        map.set(s.id, cur);
      }

      // 3) Resolve next_volume / completion / missing
      return Array.from(map.values())
        .map((r) => {
          const { _unread_volumes, ...clean } = r;
          const next = _unread_volumes.sort((a, b) => a - b)[0];
          const total = clean.total_volumes ?? clean.owned_count;
          const pct = total > 0 ? Math.min(100, Math.round((clean.read_count / total) * 100)) : 0;
          const missing =
            clean.total_volumes != null
              ? Math.max(0, clean.total_volumes - clean.owned_count)
              : null;
          return {
            ...clean,
            next_volume: next ?? null,
            completion_pct: pct,
            missing_count: missing,
          };
        })
        .sort((a, b) => (b.last_activity || "").localeCompare(a.last_activity || ""));
    },
  });
}

export interface CollectionRankRow {
  series_id: string;
  title: string;
  cover_url: string | null;
  content_type: ContentType;
  total_volumes: number | null;
  collectors: number;
  avg_completion: number;
}

/** Ranking global de séries mais completas (modo colecionador). */
export function useCollectionRanking() {
  return useQuery<CollectionRankRow[]>({
    queryKey: ["series-ranking"],
    ...CACHE.CATALOG,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("series_collection_ranking", { _limit: 30 });
      if (error) throw error;
      return (data as CollectionRankRow[]) || [];
    },
  });
}
