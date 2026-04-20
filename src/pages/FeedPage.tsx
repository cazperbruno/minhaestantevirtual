import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BookCover } from "@/components/books/BookCover";
import { Rating } from "@/components/books/Rating";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FollowButton } from "@/components/social/FollowButton";
import { Skeleton } from "@/components/ui/skeleton";
import { CommentsThread } from "@/components/social/CommentsThread";
import { Heart, MessageSquare, Users, Sparkles, Search, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { profilePath } from "@/lib/profile-path";
import { useFeed, useToggleReviewLike, FeedReview } from "@/hooks/useFeed";
import { usePublicRecommendations } from "@/hooks/useRecommendations";
import { RecommendationCard } from "@/components/books/RecommendationCard";

export default function FeedPage() {
  const [tab, setTab] = useState<"all" | "following">("all");
  const {
    data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useFeed(tab);
  const toggleLike = useToggleReviewLike(tab);
  const { data: recsData } = usePublicRecommendations();
  const recs = useMemo(() => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const p of recsData?.pages ?? []) {
      for (const r of p.items) {
        if (!seen.has(r.id)) { seen.add(r.id); out.push(r); }
      }
    }
    return out.slice(0, 5); // só os 5 mais recentes no topo
  }, [recsData]);

  // Achata + dedupe (realtime pode causar overlap entre páginas).
  const reviews = useMemo<FeedReview[]>(() => {
    const seen = new Set<string>();
    const out: FeedReview[] = [];
    for (const page of data?.pages ?? []) {
      for (const r of page.items) {
        if (!seen.has(r.id)) {
          seen.add(r.id);
          out.push(r);
        }
      }
    }
    return out;
  }, [data]);

  // IntersectionObserver — dispara fetch quando sentinela entra na viewport.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 md:pt-12 pb-20 max-w-2xl mx-auto">
        <header className="mb-6 animate-fade-in">
          <h1 className="font-display text-4xl md:text-5xl font-bold">Feed</h1>
          <p className="text-muted-foreground mt-1.5 text-sm md:text-base">
            Resenhas frescas da comunidade leitora
          </p>
        </header>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mb-6 sticky top-0 z-10 -mx-5 px-5 md:mx-0 md:px-0 py-2 bg-background/85 backdrop-blur-xl border-b border-border/30">
          <TabsList className="grid grid-cols-2 max-w-xs">
            <TabsTrigger value="all" className="gap-2"><MessageSquare className="w-3.5 h-3.5" /> Todos</TabsTrigger>
            <TabsTrigger value="following" className="gap-2"><Users className="w-3.5 h-3.5" /> Seguindo</TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === "all" && recs.length > 0 && (
          <section className="mb-6 space-y-4">
            <h2 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-primary" /> Recomendações da comunidade
            </h2>
            <ul className="space-y-4">
              {recs.map((r) => (
                <li key={r.id}><RecommendationCard rec={r} /></li>
              ))}
            </ul>
          </section>
        )}

        {isLoading ? (
          <ul className="space-y-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="glass rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-2.5 w-24" />
                  </div>
                </div>
                <div className="flex gap-3">
                  <Skeleton className="w-16 h-24 rounded-md" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
              </li>
            ))}
          </ul>
        ) : reviews.length === 0 ? (
          <EmptyFeed tab={tab} />
        ) : (
          <>
            <ul className="space-y-5">
              {reviews.map((r) => (
                <li key={r.id} className="glass rounded-2xl p-5 animate-fade-in hover:border-primary/30 transition-colors">
                  <div className="flex items-start gap-3 mb-4">
                    <Link to={profilePath(r.profile)} className="shrink-0">
                      <Avatar className="w-10 h-10 ring-2 ring-transparent hover:ring-primary/40 transition-all">
                        <AvatarImage src={r.profile?.avatar_url} />
                        <AvatarFallback className="bg-gradient-gold text-primary-foreground text-sm font-display">
                          {(r.profile?.display_name || "?").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link to={profilePath(r.profile)} className="font-semibold text-sm truncate hover:text-primary transition-colors block leading-tight">
                        {r.profile?.display_name || "Leitor"}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        Nível {r.profile?.level ?? 1} ·{" "}
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                    <FollowButton targetUserId={r.user_id} />
                  </div>

                  <Link to={`/livro/${r.book_id}`} className="flex gap-4 mb-4 group/book">
                    <BookCover book={r.book} size="sm" />
                    <div className="flex-1 min-w-0 self-center">
                      <p className="font-display font-semibold leading-tight group-hover/book:text-primary transition-colors">
                        {r.book?.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{r.book?.authors?.[0]}</p>
                      {r.rating && <Rating value={r.rating} readOnly className="mt-2" size={14} />}
                    </div>
                  </Link>

                  <p className="text-sm leading-relaxed whitespace-pre-line text-foreground/90">{r.content}</p>

                  <div className="flex items-center gap-1 mt-4 pt-3 border-t border-border/40">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleLike.mutate(r)}
                      className={`gap-2 transition-colors ${r.liked_by_me ? "text-primary" : "text-muted-foreground"}`}
                    >
                      <Heart className={`w-4 h-4 transition-all ${r.liked_by_me ? "fill-primary scale-110" : ""}`} />
                      <span className="tabular-nums">{r.likes_count}</span>
                    </Button>
                    <CommentsThread reviewId={r.id} initialCount={r.comments_count || 0} />
                  </div>
                </li>
              ))}
            </ul>

            {/* Sentinela do IntersectionObserver */}
            <div ref={sentinelRef} className="h-10" aria-hidden />

            {isFetchingNextPage && (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            )}
            {!hasNextPage && reviews.length >= 20 && (
              <p className="text-center text-xs text-muted-foreground italic py-8">
                Você chegou ao fim ✨
              </p>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function EmptyFeed({ tab }: { tab: "all" | "following" }) {
  return (
    <div className="text-center py-16 px-6 max-w-md mx-auto animate-fade-in">
      <div className="w-20 h-20 rounded-3xl bg-gradient-spine border border-border mx-auto mb-5 flex items-center justify-center shadow-book">
        {tab === "following"
          ? <Users className="w-9 h-9 text-primary/60" />
          : <Sparkles className="w-9 h-9 text-primary/60" />}
      </div>
      <h2 className="font-display text-2xl font-semibold mb-2">
        {tab === "following" ? "Você ainda não segue ninguém" : "O feed está silencioso"}
      </h2>
      <p className="text-muted-foreground text-sm mb-6">
        {tab === "following"
          ? "Encontre leitores e siga suas resenhas para ver tudo aqui."
          : "Seja a primeira pessoa a publicar uma resenha hoje."}
      </p>
      <Link to={tab === "following" ? "/ranking" : "/buscar"}>
        <Button variant="hero" className="gap-2">
          {tab === "following" ? <><Users className="w-4 h-4" /> Descobrir leitores</>
            : <><Search className="w-4 h-4" /> Buscar livros</>}
        </Button>
      </Link>
    </div>
  );
}
