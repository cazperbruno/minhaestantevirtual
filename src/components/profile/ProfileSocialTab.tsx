import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { profilePath } from "@/lib/profile-path";
import { Users, UserPlus, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Reader {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

export function ProfileSocialTab({ userId }: { userId: string }) {
  const [followers, setFollowers] = useState<Reader[]>([]);
  const [following, setFollowing] = useState<Reader[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [{ data: f1 }, { data: f2 }] = await Promise.all([
        supabase.from("follows").select("follower_id").eq("following_id", userId).limit(24),
        supabase.from("follows").select("following_id").eq("follower_id", userId).limit(24),
      ]);
      const followerIds = (f1 || []).map((r: any) => r.follower_id);
      const followingIds = (f2 || []).map((r: any) => r.following_id);
      const [{ data: p1 }, { data: p2 }] = await Promise.all([
        followerIds.length
          ? supabase.from("profiles").select("id, display_name, username, avatar_url").in("id", followerIds)
          : Promise.resolve({ data: [] as Reader[] }),
        followingIds.length
          ? supabase.from("profiles").select("id, display_name, username, avatar_url").in("id", followingIds)
          : Promise.resolve({ data: [] as Reader[] }),
      ]);
      if (!mounted) return;
      setFollowers((p1 || []) as Reader[]);
      setFollowing((p2 || []) as Reader[]);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Block title="Seguidores" subtitle={`${followers.length}+ pessoas`} list={followers} icon={<Users className="w-4 h-4 text-primary" />} />
      <Block title="Seguindo" subtitle={`${following.length}+ leitores`} list={following} icon={<UserPlus className="w-4 h-4 text-primary" />} />
      <Button asChild variant="outline" className="w-full gap-1.5">
        <Link to="/leitores">Descobrir mais leitores <ArrowRight className="w-4 h-4" /></Link>
      </Button>
    </div>
  );
}

function Block({ title, subtitle, list, icon }: { title: string; subtitle: string; list: Reader[]; icon: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">· {subtitle}</span>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground italic glass rounded-xl p-4">Nada por aqui ainda.</p>
      ) : (
        <ul className="flex gap-3 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-2">
          {list.map((r) => (
            <li key={r.id} className="shrink-0 w-20 text-center">
              <Link to={profilePath(r)} className="block">
                <Avatar className="w-16 h-16 mx-auto ring-2 ring-transparent hover:ring-primary/40 transition-all">
                  <AvatarImage src={r.avatar_url || undefined} />
                  <AvatarFallback className="bg-gradient-gold text-primary-foreground font-display">
                    {(r.display_name || "?").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <p className="text-xs font-medium truncate mt-1.5">{r.display_name || "—"}</p>
                {r.username && <p className="text-[10px] text-muted-foreground truncate">@{r.username}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
