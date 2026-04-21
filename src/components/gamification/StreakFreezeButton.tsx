import { Snowflake, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useStreak, useStreakFreeze } from "@/hooks/useStreak";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * Botão pra usar um Streak Freeze — protege o streak por 1 dia perdido.
 * Renova 1 freeze automaticamente a cada 7 dias (cap em 3).
 */
export function StreakFreezeButton({ className }: { className?: string }) {
  const { user } = useAuth();
  const { data: streak } = useStreak(user?.id);
  const freeze = useStreakFreeze(user?.id);

  const available = streak?.freezes_available ?? 0;
  const disabled = !user || freeze.isPending || available <= 0 || (streak?.current_days ?? 0) === 0;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        haptic("tap");
        freeze.mutate();
      }}
      disabled={disabled}
      className={cn(
        "gap-1.5 h-8 border-primary/30 hover:border-primary/60 hover:text-primary",
        available > 0 && "shadow-glow/30",
        className,
      )}
      aria-label={`Usar streak freeze — ${available} disponível`}
      title={
        available > 0
          ? `${available} freeze${available > 1 ? "s" : ""} disponível — protege seu streak por 1 dia`
          : "Você ganhará 1 freeze em até 7 dias"
      }
    >
      {freeze.isPending ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Snowflake className="w-3.5 h-3.5" />
      )}
      <span className="text-xs font-semibold tabular-nums">{available}</span>
    </Button>
  );
}
