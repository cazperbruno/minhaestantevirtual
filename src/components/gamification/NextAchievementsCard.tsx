/**
 * Card "Conquistas próximas" para o Discover.
 * Mostra 1-2 achievements multi-formato perto de desbloquear, com barra de progresso.
 */
import { Link } from "react-router-dom";
import { Trophy, ChevronRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useNextAchievements } from "@/hooks/useNextAchievements";
import type { ContentType } from "@/types/book";
import { cn } from "@/lib/utils";

const TONE_BY_TYPE: Record<NonNullable<ContentType>, { ring: string; text: string; bar: string }> = {
  book:     { ring: "ring-primary/30",        text: "text-primary",        bar: "[&>div]:bg-primary" },
  manga:    { ring: "ring-status-reading/30", text: "text-status-reading", bar: "[&>div]:bg-status-reading" },
  comic:    { ring: "ring-status-wishlist/30", text: "text-status-wishlist", bar: "[&>div]:bg-status-wishlist" },
  magazine: { ring: "ring-status-read/30",    text: "text-status-read",    bar: "[&>div]:bg-status-read" },
};

export function NextAchievementsCard() {
  const { data, isLoading } = useNextAchievements(2);

  if (isLoading || !data || data.length === 0) return null;

  return (
    <section className="mb-10 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-2xl font-semibold flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" /> Conquistas próximas
        </h2>
        <Link
          to="/perfil"
          className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
        >
          Ver todas <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {data.map((a) => {
          const tone = TONE_BY_TYPE[a.content_type ?? "book"];
          return (
            <div
              key={a.code}
              className={cn(
                "glass rounded-2xl p-4 ring-1 transition-all hover:shadow-elevated",
                tone.ring,
              )}
            >
              <div className="flex items-start gap-3">
                <div className="text-3xl leading-none shrink-0" aria-hidden>
                  {a.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-display font-semibold text-sm truncate">{a.title}</h3>
                    <span className={cn("text-[11px] font-bold tabular-nums shrink-0", tone.text)}>
                      +{a.xp_reward} XP
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                    {a.description}
                  </p>
                  <div className="mt-2.5">
                    <Progress value={a.pct} className={cn("h-1.5", tone.bar)} />
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {a.progress}/{a.threshold}
                      </span>
                      <span className={cn("text-[10px] font-semibold tabular-nums", tone.text)}>
                        {a.pct}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
