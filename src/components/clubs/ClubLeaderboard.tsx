import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Trophy, Crown, Sparkles, Loader2, Flame, BookOpen, MessageCircle, Heart } from "lucide-react";
import { useClubLeaderboard, type LeaderboardRow } from "@/hooks/useClubLeaderboard";
import { profilePath } from "@/lib/profile-path";
import { cn } from "@/lib/utils";

const MEDAL = ["🥇", "🥈", "🥉"];

const ACHIEVEMENT_META: Record<string, { icon: string; tone: string }> = {
  Maratonista: { icon: "🏃", tone: "bg-orange-500/15 text-orange-500" },
  Conversador: { icon: "💬", tone: "bg-sky-500/15 text-sky-500" },
  Curador: { icon: "📚", tone: "bg-violet-500/15 text-violet-500" },
  Influenciador: { icon: "✨", tone: "bg-pink-500/15 text-pink-500" },
  Concluidor: { icon: "🏆", tone: "bg-emerald-500/15 text-emerald-500" },
};

interface Props {
  clubId: string;
  isMember: boolean;
  currentUserId?: string | null;
  /** Modo compacto = lista resumida (top 5). */
  compact?: boolean;
}

export function ClubLeaderboard({ clubId, isMember, currentUserId, compact = false }: Props) {
  const { data, isLoading } = useClubLeaderboard(clubId, isMember);

  if (!isMember) return null;

  if (isLoading) {
    return (
      <div className="glass rounded-2xl p-6 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  const list = data || [];
  const visible = compact ? list.slice(0, 5) : list;
  const myRank = currentUserId ? list.findIndex((r) => r.user_id === currentUserId) : -1;

  return (
    <section className="glass rounded-2xl p-4 md:p-5 space-y-3">
      <header className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold flex items-center gap-2">
          <Trophy className="w-4 h-4 text-primary" /> Ranking de leitura
        </h3>
        {myRank >= 0 && (
          <span className="text-xs text-muted-foreground">
            Você está em <span className="font-bold text-primary">#{myRank + 1}</span>
          </span>
        )}
      </header>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground italic text-center py-4">
          Sem pontuação ainda — comece a ler ou interagir!
        </p>
      ) : (
        <ol className="space-y-2">
          {visible.map((row, idx) => (
            <LeaderboardItem
              key={row.user_id}
              row={row}
              position={idx + 1}
              isMe={row.user_id === currentUserId}
            />
          ))}
        </ol>
      )}

      {compact && list.length > 5 && (
        <p className="text-[11px] text-center text-muted-foreground pt-1">
          Mostrando top 5 de {list.length}
        </p>
      )}
    </section>
  );
}

function LeaderboardItem({
  row,
  position,
  isMe,
}: {
  row: LeaderboardRow;
  position: number;
  isMe: boolean;
}) {
  const name = row.display_name || row.username || "Leitor";
  const link = profilePath({ id: row.user_id, username: row.username });
  const isPodium = position <= 3;

  return (
    <li
      className={cn(
        "flex items-center gap-3 p-2.5 rounded-xl border transition-colors",
        isMe
          ? "bg-primary/10 border-primary/40 ring-1 ring-primary/20"
          : isPodium
            ? "bg-card/50 border-border/60"
            : "bg-card/30 border-border/30 hover:bg-muted/30",
      )}
    >
      <div
        className={cn(
          "w-9 h-9 rounded-lg shrink-0 flex items-center justify-center text-base font-bold tabular-nums",
          isPodium ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        )}
        aria-hidden
      >
        {isPodium ? MEDAL[position - 1] : `#${position}`}
      </div>

      <Link to={link} className="shrink-0">
        <Avatar className="w-10 h-10 ring-1 ring-border/40 hover:ring-primary/60 transition">
          <AvatarImage src={row.avatar_url || undefined} />
          <AvatarFallback className="text-xs bg-gradient-gold text-primary-foreground">
            {name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Link to={link} className="text-sm font-semibold truncate hover:text-primary transition-colors">
            {name}
          </Link>
          {row.is_owner && <Crown className="w-3 h-3 text-primary shrink-0" aria-label="Dono" />}
          {isMe && (
            <span className="text-[10px] font-bold uppercase text-primary tracking-wider">
              você
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
          <span className="inline-flex items-center gap-0.5" title="Páginas lidas">
            <BookOpen className="w-3 h-3" /> {row.pages_read}
          </span>
          <span className="inline-flex items-center gap-0.5" title="Mensagens (30d)">
            <MessageCircle className="w-3 h-3" /> {row.messages_count}
          </span>
          <span className="inline-flex items-center gap-0.5" title="Reações recebidas">
            <Heart className="w-3 h-3" /> {row.reactions_received}
          </span>
        </div>

        {row.achievements && row.achievements.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {row.achievements.map((a) => {
              const meta = ACHIEVEMENT_META[a] || { icon: "✨", tone: "bg-muted text-foreground" };
              return (
                <Badge
                  key={a}
                  variant="secondary"
                  className={cn("text-[10px] px-1.5 py-0 h-4 gap-0.5 font-semibold", meta.tone)}
                >
                  <span aria-hidden>{meta.icon}</span> {a}
                </Badge>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-right shrink-0">
        <div className="text-base font-bold tabular-nums text-primary inline-flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5" />
          {row.total_points.toLocaleString("pt-BR")}
        </div>
        <div className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
          <Flame className="w-2.5 h-2.5" /> Nível {row.level}
        </div>
      </div>
    </li>
  );
}
