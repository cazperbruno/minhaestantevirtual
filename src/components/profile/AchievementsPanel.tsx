import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Award, Lock } from "lucide-react";
import { getIcon } from "@/lib/gamification";

interface Achievement {
  code: string;
  title: string;
  description: string;
  icon: string;
  xp_reward: number;
  category: string;
  unlocked: boolean;
  unlocked_at?: string;
}

export function AchievementsPanel({ userId }: { userId: string }) {
  const [items, setItems] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: all }, { data: mine }] = await Promise.all([
        supabase.from("achievements").select("*").order("xp_reward"),
        supabase.from("user_achievements").select("*").eq("user_id", userId),
      ]);
      const unlockedMap = new Map((mine || []).map((u: any) => [u.achievement_code, u.unlocked_at]));
      setItems(
        (all || []).map((a: any) => ({
          ...a,
          unlocked: unlockedMap.has(a.code),
          unlocked_at: unlockedMap.get(a.code),
        })),
      );
      setLoading(false);
    })();
  }, [userId]);

  if (loading) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const unlockedCount = items.filter((i) => i.unlocked).length;

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl font-semibold flex items-center gap-2">
          <Award className="w-5 h-5 text-primary" /> Conquistas
        </h2>
        <span className="text-sm text-muted-foreground">
          {unlockedCount} / {items.length}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map((a) => {
          const Icon = a.unlocked ? getIcon(a.icon) : Lock;
          return (
            <div
              key={a.code}
              className={cn(
                "rounded-xl p-3 border text-center transition-all",
                a.unlocked
                  ? "border-primary/40 bg-primary/5 shadow-[0_0_20px_-10px_hsl(var(--primary))]"
                  : "border-border/40 bg-muted/20 opacity-60",
              )}
              title={a.description}
            >
              <Icon className={cn("w-6 h-6 mx-auto mb-1", a.unlocked ? "text-primary" : "text-muted-foreground")} />
              <p className="font-semibold text-xs leading-tight">{a.title}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">+{a.xp_reward} XP</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
