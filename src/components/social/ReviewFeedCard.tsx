import { useRef } from "react";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BookCover } from "@/components/books/BookCover";
import { Rating } from "@/components/books/Rating";
import { Button } from "@/components/ui/button";
import { FollowButton } from "@/components/social/FollowButton";
import { CommentsThread } from "@/components/social/CommentsThread";
import { QuickSaveButton } from "@/components/books/QuickSaveButton";
import { LikersAvatars } from "@/components/social/LikersAvatars";
import { ReviewActionsMenu } from "@/components/social/ReviewActionsMenu";
import { Heart, Share2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { profilePath } from "@/lib/profile-path";
import { haptic } from "@/lib/haptics";
import { toast } from "sonner";
import type { FeedReview } from "@/hooks/useFeed";
import { cn } from "@/lib/utils";

interface Props {
  review: FeedReview;
  onToggleLike: (r: FeedReview) => void;
}

/**
 * Card de resenha estilo Instagram + Goodreads.
 * - Double-tap na capa curte (com burst visual + haptic).
 * - Botão de salvar inline (wishlist) + compartilhar nativo.
 * - Layout otimizado: capa esquerda + texto direita, ações em barra inferior.
 */
export function ReviewFeedCard({ review: r, onToggleLike }: Props) {
  const burstRef = useRef<HTMLDivElement>(null);
  const lastTap = useRef(0);

  const triggerLikeBurst = () => {
    const el = burstRef.current;
    if (!el) return;
    el.classList.remove("animate-heart-burst");
    void el.offsetWidth; // restart anim
    el.classList.add("animate-heart-burst");
  };

  const handleCoverTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      // double tap
      if (!r.liked_by_me) {
        haptic("success");
        triggerLikeBurst();
        onToggleLike(r);
      } else {
        triggerLikeBurst();
      }
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  };

  const onShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    const url = `${window.location.origin}/livro/${r.book_id}`;
    const text = `"${r.book?.title}" — ${r.profile?.display_name || "Leitor"} no Readify`;
    haptic("tap");
    try {
      if (navigator.share) {
        await navigator.share({ title: r.book?.title, text, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copiado");
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <ReviewActionsMenu review={r}>
      {(longPress) => (
        <article
          {...longPress}
          className="glass rounded-2xl p-5 animate-fade-in hover:border-primary/30 transition-colors touch-manipulation"
        >
      {/* Header: avatar + nome + follow */}
      <header className="flex items-start gap-3 mb-4">
        <Link to={profilePath(r.profile)} className="shrink-0">
          <Avatar className="w-10 h-10 ring-2 ring-transparent hover:ring-primary/40 transition-all">
            <AvatarImage src={r.profile?.avatar_url} />
            <AvatarFallback className="bg-gradient-gold text-primary-foreground text-sm font-display">
              {(r.profile?.display_name || "?").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>
        <div className="flex-1 min-w-0">
          <Link
            to={profilePath(r.profile)}
            className="font-semibold text-sm truncate hover:text-primary transition-colors block leading-tight"
          >
            {r.profile?.display_name || "Leitor"}
          </Link>
          <p className="text-xs text-muted-foreground">
            Nível {r.profile?.level ?? 1} ·{" "}
            {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}
          </p>
        </div>
        <FollowButton targetUserId={r.user_id} />
      </header>

      {/* Livro: capa com double-tap + meta */}
      <div className="flex gap-4 mb-4">
        <Link
          to={`/livro/${r.book_id}`}
          onClick={(e) => {
            // Permite double-tap sem navegar imediatamente
            if (Date.now() - lastTap.current < 300 && lastTap.current !== 0) {
              e.preventDefault();
            }
            handleCoverTap();
          }}
          className="relative shrink-0 group/cover select-none"
          aria-label={`Abrir ${r.book?.title}`}
        >
          <BookCover book={r.book} size="sm" />
          {/* Burst de coração no double-tap */}
          <div
            ref={burstRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0"
          >
            <Heart className="w-12 h-12 text-primary fill-primary drop-shadow-2xl" />
          </div>
          {/* Quick save flutuante */}
          <div className="absolute top-1 right-1">
            <QuickSaveButton book={r.book} floating={false} className="w-7 h-7" />
          </div>
        </Link>

        <Link to={`/livro/${r.book_id}`} className="flex-1 min-w-0 self-center group/info">
          <p className="font-display font-semibold leading-tight group-hover/info:text-primary transition-colors line-clamp-2">
            {r.book?.title}
          </p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{r.book?.authors?.[0]}</p>
          {r.rating && <Rating value={r.rating} readOnly className="mt-2" size={14} />}
        </Link>
      </div>

      {/* Texto da resenha */}
      <p className="text-sm leading-relaxed whitespace-pre-line text-foreground/90">{r.content}</p>

      {/* Avatares dos likers */}
      <LikersAvatars reviewId={r.id} totalLikes={r.likes_count} className="mt-3" />

      {/* Barra de ações */}
      <div className="flex items-center gap-1 mt-4 pt-3 border-t border-border/40">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            triggerLikeBurst();
            onToggleLike(r);
          }}
          aria-label={r.liked_by_me ? "Descurtir resenha" : "Curtir resenha"}
          aria-pressed={r.liked_by_me}
          className={cn(
            "gap-2 transition-colors",
            r.liked_by_me ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Heart
            aria-hidden="true"
            className={cn(
              "w-4 h-4 transition-all",
              r.liked_by_me && "fill-primary scale-110",
            )}
          />
          <span className="tabular-nums">{r.likes_count}</span>
        </Button>
        <CommentsThread reviewId={r.id} initialCount={r.comments_count || 0} />
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={onShare}
          aria-label="Compartilhar"
          className="text-muted-foreground hover:text-primary"
        >
          <Share2 className="w-4 h-4" />
        </Button>
      </div>
        </article>
      )}
    </ReviewActionsMenu>
  );
}
