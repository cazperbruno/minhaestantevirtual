/**
 * useManageSeries — CRUD manual de séries do usuário.
 *
 * Permite criar, editar, excluir séries e vincular/desvincular livros que o
 * usuário possui (user_books). É a "rede de segurança" para quando o
 * detector automático falha (livros sem autor, títulos atípicos, mangás
 * categorizados como `book`, etc.).
 *
 * Regras:
 *  - Qualquer usuário autenticado pode criar/editar séries.
 *  - Vinculação só atualiza `books.series_id` + `books.volume_number`.
 *  - Após qualquer mutação, invalidamos `mySeries`, `library` e `series:id`.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CACHE, qk } from "@/lib/query-client";
import type { ContentType } from "@/types/book";
import { toast } from "sonner";

export interface ManageableSeries {
  id: string;
  title: string;
  authors: string[];
  content_type: ContentType;
  cover_url: string | null;
  total_volumes: number | null;
  status: string | null;
  description: string | null;
  source: string | null;
  /** quantos livros do usuário estão linkados nesta série */
  user_volume_count: number;
}

export interface UnlinkedUserBook {
  user_book_id: string;
  book_id: string;
  title: string;
  authors: string[];
  cover_url: string | null;
  content_type: ContentType;
  current_series_id: string | null;
  current_series_title: string | null;
  volume_number: number | null;
}

/** Lista todas as séries que o usuário possui (com contagem). */
export function useManageableSeries() {
  const { user } = useAuth();
  return useQuery<ManageableSeries[]>({
    queryKey: ["manage-series", user?.id],
    enabled: !!user,
    ...CACHE.PERSONAL,
    queryFn: async () => {
      if (!user) return [];
      const { data: ubs, error } = await supabase
        .from("user_books")
        .select(
          "book:books!inner(series_id, series:series(id, title, authors, content_type, cover_url, total_volumes, status, description, source))"
        )
        .eq("user_id", user.id)
        .not("book.series_id", "is", null);
      if (error) throw error;
      const map = new Map<string, ManageableSeries>();
      for (const row of (ubs as any[]) || []) {
        const s = row.book?.series;
        if (!s?.id) continue;
        const cur = map.get(s.id) ?? {
          id: s.id,
          title: s.title,
          authors: s.authors || [],
          content_type: s.content_type,
          cover_url: s.cover_url,
          total_volumes: s.total_volumes,
          status: s.status,
          description: s.description,
          source: s.source,
          user_volume_count: 0,
        };
        cur.user_volume_count += 1;
        map.set(s.id, cur);
      }
      return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
    },
  });
}

/** Livros do usuário que NÃO estão em nenhuma série (candidatos para vincular). */
export function useUnlinkedUserBooks() {
  const { user } = useAuth();
  return useQuery<UnlinkedUserBook[]>({
    queryKey: ["unlinked-books", user?.id],
    enabled: !!user,
    ...CACHE.PERSONAL,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("user_books")
        .select(
          "id, book:books!inner(id, title, authors, cover_url, content_type, series_id, volume_number, series:series(id, title))"
        )
        .eq("user_id", user.id);
      if (error) throw error;
      return ((data as any[]) || []).map((r) => ({
        user_book_id: r.id,
        book_id: r.book.id,
        title: r.book.title,
        authors: r.book.authors || [],
        cover_url: r.book.cover_url,
        content_type: r.book.content_type,
        current_series_id: r.book.series_id,
        current_series_title: r.book.series?.title ?? null,
        volume_number: r.book.volume_number,
      }));
    },
  });
}

export interface SeriesInput {
  title: string;
  authors: string[];
  content_type: ContentType;
  total_volumes: number | null;
  cover_url: string | null;
  status: string | null;
  description: string | null;
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>, userId?: string) {
  qc.invalidateQueries({ queryKey: ["manage-series", userId] });
  qc.invalidateQueries({ queryKey: ["unlinked-books", userId] });
  qc.invalidateQueries({ queryKey: qk.mySeries(userId) });
  qc.invalidateQueries({ queryKey: qk.library(userId) });
  qc.invalidateQueries({ queryKey: ["series"] });
}

export function useCreateSeries() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: SeriesInput) => {
      const { data, error } = await supabase
        .from("series")
        .insert({
          title: input.title.trim(),
          authors: input.authors.filter(Boolean),
          content_type: input.content_type,
          total_volumes: input.total_volumes,
          cover_url: input.cover_url,
          status: input.status,
          description: input.description,
          source: "manual",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      invalidateAll(qc, user?.id);
      toast.success("Série criada");
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao criar série"),
  });
}

export function useUpdateSeries() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<SeriesInput> }) => {
      const payload: any = {};
      if (input.title !== undefined) payload.title = input.title.trim();
      if (input.authors !== undefined) payload.authors = input.authors.filter(Boolean);
      if (input.content_type !== undefined) payload.content_type = input.content_type;
      if (input.total_volumes !== undefined) payload.total_volumes = input.total_volumes;
      if (input.cover_url !== undefined) payload.cover_url = input.cover_url;
      if (input.status !== undefined) payload.status = input.status;
      if (input.description !== undefined) payload.description = input.description;
      const { error } = await supabase.from("series").update(payload).eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      invalidateAll(qc, user?.id);
      toast.success("Série atualizada");
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao atualizar"),
  });
}

export function useDeleteSeries() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      // 1) desvincula livros
      const { error: uErr } = await supabase
        .from("books")
        .update({ series_id: null, volume_number: null })
        .eq("series_id", id);
      if (uErr) throw uErr;
      // 2) deleta série
      const { error } = await supabase.from("series").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      invalidateAll(qc, user?.id);
      toast.success("Série excluída");
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao excluir"),
  });
}

export function useLinkBookToSeries() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      bookId,
      seriesId,
      volumeNumber,
    }: {
      bookId: string;
      seriesId: string;
      volumeNumber: number | null;
    }) => {
      const { error } = await supabase
        .from("books")
        .update({ series_id: seriesId, volume_number: volumeNumber })
        .eq("id", bookId);
      if (error) throw error;
      // Marca fila como done (não tenta reprocessar)
      await supabase
        .from("series_backfill_queue")
        .update({
          status: "done",
          processed_at: new Date().toISOString(),
          matched_series_id: seriesId,
        })
        .eq("book_id", bookId)
        .in("status", ["pending", "processing", "skipped"]);
    },
    onSuccess: () => {
      invalidateAll(qc, user?.id);
      toast.success("Volume vinculado");
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao vincular"),
  });
}

export function useUnlinkBookFromSeries() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (bookId: string) => {
      const { error } = await supabase
        .from("books")
        .update({ series_id: null, volume_number: null })
        .eq("id", bookId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll(qc, user?.id);
      toast.success("Volume removido da série");
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao desvincular"),
  });
}

export function useUpdateVolumeNumber() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ bookId, volumeNumber }: { bookId: string; volumeNumber: number | null }) => {
      const { error } = await supabase
        .from("books")
        .update({ volume_number: volumeNumber })
        .eq("id", bookId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll(qc, user?.id);
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao salvar volume"),
  });
}
