import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getIcon } from "@/lib/gamification";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Latest {
  code: string;
  title: string;
  description: string;
  icon: string;
  xp_reward: number;
  unlocked_at: string;
}

/**
 * Banner discreto exibido no topo do perfil com a última conquista do usuário.
 * Sumiu se o usuário ainda não tem nenhuma conquista — não polui a UI.
 */
export function LatestAchievementBanner({ userId }: { userId: string }) {
  const [latest, setLatest] = useState<Latest | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_achievements")
        .select("unlocked_at, achievement:achievements(code,title,description,icon,xp_reward)")
        .eq("user_id", userId)
        .order("unlocked_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (data?.achievement) {
        setLatest({
          ...(data.achievement as any),
          unlocked_at: data.unlocked_at,
        });
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  if (!loaded || !latest) return null;
  const Icon = getIcon(latest.icon);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl p-4 mb-6 border border-primary/30",
        "bg-gradient-to-r from-primary/15 via-primary/5 to-transparent",
        "shadow-[0_0_30px_-12px_hsl(var(--primary)/0.6)] animate-fade-in",
      )}
    >
      <div className="absolute -top-6 -right-6 w-24 h-24 bg-primary/20 rounded-full blur-2xl pointer-events-none" />
      <div className="flex items-center gap-4 relative">
        <div className="w-14 h-14 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0 shadow-glow">
          <Icon className="w-7 h-7 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-primary flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Última conquista
          </p>
          <p className="font-display font-bold text-lg leading-tight truncate">{latest.title}</p>
          <p className="text-xs text-muted-foreground line-clamp-1">
            {latest.description} · +{latest.xp_reward} XP ·{" "}
            {formatDistanceToNow(new Date(latest.unlocked_at), { addSuffix: true, locale: ptBR })}
          </p>
        </div>
      </div>
    </div>
  );
}
