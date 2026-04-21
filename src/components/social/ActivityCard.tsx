import { memo } from "react";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { BookCover } from "@/components/books/BookCover";
import { CommentsThread } from "@/components/social/CommentsThread";
import {
  Heart, BookPlus, BookOpen, CheckCircle2, Star, UserPlus, Trophy, Library,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { profilePath } from "@/lib/profile-path";
import { cn } from "@/lib/utils";
import type { ActivityItem, ActivityKind } from "@/hooks/useActivityFeed";

interface Props {
  activity: ActivityItem;
  onToggleLike: (a: ActivityItem) => void;
}

const KIND_META: Record<ActivityKind, { icon: any; label: (a: ActivityItem) => string; color: string }> = {
  book_added: { icon: BookPlus, label: () => "adicionou um livro à biblioteca", color: "text-primary" },
  started_reading: { icon: BookOpen, label: () => "começou a ler", color: "text-blue-500" },
  finished_reading: { icon: CheckCircle2, label: () => "terminou de ler", color: "text-emerald-500" },
  book_rated: {
    icon: Star,
    label: (a) => `avaliou com ${a.meta?.rating ?? "—"}★`,
    color: "text-amber-500",
  },
  followed_user: { icon: UserPlus, label: () => "começou a seguir", color: "text-pink-500" },
  completed_series: { icon: Library, label: () => "completou uma série", color: "text-violet-500" },
  leveled_up: { icon: Trophy, label: (a) => `subiu para o nível ${a.meta?.level ?? ""}`, color: "text-yellow-500" },
  ranked_up: { icon: Trophy, label: () => "subiu no ranking", color: "text-orange-500" },
  book_lent: { icon: BookPlus, label: () => "emprestou um livro", color: "text-muted-foreground" },
};

function ActivityCardImpl({ activity: a, onToggleLike }: Props) {
  const meta = KIND_META[a.kind] ?? KIND_META.book_added;
  const Icon = meta.icon;
  const profile = a.profile;
  const initial = (profile?.display_name?.[0] || profile?.username?.[0] || "?").toUpperCase();

  return (
    <article className="glass rounded-2xl p-4 space-y-3 animate-fade-in">
      <header className="flex items-center gap-3">
        <Link to={profilePath(profile)} className="shrink-0">
          <Avatar className="w-10 h-10">
            <AvatarImage src={profile?.avatar_url ?? undefined} alt="" />
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-sm leading-tight">
            <Link to={profilePath(profile)} className="font-semibold hover:underline">
              {profile?.display_name || profile?.username || "Leitor"}
            </Link>
            <span className="text-muted-foreground"> {meta.label(a)}</span>
            {a.kind === "followed_user" && a.target_profile && (
              <Link to={profilePath(a.target_profile)} className="font-semibold hover:underline ml-1">
                {a.target_profile.display_name || a.target_profile.username}
              </Link>
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <Icon className={cn("w-3 h-3", meta.color)} />
            {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
          </p>
        </div>
      </header>

      {a.book && (
        <Link to={`/livro/${a.book.id}`} className="flex gap-3 group">
          <BookCover book={a.book} className="w-16 h-24 rounded-md shadow-book shrink-0" />
          <div className="flex-1 min-w-0 py-1">
            <p className="font-display text-base font-semibold line-clamp-2 group-hover:text-primary transition-colors">
              {a.book.title}
            </p>
            {a.book.authors?.length > 0 && (
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                {a.book.authors.join(", ")}
              </p>
            )}
          </div>
        </Link>
      )}

      <div className="flex items-center gap-1 pt-1 -mb-1">
        <Button
          variant="ghost" size="sm"
          className={cn("gap-1.5 h-8 px-2", a.liked_by_me && "text-red-500")}
          onClick={() => onToggleLike(a)}
          aria-label={a.liked_by_me ? "Remover curtida" : "Curtir"}
        >
          <Heart className={cn("w-4 h-4", a.liked_by_me && "fill-current")} />
          <span className="text-xs tabular-nums">{a.likes_count}</span>
        </Button>
        <CommentsThread targetId={a.id} target="activity" initialCount={a.comments_count} />
      </div>
    </article>
  );
}

function areEqual(prev: Props, next: Props) {
  return (
    prev.activity.id === next.activity.id &&
    prev.activity.likes_count === next.activity.likes_count &&
    prev.activity.comments_count === next.activity.comments_count &&
    prev.activity.liked_by_me === next.activity.liked_by_me &&
    prev.onToggleLike === next.onToggleLike
  );
}

export const ActivityCard = memo(ActivityCardImpl, areEqual);
