import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMyRankPosition } from "@/hooks/useMyRankPosition";
import { Trophy, Flame, ChevronRight, Crown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function ordinal(pos: number): string {
  return `${pos}º`;
}

function podiumClass(pos: number) {
  if (pos === 1) return "text-amber-400";
  if (pos === 2) return "text-slate-300";
  if (pos === 3) return "text-orange-400";
  return "text-foreground";
}

export function RankPositionCard() {
  const { user } = useAuth();
  const { data, isLoading } = useMyRankPosition(user?.id);

  return (
    <Link
      to="/ranking"
      className="block glass rounded-3xl p-5 border border-border/40 hover:border-primary/40 transition-all group"
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-lg font-bold flex items-center gap-2">
          <Crown className="w-5 h-5 text-primary" /> Sua posição
        </h2>
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition" />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <RankCell
            icon={<Flame className="w-4 h-4 text-orange-400" />}
            label="Semanal"
            position={data?.weekly?.position ?? null}
            value={data?.weekly?.weekly_xp ?? 0}
            valueLabel="XP esta semana"
            xpToNext={data?.weekly?.xpToNext ?? null}
          />
          <RankCell
            icon={<Trophy className="w-4 h-4 text-primary" />}
            label="Global"
            position={data?.global?.position ?? null}
            value={data?.global?.xp ?? 0}
            valueLabel={`XP · nv ${data?.global?.level ?? 1}`}
            xpToNext={data?.global?.xpToNext ?? null}
          />
        </div>
      )}
    </Link>
  );
}

function RankCell({
  icon, label, position, value, valueLabel, xpToNext,
}: {
  icon: React.ReactNode;
  label: string;
  position: number | null;
  value: number;
  valueLabel: string;
  xpToNext: number | null;
}) {
  return (
    <div className="rounded-2xl bg-card/40 p-3 border border-border/30">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {label}
        </span>
      </div>
      {position == null ? (
        <p className="font-display text-lg font-bold text-muted-foreground">—</p>
      ) : (
        <p className={cn("font-display text-2xl font-black tabular-nums", podiumClass(position))}>
          {ordinal(position)}
        </p>
      )}
      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
        +{value} {valueLabel}
      </p>
      {xpToNext != null && xpToNext > 0 && (
        <p className="text-[10px] text-primary mt-0.5 font-medium">
          +{xpToNext} XP p/ subir
        </p>
      )}
    </div>
  );
}
