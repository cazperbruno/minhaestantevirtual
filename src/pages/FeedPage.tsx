import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BookCover } from "@/components/books/BookCover";
import { Rating } from "@/components/books/Rating";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FollowButton } from "@/components/social/FollowButton";
import { Skeleton } from "@/components/ui/skeleton";
import { CommentsThread } from "@/components/social/CommentsThread";
import { Heart, MessageSquare, Users, Sparkles, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface FeedReview {
  id: string;
  user_id: string;
  book_id: string;
  rating: number | null;
  content: string;
  likes_count: number;
  comments_count?: number;
  created_at: string;
  book: any;
  profile: any;
  liked_by_me: boolean;
  i_follow: boolean;
}

export default function FeedPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"all" | "following">("all");
  const [reviews, setReviews] = useState<FeedReview[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);

    let followingIds: string[] = [];
    if (user) {
      const { data: f } = await supabase.from("follows").select("following_id").eq("follower_id", user.id);
      followingIds = (f || []).map((x: any) => x.following_id);
    }

    let q = supabase
      .from("reviews")
      .select("*, book:books(*)")
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(50);

    if (tab === "following") {
      if (followingIds.length === 0) {
        setReviews([]);
        setLoading(false);
        return;
      }
      q = q.in("user_id", followingIds);
    }

    const { data: revs } = await q;
    const list = revs || [];
    const userIds = [...new Set(list.map((r: any) => r.user_id))];
    const reviewIds = list.map((r: any) => r.id);

    const [{ data: profs }, { data: myLikes }] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("id,display_name,username,avatar_url,level").in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      user && reviewIds.length
        ? supabase.from("review_likes").select("review_id").eq("user_id", user.id).in("review_id", reviewIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const profMap = new Map((profs || []).map((p: any) => [p.id, p]));
    const likedSet = new Set((myLikes || []).map((l: any) => l.review_id));
    const followSet = new Set(followingIds);

    setReviews(
      list.map((r: any) => ({
        ...r,
        profile: profMap.get(r.user_id),
        liked_by_me: likedSet.has(r.id),
        i_follow: followSet.has(r.user_id),
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tab]);

  const toggleLike = async (rev: FeedReview) => {
    if (!user) {
      toast.error("Entre para curtir");
      return;
    }
    const wasLiked = rev.liked_by_me;
    // optimistic
    setReviews((prev) =>
      prev.map((r) =>
        r.id === rev.id
          ? { ...r, liked_by_me: !wasLiked, likes_count: r.likes_count + (wasLiked ? -1 : 1) }
          : r,
      ),
    );
    const { error } = wasLiked
      ? await supabase.from("review_likes").delete().eq("review_id", rev.id).eq("user_id", user.id)
      : await supabase.from("review_likes").insert({ review_id: rev.id, user_id: user.id });
    if (error) {
      // rollback
      setReviews((prev) =>
        prev.map((r) =>
          r.id === rev.id
            ? { ...r, liked_by_me: wasLiked, likes_count: r.likes_count + (wasLiked ? 1 : -1) }
            : r,
        ),
      );
      toast.error("Não foi possível atualizar o like");
    }
  };

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 md:pt-12 pb-20 max-w-2xl mx-auto">
        <header className="mb-6 animate-fade-in">
          <h1 className="font-display text-4xl md:text-5xl font-bold">Feed</h1>
          <p className="text-muted-foreground mt-1.5 text-sm md:text-base">
            Resenhas frescas da comunidade leitora
          </p>
        </header>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mb-6 sticky top-0 z-10 -mx-5 px-5 md:mx-0 md:px-0 py-2 bg-background/80 backdrop-blur-md">
          <TabsList className="grid grid-cols-2 max-w-xs">
            <TabsTrigger value="all" className="gap-2"><MessageSquare className="w-3.5 h-3.5" /> Todos</TabsTrigger>
            <TabsTrigger value="following" className="gap-2"><Users className="w-3.5 h-3.5" /> Seguindo</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
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
          <ul className="space-y-5">
            {reviews.map((r) => (
              <li key={r.id} className="glass rounded-2xl p-5 animate-fade-in hover:border-primary/30 transition-colors">
                <div className="flex items-start gap-3 mb-4">
                  <Link to={`/u/${r.profile?.username}`} className="shrink-0">
                    <Avatar className="w-10 h-10 ring-2 ring-transparent hover:ring-primary/40 transition-all">
                      <AvatarImage src={r.profile?.avatar_url} />
                      <AvatarFallback className="bg-gradient-gold text-primary-foreground text-sm font-display">
                        {(r.profile?.display_name || "?").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link to={`/u/${r.profile?.username}`} className="font-semibold text-sm truncate hover:text-primary transition-colors block leading-tight">
                      {r.profile?.display_name || "Leitor"}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      Nível {r.profile?.level ?? 1} ·{" "}
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>
                  <FollowButton targetUserId={r.user_id} initiallyFollowing={r.i_follow} />
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
                    onClick={() => toggleLike(r)}
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
