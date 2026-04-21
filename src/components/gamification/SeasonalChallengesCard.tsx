import { CalendarDays } from "lucide-react";
import { useSeasonalChallenges } from "@/hooks/useWeeklyLeague";

/**
 * Card que exibe missões sazonais ativas (Halloween, Natal, Carnaval etc).
 * Renderiza vazio se não houver nada no mês corrente.
 */
export function SeasonalChallengesCard() {
  const { data: challenges = [], isLoading } = useSeasonalChallenges();

  if (isLoading || challenges.length === 0) return null;

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-5 animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays className="w-4 h-4 text-primary" />
        <h3 className="font-display text-sm font-bold uppercase tracking-[0.18em] text-primary">
          Missões sazonais
        </h3>
        <span className="ml-auto text-[10px] text-muted-foreground">
          Tempo limitado
        </span>
      </div>

      <ul className="space-y-2">
        {challenges.map((c) => (
          <li
            key={c.code}
            className="flex items-center gap-3 p-3 rounded-xl bg-card/60 border border-border/40 hover:border-primary/40 transition-colors"
          >
            <span className="text-2xl leading-none shrink-0" aria-hidden>{c.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-semibold leading-tight">{c.title}</p>
              <p className="text-xs text-muted-foreground line-clamp-1">{c.description}</p>
            </div>
            <span className="shrink-0 text-xs font-bold text-primary tabular-nums">
              +{c.xp_reward} XP
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
