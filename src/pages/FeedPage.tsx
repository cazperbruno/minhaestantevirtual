import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BookCover } from "@/components/books/BookCover";
import { Rating } from "@/components/books/Rating";
import { Button } from "@/components/ui/button";
import { Heart, MessageSquare, Loader2 } from "lucide-react";
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
  created_at: string;
  book: any;
  profile: any;
  liked_by_me: boolean;
}

export default function FeedPage() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<FeedReview[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data: revs } = await supabase
      .from("reviews")
      .select("*, book:books(*)")
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(50);

    const list = revs || [];
    const userIds = [...new Set(list.map((r: any) => r.user_id))];
    const reviewIds = list.map((r: any) => r.id);

    const [{ data: profs }, { data: myLikes }] = await Promise.all([
      supabase.from("profiles").select("id,display_name,username,avatar_url,level").in("id", userIds),
      user
        ? supabase.from("review_likes").select("review_id").eq("user_id", user.id).in("review_id", reviewIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const profMap = new Map((profs || []).map((p: any) => [p.id, p]));
    const likedSet = new Set((myLikes || []).map((l: any) => l.review_id));

    setReviews(
      list.map((r: any) => ({
        ...r,
        profile: profMap.get(r.user_id),
        liked_by_me: likedSet.has(r.id),
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [user]);

  const toggleLike = async (rev: FeedReview) => {
    if (!user) {
      toast.error("Entre para curtir");
      return;
    }
    // optimistic
    setReviews((prev) =>
      prev.map((r) =>
        r.id === rev.id
          ? {
              ...r,
              liked_by_me: !r.liked_by_me,
              likes_count: r.likes_count + (r.liked_by_me ? -1 : 1),
            }
          : r,
      ),
    );
    if (rev.liked_by_me) {
      await supabase.from("review_likes").delete().eq("review_id", rev.id).eq("user_id", user.id);
    } else {
      await supabase.from("review_likes").insert({ review_id: rev.id, user_id: user.id });
    }
  };

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 pb-16 max-w-2xl mx-auto">
        <header className="mb-8 animate-fade-in">
          <h1 className="font-display text-4xl font-bold text-gradient-gold">Feed</h1>
          <p className="text-muted-foreground mt-1">Resenhas da comunidade</p>
        </header>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center">
            <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhuma resenha ainda. Seja o primeiro!</p>
          </div>
        ) : (
          <ul className="space-y-5">
            {reviews.map((r) => (
              <li key={r.id} className="glass rounded-2xl p-5 animate-fade-in">
                <div className="flex items-start gap-3 mb-3">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={r.profile?.avatar_url} />
                    <AvatarFallback className="bg-gradient-gold text-primary-foreground text-sm font-display">
                      {(r.profile?.display_name || "?").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{r.profile?.display_name || "Leitor"}</p>
                    <p className="text-xs text-muted-foreground">
                      Nível {r.profile?.level ?? 1} ·{" "}
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>
                </div>

                <Link to={`/livro/${r.book_id}`} className="flex gap-3 mb-3 group">
                  <BookCover book={r.book} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-semibold leading-tight group-hover:text-primary transition-colors">
                      {r.book?.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{r.book?.authors?.[0]}</p>
                    {r.rating && <Rating value={r.rating} readOnly className="mt-2" />}
                  </div>
                </Link>

                <p className="text-sm leading-relaxed whitespace-pre-line">{r.content}</p>

                <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border/40">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleLike(r)}
                    className={`gap-2 ${r.liked_by_me ? "text-primary" : "text-muted-foreground"}`}
                  >
                    <Heart className={`w-4 h-4 ${r.liked_by_me ? "fill-primary" : ""}`} />
                    {r.likes_count}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
