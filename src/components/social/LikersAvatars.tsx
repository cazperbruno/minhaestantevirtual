import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Liker {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface Props {
  reviewId: string;
  /** Quantidade total de likes vinda do feed (para texto "+N outros"). */
  totalLikes: number;
  className?: string;
}

/**
 * Mini-avatares dos últimos 3 likers de uma resenha.
 * Lazy-load: só busca quando há pelo menos 1 like.
 * Cache local por reviewId — evita refetch ao re-render.
 */
const cache = new Map<string, Liker[]>();

export function LikersAvatars({ reviewId, totalLikes, className }: Props) {
  const [likers, setLikers] = useState<Liker[]>(() => cache.get(reviewId) || []);

  useEffect(() => {
    if (totalLikes < 1) return;
    if (cache.has(reviewId)) {
      setLikers(cache.get(reviewId)!);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: likes } = await supabase
        .from("review_likes")
        .select("user_id,created_at")
        .eq("review_id", reviewId)
        .order("created_at", { ascending: false })
        .limit(3);
      const ids = (likes || []).map((l: any) => l.user_id);
      if (ids.length === 0) return;
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,display_name,avatar_url")
        .in("id", ids);
      if (cancelled) return;
      const ordered = ids
        .map((id) => (profs || []).find((p: any) => p.id === id))
        .filter(Boolean) as Liker[];
      cache.set(reviewId, ordered);
      setLikers(ordered);
    })();
    return () => { cancelled = true; };
  }, [reviewId, totalLikes]);

  if (totalLikes < 1 || likers.length === 0) return null;

  const others = Math.max(0, totalLikes - likers.length);
  const firstName = likers[0]?.display_name?.split(" ")[0] || "Alguém";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex -space-x-2">
        {likers.map((l) => (
          <Avatar key={l.id} className="w-5 h-5 border-2 border-background">
            <AvatarImage src={l.avatar_url || undefined} />
            <AvatarFallback className="bg-gradient-gold text-primary-foreground text-[8px]">
              {(l.display_name || "?").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
      <span className="text-[11px] text-muted-foreground leading-none">
        Curtido por <span className="font-medium text-foreground">{firstName}</span>
        {others > 0 && ` e +${others} outros`}
      </span>
    </div>
  );
}
