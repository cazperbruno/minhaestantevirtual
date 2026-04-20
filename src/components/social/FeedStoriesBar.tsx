import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { profilePath } from "@/lib/profile-path";
import { cn } from "@/lib/utils";
import { BookOpen, CheckCircle2, Star, Bookmark } from "lucide-react";

interface Story {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  kinds: Set<string>; // started_reading | finished_reading | reviewed | wishlisted
  latest: string;
}

const KIND_ICON: Record<string, typeof BookOpen> = {
  started_reading: BookOpen,
  finished_reading: CheckCircle2,
  reviewed: Star,
  wishlisted: Bookmark,
};

/**
 * Faixa de "Stories" — amigos seguidos com atividade nas últimas 24h.
 * Cada bolha leva direto ao perfil; ícone indica o tipo mais recente.
 * Mostra apenas se o usuário segue alguém com atividade recente.
 */
export function FeedStoriesBar() {
  const { user } = useAuth();
  const [stories, setStories] = useState<Story[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: f } = await supabase
        .from("follows").select("following_id").eq("follower_id", user.id);
      const ids = (f || []).map((x: any) => x.following_id);
      if (ids.length === 0) {
        if (!cancelled) setStories([]);
        return;
      }
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: acts } = await supabase
        .from("activities")
        .select("user_id,kind,created_at")
        .in("user_id", ids)
        .in("kind", ["started_reading", "finished_reading", "reviewed", "wishlisted"])
        .gte("created_at", since)
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(80);
      if (cancelled) return;
      const list = acts || [];
      if (list.length === 0) {
        setStories([]);
        return;
      }
      const userIds = [...new Set(list.map((a: any) => a.user_id))];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,display_name,username,avatar_url")
        .in("id", userIds);
      const profMap = new Map((profs || []).map((p: any) => [p.id, p]));
      const grouped = new Map<string, Story>();
      for (const a of list as any[]) {
        const prev = grouped.get(a.user_id);
        if (prev) {
          prev.kinds.add(a.kind);
        } else {
          const p = profMap.get(a.user_id) as any;
          grouped.set(a.user_id, {
            user_id: a.user_id,
            display_name: p?.display_name ?? null,
            username: p?.username ?? null,
            avatar_url: p?.avatar_url ?? null,
            kinds: new Set([a.kind]),
            latest: a.created_at,
          });
        }
      }
      if (!cancelled) setStories([...grouped.values()]);
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (!user) return null;
  if (stories === null) {
    return (
      <div className="flex gap-3 overflow-hidden mb-4 -mx-1 px-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="w-16 h-16 rounded-full shrink-0" />
        ))}
      </div>
    );
  }
  if (stories.length === 0) return null;

  return (
    <div className="mb-5 -mx-5 md:mx-0">
      <ul className="flex gap-3 overflow-x-auto px-5 md:px-0 pb-1 scrollbar-none snap-x">
        {stories.map((s) => {
          // ícone: prioriza finished > reviewed > started > wishlisted
          const order = ["finished_reading", "reviewed", "started_reading", "wishlisted"];
          const k = order.find((x) => s.kinds.has(x)) || "started_reading";
          const Icon = KIND_ICON[k];
          return (
            <li key={s.user_id} className="snap-start shrink-0">
              <Link
                to={profilePath({ id: s.user_id, username: s.username })}
                className="group flex flex-col items-center w-16"
                aria-label={`Atividade de ${s.display_name || "leitor"}`}
              >
                <div
                  className={cn(
                    "relative rounded-full p-[2px] transition-transform group-hover:scale-105",
                    "bg-gradient-gold",
                  )}
                >
                  <Avatar className="w-14 h-14 border-2 border-background">
                    <AvatarImage src={s.avatar_url || undefined} />
                    <AvatarFallback className="bg-muted text-foreground text-sm font-display">
                      {(s.display_name || "?").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute -bottom-0.5 -right-0.5 bg-primary text-primary-foreground rounded-full p-1 shadow-md">
                    <Icon className="w-3 h-3" />
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground mt-1.5 truncate w-full text-center group-hover:text-primary transition-colors">
                  {s.display_name?.split(" ")[0] || "Leitor"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
