import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BookCard } from "@/components/books/BookCard";
import { AchievementsPanel } from "@/components/profile/AchievementsPanel";
import { FollowButton } from "@/components/social/FollowButton";
import { useAuth } from "@/hooks/useAuth";
import { Trophy, BookOpen, Star, Loader2, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Rating } from "@/components/books/Rating";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function PublicProfile() {
  const { username } = useParams();
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [library, setLibrary] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [stats, setStats] = useState({ followers: 0, following: 0, iFollow: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!username) return;
    (async () => {
      setLoading(true);
      const { data: p } = await supabase
        .from("profiles").select("*").eq("username", username).maybeSingle();
      if (!p) { setLoading(false); return; }

      const [{ data: lib }, { data: revs }, { count: followers }, { count: following }, { data: myFollow }] = await Promise.all([
        supabase
          .from("user_books")
          .select("*, book:books(*)")
          .eq("user_id", p.id)
          .eq("is_public", true)
          .order("updated_at", { ascending: false })
          .limit(24),
        supabase
          .from("reviews")
          .select("*, book:books(id,title,authors,cover_url)")
          .eq("user_id", p.id)
          .eq("is_public", true)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", p.id),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", p.id),
        user
          ? supabase.from("follows").select("*").eq("follower_id", user.id).eq("following_id", p.id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      setProfile(p);
      setLibrary(lib || []);
      setReviews(revs || []);
      setStats({ followers: followers || 0, following: following || 0, iFollow: !!myFollow });
      setLoading(false);
    })();
  }, [username, user]);

  if (loading) return <AppShell><div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div></AppShell>;
  if (!profile) return <AppShell><div className="px-6 py-20 text-center"><p className="text-muted-foreground">Perfil não encontrado</p><Link to="/" className="text-primary underline">Voltar</Link></div></AppShell>;

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 pb-16 max-w-4xl mx-auto">
        {/* Hero */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 mb-8 animate-fade-in">
          <Avatar className="w-24 h-24 ring-2 ring-primary/30">
            <AvatarImage src={profile.avatar_url} />
            <AvatarFallback className="bg-gradient-gold text-primary-foreground font-display text-3xl">
              {(profile.display_name || "?").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-3xl font-bold">{profile.display_name || "Leitor"}</h1>
            <p className="text-muted-foreground text-sm">@{profile.username}</p>
            {profile.bio && <p className="text-sm mt-2 max-w-xl">{profile.bio}</p>}
            <div className="flex flex-wrap items-center gap-4 mt-3 text-sm">
              <span className="flex items-center gap-1.5"><Trophy className="w-4 h-4 text-primary" /> Nível {profile.level} · {profile.xp} XP</span>
              <span className="flex items-center gap-1.5 text-muted-foreground"><Users className="w-4 h-4" /> {stats.followers} seguidores · {stats.following} seguindo</span>
            </div>
          </div>
          <FollowButton targetUserId={profile.id} initiallyFollowing={stats.iFollow} size="default" />
        </div>

        <Tabs defaultValue="library">
          <TabsList className="grid grid-cols-3 max-w-md">
            <TabsTrigger value="library" className="gap-2"><BookOpen className="w-3.5 h-3.5" /> Biblioteca</TabsTrigger>
            <TabsTrigger value="reviews" className="gap-2"><Star className="w-3.5 h-3.5" /> Resenhas</TabsTrigger>
            <TabsTrigger value="achievements" className="gap-2"><Trophy className="w-3.5 h-3.5" /> Conquistas</TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="mt-6">
            {library.length === 0 ? (
              <p className="text-muted-foreground italic text-sm">Nenhum livro público.</p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4">
                {library.map((ub) => ub.book && <BookCard key={ub.id} book={ub.book} size="sm" />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="reviews" className="mt-6 space-y-4">
            {reviews.length === 0 ? (
              <p className="text-muted-foreground italic text-sm">Nenhuma resenha pública.</p>
            ) : (
              reviews.map((r) => (
                <Link key={r.id} to={`/livro/${r.book_id}`} className="block glass rounded-xl p-4 hover:border-primary/40 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-display font-semibold leading-tight">{r.book?.title}</p>
                    {r.rating && <Rating value={r.rating} readOnly />}
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}</p>
                  <p className="text-sm leading-relaxed line-clamp-3">{r.content}</p>
                </Link>
              ))
            )}
          </TabsContent>

          <TabsContent value="achievements" className="mt-6">
            <AchievementsPanel userId={profile.id} />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
