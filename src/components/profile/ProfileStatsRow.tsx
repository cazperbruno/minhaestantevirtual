import { BookOpen, Star, Users, Flame, Target } from "lucide-react";

interface Props {
  total: number;
  read: number;
  avgRating: number;
  followers: number;
  following: number;
  streak: number;
  goalProgress?: number; // 0-100
}

export function ProfileStatsRow({ total, read, avgRating, followers, following, streak, goalProgress }: Props) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
      <Stat icon={<BookOpen className="w-4 h-4" />} value={total} label="Acervo" />
      <Stat icon={<BookOpen className="w-4 h-4 text-status-read" />} value={read} label="Lidos" />
      <Stat icon={<Star className="w-4 h-4 text-primary fill-primary" />} value={avgRating ? avgRating.toFixed(1) : "—"} label="Média" />
      <Stat icon={<Flame className="w-4 h-4 text-status-wishlist" />} value={streak} label="Streak" />
      <Stat icon={<Users className="w-4 h-4" />} value={followers} label="Seguidores" />
      <Stat
        icon={<Target className="w-4 h-4 text-primary" />}
        value={goalProgress !== undefined ? `${Math.round(goalProgress)}%` : following}
        label={goalProgress !== undefined ? "Meta ano" : "Seguindo"}
      />
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  return (
    <div className="glass rounded-xl p-2.5 sm:p-3 text-center min-w-0">
      <div className="flex items-center justify-center mb-1 text-muted-foreground">{icon}</div>
      <p className="font-display text-lg sm:text-xl font-bold tabular-nums truncate">{value}</p>
      <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wider truncate">{label}</p>
    </div>
  );
}
