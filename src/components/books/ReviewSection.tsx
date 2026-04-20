import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Rating } from "./Rating";
import { Heart, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { checkAchievements } from "@/lib/gamification";
import { awardXp } from "@/lib/xp";
import { ReviewListSkeleton } from "@/components/ui/skeletons";

interface Review {
  id: string;
  user_id: string;
  rating: number | null;
  content: string;
  likes_count: number;
  created_at: string;
  profile?: any;
  liked_by_me?: boolean;
}

export function ReviewSection({ bookId }: { bookId: string }) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [text, setText] = useState("");
  const [rating, setRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data: revs } = await supabase
      .from("reviews")
      .select("*")
      .eq("book_id", bookId)
      .eq("is_public", true)
      .order("created_at", { ascending: false });
    const list = (revs || []) as Review[];
    const userIds = [...new Set(list.map((r) => r.user_id))];
    const ids = list.map((r) => r.id);
    const [{ data: profs }, { data: likes }] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("id,display_name,avatar_url,level").in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      user && ids.length
        ? supabase.from("review_likes").select("review_id").eq("user_id", user.id).in("review_id", ids)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const map = new Map((profs || []).map((p: any) => [p.id, p]));
    const likedSet = new Set((likes || []).map((l: any) => l.review_id));
    const enriched = list.map((r) => ({ ...r, profile: map.get(r.user_id), liked_by_me: likedSet.has(r.id) }));
    setReviews(enriched);
    const mine = enriched.find((r) => r.user_id === user?.id) || null;
    setMyReview(mine);
    if (mine) {
      setText(mine.content);
      setRating(mine.rating ?? 0);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [bookId, user]);

  const submit = async () => {
    if (!user) return toast.error("Entre para publicar");
    if (text.trim().length < 3) return toast.error("Escreva ao menos 3 caracteres");
    setSubmitting(true);
    const payload = {
      user_id: user.id,
      book_id: bookId,
      content: text.trim(),
      rating: rating || null,
      is_public: true,
    };
    const { error } = await supabase
      .from("reviews")
      .upsert(payload, { onConflict: "user_id,book_id" });
    if (error) {
      toast.error("Erro ao publicar");
    } else {
      toast.success(myReview ? "Resenha atualizada" : "Resenha publicada");
      // XP só em resenha nova (não em update)
      if (!myReview) void awardXp(user.id, "write_review");
      await checkAchievements(user.id);
      await load();
    }
    setSubmitting(false);
  };

  const toggleLike = async (rev: Review) => {
    if (!user) return toast.error("Entre para curtir");
    setReviews((prev) =>
      prev.map((r) =>
        r.id === rev.id
          ? { ...r, liked_by_me: !r.liked_by_me, likes_count: r.likes_count + (r.liked_by_me ? -1 : 1) }
          : r,
      ),
    );
    if (rev.liked_by_me) {
      await supabase.from("review_likes").delete().eq("review_id", rev.id).eq("user_id", user.id);
    } else {
      await supabase.from("review_likes").insert({ review_id: rev.id, user_id: user.id });
      void awardXp(user.id, "like_review", { silent: true });
    }
  };

  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl font-semibold mb-4 flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-primary" /> Resenhas
      </h2>

      {user && (
        <div className="glass rounded-2xl p-5 mb-6 space-y-3">
          <p className="text-sm text-muted-foreground">{myReview ? "Editar sua resenha" : "Compartilhe o que achou"}</p>
          <Rating value={rating} onChange={setRating} />
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Sua opinião..."
          />
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">{text.length}/2000</span>
            <Button variant="hero" onClick={submit} disabled={submitting}>
              {myReview ? "Atualizar" : "Publicar"}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <ReviewListSkeleton count={3} />
      ) : reviews.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center animate-fade-in">
          <MessageSquare className="w-8 h-8 mx-auto text-primary/40 mb-3" />
          <p className="font-display text-lg">Nenhuma resenha ainda</p>
          <p className="text-muted-foreground text-sm mt-1">Seja a primeira pessoa a opinar sobre este livro.</p>
        </div>
      ) : (
        <ul className="space-y-4 animate-stagger">
          {reviews.map((r) => (
            <li key={r.id} className="glass rounded-xl p-4">
              <div className="flex items-start gap-3 mb-2">
                <Avatar className="w-9 h-9">
                  <AvatarImage src={r.profile?.avatar_url} />
                  <AvatarFallback className="bg-gradient-gold text-primary-foreground text-xs">
                    {(r.profile?.display_name || "?").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{r.profile?.display_name || "Leitor"}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}
                  </p>
                </div>
                {r.rating && <Rating value={r.rating} readOnly />}
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-line">{r.content}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleLike(r)}
                className={`gap-2 mt-2 ${r.liked_by_me ? "text-primary" : "text-muted-foreground"}`}
              >
                <Heart className={`w-4 h-4 ${r.liked_by_me ? "fill-primary" : ""}`} />
                {r.likes_count}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
