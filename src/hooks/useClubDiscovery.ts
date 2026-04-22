import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ClubCategory } from "@/lib/club-categories";

export interface FeaturedClub {
  id: string;
  name: string;
  description: string | null;
  category: ClubCategory;
  current_book_id: string | null;
  member_count: number;
  online_count: number;
  activity_score: number;
  current_book?: { id: string; title: string; authors: string[]; cover_url: string | null } | null;
}

/** Clube em destaque — mais ativo dos últimos 7 dias. */
export function useFeaturedClub() {
  return useQuery({
    queryKey: ["clubs", "featured"],
    queryFn: async (): Promise<FeaturedClub | null> => {
      const { data, error } = await supabase.rpc("featured_club");
      if (error) throw error;
      const row = (data || [])[0];
      if (!row) return null;
      // Hidrata livro do mês se houver
      let book: FeaturedClub["current_book"] = null;
      if (row.current_book_id) {
        const { data: b } = await supabase
          .from("books")
          .select("id,title,authors,cover_url")
          .eq("id", row.current_book_id)
          .maybeSingle();
        book = (b as FeaturedClub["current_book"]) ?? null;
      }
      return {
        ...row,
        category: row.category as ClubCategory,
        member_count: Number(row.member_count) || 0,
        online_count: Number(row.online_count) || 0,
        activity_score: Number(row.activity_score) || 0,
        current_book: book,
      };
    },
    staleTime: 5 * 60_000,
  });
}

export interface RecommendedClub {
  id: string;
  name: string;
  description: string | null;
  category: ClubCategory;
  current_book_id: string | null;
  member_count: number;
  online_count: number;
  current_book?: { id: string; title: string; authors: string[]; cover_url: string | null } | null;
}

/** Clubes recomendados pra você (com hidratação de livro do mês). */
export function useRecommendedClubs(limit = 6) {
  return useQuery({
    queryKey: ["clubs", "recommended", limit],
    queryFn: async (): Promise<RecommendedClub[]> => {
      const { data, error } = await supabase.rpc("recommended_clubs", { _limit: limit });
      if (error) throw error;
      const rows = (data || []) as Array<Omit<RecommendedClub, "current_book"> & { category: string }>;
      const bookIds = rows.map((r) => r.current_book_id).filter(Boolean) as string[];
      const bookMap = new Map<string, RecommendedClub["current_book"]>();
      if (bookIds.length) {
        const { data: books } = await supabase
          .from("books")
          .select("id,title,authors,cover_url")
          .in("id", bookIds);
        (books || []).forEach((b) => bookMap.set(b.id, b as RecommendedClub["current_book"]));
      }
      return rows.map((r) => ({
        ...r,
        category: r.category as ClubCategory,
        member_count: Number(r.member_count) || 0,
        online_count: Number(r.online_count) || 0,
        current_book: r.current_book_id ? bookMap.get(r.current_book_id) ?? null : null,
      }));
    },
    staleTime: 2 * 60_000,
  });
}

export interface ClubActivityItem {
  kind: "message" | "joined";
  at: string;
  user_id: string;
  payload: { preview?: string };
  profile?: { id: string; display_name: string | null; username: string | null; avatar_url: string | null };
}

/** Atividade recente do clube (mensagens + entradas). */
export function useClubRecentActivity(clubId: string | undefined, isMember: boolean, limit = 8) {
  return useQuery({
    queryKey: ["clubs", clubId, "activity"],
    enabled: !!clubId && isMember,
    queryFn: async (): Promise<ClubActivityItem[]> => {
      const { data, error } = await supabase.rpc("club_recent_activity", {
        _club_id: clubId!,
        _limit: limit,
      });
      if (error) throw error;
      const rows = (data || []) as ClubActivityItem[];
      const userIds = [...new Set(rows.map((r) => r.user_id))];
      if (userIds.length === 0) return rows;
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,display_name,username,avatar_url")
        .in("id", userIds);
      const map = new Map((profs || []).map((p) => [p.id, p as ClubActivityItem["profile"]]));
      return rows.map((r) => ({ ...r, profile: map.get(r.user_id) }));
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/**
 * Membros ricos de vários clubes em uma chamada — para stack de avatares nos cards.
 * Retorna um Map<clubId, MemberLite[]>.
 */
export interface MemberLite {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_online: boolean;
}

export function useClubsMembers(clubIds: string[]) {
  const key = clubIds.slice().sort().join(",");
  return useQuery({
    queryKey: ["clubs", "members-lite", key],
    enabled: clubIds.length > 0,
    queryFn: async (): Promise<Record<string, MemberLite[]>> => {
      const { data: rows } = await supabase
        .from("club_members")
        .select("club_id,user_id,last_seen_at")
        .in("club_id", clubIds);
      const userIds = [...new Set((rows || []).map((r) => r.user_id))];
      const profMap = new Map<string, { display_name: string | null; avatar_url: string | null }>();
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,display_name,avatar_url")
          .in("id", userIds);
        (profs || []).forEach((p) => profMap.set(p.id, { display_name: p.display_name, avatar_url: p.avatar_url }));
      }
      const fiveMinAgo = Date.now() - 5 * 60_000;
      const result: Record<string, MemberLite[]> = {};
      (rows || []).forEach((r) => {
        const prof = profMap.get(r.user_id) || { display_name: null, avatar_url: null };
        const arr = result[r.club_id] || (result[r.club_id] = []);
        arr.push({
          user_id: r.user_id,
          display_name: prof.display_name,
          avatar_url: prof.avatar_url,
          is_online: r.last_seen_at ? new Date(r.last_seen_at).getTime() > fiveMinAgo : false,
        });
      });
      // Ordena: online primeiro, depois com avatar
      Object.values(result).forEach((arr) =>
        arr.sort((a, b) => Number(b.is_online) - Number(a.is_online) || (a.avatar_url ? -1 : 1)),
      );
      return result;
    },
    staleTime: 60_000,
  });
}
