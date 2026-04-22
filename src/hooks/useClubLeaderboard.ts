import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LeaderboardRow {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  is_owner: boolean;
  pages_read: number;
  finished_book: boolean;
  messages_count: number;
  reactions_given: number;
  reactions_received: number;
  nominations_count: number;
  votes_received: number;
  total_points: number;
  level: number;
  achievements: string[] | null;
}

export function useClubLeaderboard(clubId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["club-leaderboard", clubId],
    enabled: !!clubId && enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("club_leaderboard" as any, {
        _club_id: clubId,
      });
      if (error) throw error;
      return (data || []) as LeaderboardRow[];
    },
  });
}
