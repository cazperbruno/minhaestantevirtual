import { useEffect, useMemo, useState } from "react";
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

/**
 * Configuração visual por categoria. Mantém uma identidade discreta por
 * tipo de conteúdo sem virar arco-íris: cor sutil no card desbloqueado e
 * label amigável no cabeçalho do grupo.
 */
const CATEGORY_META: Record<
  string,
  { label: string; emoji: string; tone: string }
> = {
  reading: { label: "Leitura", emoji: "📚", tone: "primary" },
  social: { label: "Social", emoji: "💬", tone: "primary" },
  collection: { label: "Coleção", emoji: "🗂️", tone: "primary" },
  streak: { label: "Constância", emoji: "🔥", tone: "primary" },
  challenges: { label: "Desafios", emoji: "🎯", tone: "primary" },
  manga: { label: "Mangás", emoji: "📖", tone: "manga" },
  comic: { label: "Quadrinhos", emoji: "🦸", tone: "comic" },
  magazine: { label: "Revistas", emoji: "📰", tone: "magazine" },
  multi_format: { label: "Multi-formato", emoji: "✨", tone: "primary" },
};

/**
 * Cores por tom — definidas como classes Tailwind diretas (HSL via design
 * tokens). Mantemos os tons "manga/comic/magazine" como utilitários simples
 * sobre primary com hue shift via opacity para não exigir novos tokens.
 */
const TONE_CLASSES: Record<string, { border: string; bg: string; icon: string; chip: string }> = {
  primary: {
    border: "border-primary/40",
    bg: "bg-primary/5 shadow-[0_0_20px_-10px_hsl(var(--primary))]",
    icon: "text-primary",
    chip: "bg-primary/15 text-primary border-primary/30",
  },
  manga: {
    border: "border-status-reading/40",
    bg: "bg-status-reading/5 shadow-[0_0_20px_-10px_hsl(var(--status-reading))]",
    icon: "text-status-reading",
    chip: "bg-status-reading/15 text-status-reading border-status-reading/30",
  },
  comic: {
    border: "border-status-wishlist/40",
    bg: "bg-status-wishlist/5 shadow-[0_0_20px_-10px_hsl(var(--status-wishlist))]",
    icon: "text-status-wishlist",
    chip: "bg-status-wishlist/15 text-status-wishlist border-status-wishlist/30",
  },
  magazine: {
    border: "border-status-read/40",
    bg: "bg-status-read/5 shadow-[0_0_20px_-10px_hsl(var(--status-read))]",
    icon: "text-status-read",
    chip: "bg-status-read/15 text-status-read border-status-read/30",
  },
};

function getMeta(category: string) {
  return CATEGORY_META[category] || { label: category, emoji: "🏆", tone: "primary" };
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

  // Agrupa por categoria, mantendo a ordem natural definida em CATEGORY_META.
  const groups = useMemo(() => {
    const map = new Map<string, Achievement[]>();
    for (const a of items) {
      const list = map.get(a.category) || [];
      list.push(a);
      map.set(a.category, list);
    }
    const order = Object.keys(CATEGORY_META);
    return Array.from(map.entries()).sort(([a], [b]) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [items]);

  if (loading) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const unlockedCount = items.filter((i) => i.unlocked).length;

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display text-xl font-semibold flex items-center gap-2">
          <Award className="w-5 h-5 text-primary" /> Conquistas
        </h2>
        <span className="text-sm text-muted-foreground tabular-nums">
          {unlockedCount} / {items.length}
        </span>
      </div>

      <div className="space-y-6">
        {groups.map(([category, list]) => {
          const meta = getMeta(category);
          const tone = TONE_CLASSES[meta.tone] || TONE_CLASSES.primary;
          const groupUnlocked = list.filter((a) => a.unlocked).length;
          return (
            <section key={category} aria-label={meta.label}>
              <header className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <span aria-hidden>{meta.emoji}</span> {meta.label}
                </h3>
                <span
                  className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-full border tabular-nums",
                    tone.chip,
                  )}
                >
                  {groupUnlocked} / {list.length}
                </span>
              </header>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {list.map((a) => {
                  const Icon = a.unlocked ? getIcon(a.icon) : Lock;
                  return (
                    <div
                      key={a.code}
                      className={cn(
                        "rounded-xl p-3 border text-center transition-all",
                        a.unlocked
                          ? cn(tone.border, tone.bg)
                          : "border-border/40 bg-muted/20 opacity-60",
                      )}
                      title={a.description}
                    >
                      <Icon
                        className={cn(
                          "w-6 h-6 mx-auto mb-1",
                          a.unlocked ? tone.icon : "text-muted-foreground",
                        )}
                      />
                      <p className="font-semibold text-xs leading-tight">{a.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">+{a.xp_reward} XP</p>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
