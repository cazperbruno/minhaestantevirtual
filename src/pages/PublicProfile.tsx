import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LibraryShelf } from "@/components/books/LibraryShelf";
import { AchievementsPanel } from "@/components/profile/AchievementsPanel";
import { FollowButton } from "@/components/social/FollowButton";
import { ProposeTradeDialog } from "@/components/social/ProposeTradeDialog";
import { useAuth } from "@/hooks/useAuth";
import { Trophy, BookOpen, Star, Loader2, Users, Calendar } from "lucide-react";
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
  const [stats, setStats] = useState({ followers: 0, following: 0, iFollow: false, read: 0, reading: 0, avgRating: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!username) return;
    (async () => {
      setLoading(true);
      const lookup = username.replace(/^@+/, "").toLowerCase();
      const { data: p } = await supabase
        .from("profiles").select("*").eq("username", lookup).maybeSingle();
      if (!p) { setLoading(false); return; }

      const [{ data: lib }, { data: revs }, { count: followers }, { count: following }, { data: myFollow }] = await Promise.all([
        supabase
          .from("user_books")
          .select("*, book:books(*)")
          .eq("user_id", p.id)
          .eq("is_public", true)
          .order("updated_at", { ascending: false })
          .limit(60),
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

      const list = lib || [];
      const ratings = list.filter((x: any) => x.rating).map((x: any) => x.rating);
      setProfile(p);
      setLibrary(list);
      setReviews(revs || []);
      setStats({
        followers: followers || 0,
        following: following || 0,
        iFollow: !!myFollow,
        read: list.filter((x: any) => x.status === "read").length,
        reading: list.filter((x: any) => x.status === "reading").length,
        avgRating: ratings.length ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : 0,
      });
      setLoading(false);
    })();
  }, [username, user]);

  if (loading) return <AppShell><div className="flex justify-center py-32"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div></AppShell>;
  if (!profile) return <AppShell><div className="px-6 py-32 text-center"><p className="text-muted-foreground mb-3">Perfil não encontrado</p><Link to="/" className="text-primary underline">Voltar</Link></div></AppShell>;

  const featuredCovers = library.slice(0, 6).map((ub) => ub.book?.cover_url).filter(Boolean);
  const reading = library.filter((ub) => ub.status === "reading");
  const read = library.filter((ub) => ub.status === "read");
  const wishlist = library.filter((ub) => ub.status === "wishlist");

  return (
    <AppShell>
      {/* Cinematic banner */}
      <div className="relative">
        <div className="absolute inset-0 -z-10 h-[280px] overflow-hidden">
          {featuredCovers.length > 0 && (
            <div className="absolute inset-0 flex">
              {featuredCovers.map((url, i) => (
                <div
                  key={i}
                  className="flex-1 opacity-40"
                  style={{
                    backgroundImage: `url(${url})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    filter: "blur(50px) saturate(140%)",
                  }}
                />
              ))}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-cover-fade" />
          <div className="absolute inset-0 bg-background/40" />
        </div>

        <div className="px-5 md:px-10 pt-12 md:pt-16 pb-8 max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-5 animate-fade-in">
            <Avatar className="w-28 h-28 md:w-32 md:h-32 ring-4 ring-background shadow-elevated">
              <AvatarImage src={profile.avatar_url} />
              <AvatarFallback className="bg-gradient-gold text-primary-foreground font-display text-4xl">
                {(profile.display_name || "?").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-3xl md:text-4xl font-bold leading-tight">
                {profile.display_name || "Leitor"}
              </h1>
              {profile.username && <p className="text-muted-foreground text-sm">@{profile.username.replace(/^@+/, "")}</p>}
              {profile.bio && <p className="text-sm md:text-base mt-3 max-w-xl text-foreground/80">{profile.bio}</p>}
            </div>
            <div className="flex flex-col gap-2 items-stretch">
              <FollowButton targetUserId={profile.id} initiallyFollowing={stats.iFollow} size="default" />
              <ProposeTradeDialog receiverId={profile.id} receiverName={profile.display_name || undefined} />
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 max-w-2xl">
            <Stat icon={<BookOpen className="w-3.5 h-3.5" />} value={library.length} label="No acervo" />
            <Stat icon={<Calendar className="w-3.5 h-3.5 text-status-read" />} value={stats.read} label="Lidos" />
            <Stat
              icon={<Star className="w-3.5 h-3.5 text-primary fill-primary" />}
              value={stats.avgRating ? stats.avgRating.toFixed(1) : "—"}
              label="Média"
            />
            <Stat
              icon={<Users className="w-3.5 h-3.5" />}
              value={stats.followers}
              label={stats.followers === 1 ? "seguidor" : "seguidores"}
            />
          </div>

          <div className="flex items-center gap-2 mt-4 text-sm">
            <Trophy className="w-4 h-4 text-primary" />
            <span className="font-medium">Nível {profile.level}</span>
            <span className="text-muted-foreground">· {profile.xp} XP</span>
          </div>
        </div>
      </div>

      <div className="px-5 md:px-10 pb-20 max-w-5xl mx-auto">
        <Tabs defaultValue="library" className="mt-2">
          <TabsList className="grid grid-cols-3 max-w-md">
            <TabsTrigger value="library" className="gap-2"><BookOpen className="w-3.5 h-3.5" /> Biblioteca</TabsTrigger>
            <TabsTrigger value="reviews" className="gap-2"><Star className="w-3.5 h-3.5" /> Resenhas</TabsTrigger>
            <TabsTrigger value="achievements" className="gap-2"><Trophy className="w-3.5 h-3.5" /> Conquistas</TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="mt-8 space-y-12">
            {library.length === 0 ? (
              <p className="text-muted-foreground italic text-sm py-10 text-center">Nenhum livro público.</p>
            ) : (
              <>
                {reading.length > 0 && (
                  <LibraryShelf title="Lendo agora" items={reading} />
                )}
                {read.length > 0 && (
                  <LibraryShelf title="Já leu" subtitle={`${read.length} ${read.length === 1 ? "livro" : "livros"}`} items={read} />
                )}
                {wishlist.length > 0 && (
                  <LibraryShelf title="Quer ler" items={wishlist} />
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="reviews" className="mt-8 space-y-4">
            {reviews.length === 0 ? (
              <p className="text-muted-foreground italic text-sm py-10 text-center">Nenhuma resenha pública.</p>
            ) : (
              reviews.map((r) => (
                <Link key={r.id} to={`/livro/${r.book_id}`} className="block glass rounded-2xl p-5 hover:border-primary/40 transition-all group animate-fade-in">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-semibold text-lg leading-tight group-hover:text-primary transition-colors">{r.book?.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                    {r.rating && <Rating value={r.rating} readOnly />}
                  </div>
                  <p className="text-sm leading-relaxed line-clamp-3 text-foreground/85">{r.content}</p>
                </Link>
              ))
            )}
          </TabsContent>

          <TabsContent value="achievements" className="mt-8">
            <AchievementsPanel userId={profile.id} />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  return (
    <div className="glass rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] uppercase tracking-wider font-semibold">
        {icon}<span>{label}</span>
      </div>
      <p className="font-display text-xl md:text-2xl font-bold mt-0.5 tabular-nums">{value}</p>
    </div>
  );
}
