import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BookCover } from "@/components/books/BookCover";
import { Button } from "@/components/ui/button";
import { CommentsThread } from "@/components/social/CommentsThread";
import { Heart, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { profilePath } from "@/lib/profile-path";
import { FeedRecommendation, useToggleRecommendationLike } from "@/hooks/useRecommendations";

export function RecommendationCard({ rec }: { rec: FeedRecommendation }) {
  const toggleLike = useToggleRecommendationLike();

  return (
    <article className="glass rounded-2xl p-5 animate-fade-in border border-primary/15 bg-gradient-to-br from-primary/5 to-transparent">
      <header className="flex items-start gap-3 mb-3">
        <Link to={profilePath(rec.profile)} className="shrink-0">
          <Avatar className="w-9 h-9 ring-2 ring-transparent hover:ring-primary/40 transition-all">
            <AvatarImage src={rec.profile?.avatar_url} />
            <AvatarFallback className="bg-gradient-gold text-primary-foreground text-sm font-display">
              {(rec.profile?.display_name || "?").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-sm leading-tight">
            <Link to={profilePath(rec.profile)} className="font-semibold hover:text-primary transition-colors">
              {rec.profile?.display_name || "Leitor"}
            </Link>
            <span className="text-muted-foreground"> recomendou um livro</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-primary" />
            {formatDistanceToNow(new Date(rec.created_at), { addSuffix: true, locale: ptBR })}
          </p>
        </div>
      </header>

      <Link to={`/livro/${rec.book_id}`} className="flex gap-4 mb-3 group/book">
        <BookCover book={rec.book} size="sm" />
        <div className="flex-1 min-w-0 self-center">
          <p className="font-display font-semibold leading-tight group-hover/book:text-primary transition-colors">
            {rec.book?.title}
          </p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{rec.book?.authors?.[0]}</p>
        </div>
      </Link>

      {rec.message && (
        <p className="text-sm leading-relaxed whitespace-pre-line text-foreground/90 mb-3">
          “{rec.message}”
        </p>
      )}

      <div className="flex items-center gap-1 pt-3 border-t border-border/40">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toggleLike.mutate(rec)}
          className={`gap-2 transition-colors ${rec.liked_by_me ? "text-primary" : "text-muted-foreground"}`}
        >
          <Heart className={`w-4 h-4 transition-all ${rec.liked_by_me ? "fill-primary scale-110" : ""}`} />
          <span className="tabular-nums">{rec.likes_count}</span>
        </Button>
        <CommentsThread targetId={rec.id} target="recommendation" initialCount={rec.comments_count || 0} />
      </div>
    </article>
  );
}
