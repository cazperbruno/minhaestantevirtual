import { Trophy, ChevronUp, ChevronDown, Sparkles } from "lucide-react";
import { useWeeklyLeague, type Division } from "@/hooks/useWeeklyLeague";
import { cn } from "@/lib/utils";

const DIVISION_STYLES: Record<Division, { gradient: string; ring: string; emoji: string; text: string }> = {
  bronze:   { gradient: "from-amber-700/30 via-amber-600/20 to-amber-900/30",   ring: "ring-amber-700/40",   emoji: "🥉", text: "text-amber-400" },
  silver:   { gradient: "from-slate-300/30 via-slate-200/20 to-slate-400/30",   ring: "ring-slate-300/40",   emoji: "🥈", text: "text-slate-200" },
  gold:     { gradient: "from-yellow-400/30 via-amber-300/20 to-yellow-600/30", ring: "ring-yellow-400/50",  emoji: "🥇", text: "text-yellow-300" },
  platinum: { gradient: "from-cyan-300/30 via-sky-200/20 to-cyan-500/30",       ring: "ring-cyan-300/50",    emoji: "💠", text: "text-cyan-200" },
  diamond:  { gradient: "from-fuchsia-400/30 via-purple-300/20 to-indigo-500/30", ring: "ring-fuchsia-300/60", emoji: "💎", text: "text-fuchsia-200" },
};

/**
 * Badge cinematográfico da liga semanal.
 * Mostra divisão atual, posição, XP até promoção e zona de risco/segurança.
 */
export function LeagueBadge({ compact }: { compact?: boolean }) {
  const { data: league, isLoading } = useWeeklyLeague();

  if (isLoading) {
    return <div className="h-24 rounded-2xl bg-muted/30 animate-pulse" />;
  }
  if (!league) return null;

  const style = DIVISION_STYLES[league.division];
  const toPromotion = Math.max(0, league.promotion_threshold - league.weekly_xp);
  const isTopDivision = league.division === "diamond";
  const inSafeZone = league.weekly_xp >= league.demotion_threshold;

  if (compact) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r border border-border/40 ring-1",
          style.gradient,
          style.ring,
        )}
      >
        <span className="text-base leading-none" aria-hidden>{style.emoji}</span>
        <span className={cn("text-xs font-display font-bold uppercase tracking-wider", style.text)}>
          {league.division_label}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          · {league.weekly_xp} XP
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/40 ring-1 p-5 bg-gradient-to-br animate-fade-in",
        style.gradient,
        style.ring,
      )}
    >
      <div className="absolute -top-8 -right-8 text-8xl opacity-20 select-none" aria-hidden>
        {style.emoji}
      </div>

      <div className="relative">
        <div className="flex items-center gap-2 mb-1">
          <Trophy className={cn("w-4 h-4", style.text)} />
          <span className={cn("text-[11px] font-bold uppercase tracking-[0.2em]", style.text)}>
            Liga semanal
          </span>
        </div>
        <h3 className="font-display text-3xl md:text-4xl font-bold leading-none mb-3">
          {style.emoji} {league.division_label}
        </h3>

        <div className="flex items-baseline gap-2 mb-4">
          <span className="font-display text-2xl font-bold tabular-nums">
            {league.weekly_xp}
          </span>
          <span className="text-sm text-muted-foreground">XP esta semana</span>
          {league.position_in_division > 0 && (
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              #{league.position_in_division}
              {league.total_in_division > 0 && ` de ${league.total_in_division}`}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {!isTopDivision && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-background/60 border border-border/40">
              <ChevronUp className="w-3 h-3 text-emerald-400" />
              <span className="font-medium">{toPromotion} XP</span>
              <span className="text-muted-foreground">para promoção</span>
            </span>
          )}
          {league.division !== "bronze" && (
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-background/60 border",
                inSafeZone ? "border-border/40" : "border-destructive/50",
              )}
            >
              {inSafeZone ? (
                <Sparkles className="w-3 h-3 text-emerald-400" />
              ) : (
                <ChevronDown className="w-3 h-3 text-destructive" />
              )}
              <span className="text-muted-foreground">
                {inSafeZone ? "Posição segura" : "Risco de queda"}
              </span>
            </span>
          )}
          {isTopDivision && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-background/60 border border-fuchsia-300/40">
              <Sparkles className="w-3 h-3 text-fuchsia-300" />
              <span className="text-fuchsia-200 font-semibold">Divisão máxima</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
