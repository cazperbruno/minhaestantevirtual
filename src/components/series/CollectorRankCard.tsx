/**
 * Card mostra ranking colecionador de uma série + barra visual destacada.
 */
import { Trophy, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  myCompletionPct: number;
  collectors?: number;
  avgCompletion?: number;
  missingCount: number | null;
  total: number;
}

export function CollectorRankCard({ myCompletionPct, collectors, avgCompletion, missingCount, total }: Props) {
  const ahead = avgCompletion != null && myCompletionPct > avgCompletion;
  return (
    <div className="rounded-2xl border bg-gradient-to-br from-card via-card to-primary/5 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-lg flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" /> Modo colecionador
        </h3>
        {collectors != null && (
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Users className="w-3 h-3" /> {collectors} colecionador{collectors !== 1 ? "es" : ""}
          </span>
        )}
      </div>

      {/* Barra visual destacada */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-display font-bold tabular-nums">
            {myCompletionPct}%
          </span>
          <span className="text-xs text-muted-foreground">da coleção</span>
        </div>
        <div className="h-3 rounded-full bg-muted/60 overflow-hidden relative">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700",
              myCompletionPct >= 100
                ? "bg-gradient-to-r from-primary via-primary/80 to-primary animate-pulse shadow-[0_0_12px_hsl(var(--primary)/0.6)]"
                : "bg-gradient-to-r from-primary/60 via-primary to-primary",
            )}
            style={{ width: `${myCompletionPct}%` }}
          />
          {avgCompletion != null && avgCompletion > 0 && avgCompletion < 100 && (
            <div
              className="absolute top-0 bottom-0 w-px bg-foreground/40"
              style={{ left: `${avgCompletion}%` }}
              title={`Média: ${avgCompletion}%`}
            />
          )}
        </div>
        {avgCompletion != null && (
          <p className="text-[11px] text-muted-foreground">
            Média global:{" "}
            <span className={cn("font-semibold", ahead ? "text-primary" : "")}>
              {avgCompletion}%
            </span>
            {ahead && " — você está acima da média! 🚀"}
          </p>
        )}
      </div>

      {missingCount != null && missingCount > 0 && (
        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          <span className="text-muted-foreground">Faltam </span>
          <span className="font-bold text-foreground tabular-nums">{missingCount}</span>
          <span className="text-muted-foreground"> volume{missingCount !== 1 ? "s" : ""} para completar </span>
          <span className="text-foreground">({total} no total)</span>
        </div>
      )}
    </div>
  );
}
