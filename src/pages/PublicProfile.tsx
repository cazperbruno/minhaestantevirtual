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
import { Trophy, BookOpen, Star, Loader2, Users, Calendar, Lock, Instagram, Twitter, Globe, Music2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Rating } from "@/components/books/Rating";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function PublicProfile() {
  const { username } = useParams();
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [library, setLibrary] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [stats, setStats] = useState({ followers: 0, following: 0, iFollow: false, read: 0, reading: 0, avgRating: 0 });
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);
      const raw = decodeURIComponent(username).replace(/^@+/, "").trim();

      // Fallback resiliente: tenta UUID → username → username com retry
      const lookup = async (): Promise<any | null> => {
        // 1) UUID exato
        if (UUID_RE.test(raw)) {
          const { data } = await supabase.from("profiles").select("*").eq("id", raw).maybeSingle();
          if (data) return data;
        }
        // 2) Username case-insensitive
        const u1 = await supabase.from("profiles").select("*").ilike("username", raw).maybeSingle();
        if (u1.data) return u1.data;
        // 3) Retry após 400ms (replicação de leitura pode estar atrasada após signup)
        await new Promise((r) => setTimeout(r, 400));
        const u2 = await supabase.from("profiles").select("*").ilike("username", raw).maybeSingle();
        if (u2.data) return u2.data;
        // 4) Último fallback: display_name exato (case-insensitive)
        const u3 = await supabase.from("profiles").select("*").ilike("display_name", raw).maybeSingle();
        return u3.data || null;
      };

      try {
        const p = await lookup();

        if (cancelled) return;

        if (!p) {
          console.warn("[PublicProfile] not found after retries:", raw);
          setProfile(null);
          setNotFound(true);
          setLoading(false);
          return;
        }

        const isOwn = user?.id === p.id;
        const isPrivate = p.profile_visibility === "private" && !isOwn;

        if (isPrivate) {
          // ainda mostra o cabeçalho, mas esconde dados
          setProfile(p);
          setLibrary([]);
          setReviews([]);
          const [{ count: followers }, { count: following }, { data: myFollow }] = await Promise.all([
            supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", p.id),
            supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", p.id),
            user
              ? supabase.from("follows").select("*").eq("follower_id", user.id).eq("following_id", p.id).maybeSingle()
              : Promise.resolve({ data: null }),
          ]);
          setStats({
            followers: followers || 0,
            following: following || 0,
            iFollow: !!myFollow,
            read: 0,
            reading: 0,
            avgRating: 0,
          });
          setLoading(false);
          return;
        }

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

        if (cancelled) return;

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
      } catch (err) {
        console.error("[PublicProfile] error:", err);
        if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [username, user]);

  if (loading) return <AppShell><div className="flex justify-center py-32"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div></AppShell>;

  if (notFound) return (
    <AppShell>
      <div className="px-6 py-32 text-center max-w-md mx-auto animate-fade-in">
        <div className="w-20 h-20 rounded-full bg-muted/40 mx-auto mb-5 flex items-center justify-center">
          <Users className="w-9 h-9 text-muted-foreground" />
        </div>
        <h2 className="font-display text-2xl font-bold mb-2">Leitor não encontrado</h2>
        <p className="text-muted-foreground text-sm mb-6">
          Esse perfil pode ter sido removido ou o link está incorreto.
        </p>
        <div className="flex gap-2 justify-center">
          <Button asChild variant="outline"><Link to="/leitores">Ver leitores</Link></Button>
          <Button asChild variant="hero"><Link to="/">Início</Link></Button>
        </div>
      </div>
    </AppShell>
  );

  const isOwn = user?.id === profile.id;
  const isPrivate = profile.profile_visibility === "private" && !isOwn;

  const featuredCovers = library.slice(0, 6).map((ub) => ub.book?.cover_url).filter(Boolean);
  const reading = library.filter((ub) => ub.status === "reading");
  const read = library.filter((ub) => ub.status === "read");
  const wishlist = library.filter((ub) => ub.status === "wishlist");

  const socials: Array<{ icon: any; label: string; href: string }> = [];
  if (profile.instagram) socials.push({ icon: Instagram, label: "Instagram", href: `https://instagram.com/${profile.instagram.replace(/^@/, "")}` });
  if (profile.tiktok) socials.push({ icon: Music2, label: "TikTok", href: `https://tiktok.com/@${profile.tiktok.replace(/^@/, "")}` });
  if (profile.twitter) socials.push({ icon: Twitter, label: "X", href: `https://x.com/${profile.twitter.replace(/^@/, "")}` });
  if (profile.website) socials.push({ icon: Globe, label: "Site", href: profile.website.startsWith("http") ? profile.website : `https://${profile.website}` });

  return (
    <AppShell>
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
              <h1 className="font-display text-3xl md:text-4xl font-bold leading-tight flex items-center gap-2 flex-wrap">
                {profile.display_name || "Leitor"}
                {isPrivate && <span className="inline-flex items-center gap-1 text-xs font-medium bg-muted text-muted-foreground px-2 py-1 rounded-full"><Lock className="w-3 h-3" /> Privado</span>}
              </h1>
              {profile.username && <p className="text-muted-foreground text-sm">@{profile.username.replace(/^@+/, "")}</p>}
              {profile.bio && <p className="text-sm md:text-base mt-3 max-w-xl text-foreground/80 whitespace-pre-line">{profile.bio}</p>}
              {socials.length > 0 && (
                <div className="flex items-center gap-2 mt-3">
                  {socials.map(({ icon: Icon, label, href }) => (
                    <a
                      key={label}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={label}
                      className="w-9 h-9 rounded-full bg-card/60 border border-border flex items-center justify-center hover:border-primary/50 hover:text-primary transition-all"
                    >
                      <Icon className="w-4 h-4" />
                    </a>
                  ))}
                </div>
              )}
            </div>
            {!isOwn && (
              <div className="flex flex-col gap-2 items-stretch">
                <FollowButton targetUserId={profile.id} size="default" />
                {!isPrivate && <ProposeTradeDialog receiverId={profile.id} receiverName={profile.display_name || undefined} />}
              </div>
            )}
          </div>

          {!isPrivate && (
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
          )}

          <div className="flex items-center gap-2 mt-4 text-sm">
            <Trophy className="w-4 h-4 text-primary" />
            <span className="font-medium">Nível {profile.level}</span>
            <span className="text-muted-foreground">· {profile.xp} XP</span>
          </div>
        </div>
      </div>

      <div className="px-5 md:px-10 pb-20 max-w-5xl mx-auto">
        {isPrivate ? (
          <div className="glass rounded-2xl p-10 text-center max-w-md mx-auto mt-8 animate-fade-in">
            <Lock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-display text-lg font-semibold mb-1">Perfil privado</h3>
            <p className="text-sm text-muted-foreground">
              Este leitor escolheu manter sua biblioteca e resenhas em privado.
            </p>
          </div>
        ) : (
          <Tabs defaultValue="library" className="mt-2">
            <TabsList className="grid grid-cols-3 max-w-md">
              <TabsTrigger value="library" className="gap-2"><BookOpen className="w-3.5 h-3.5" /> Biblioteca</TabsTrigger>
              <TabsTrigger value="reviews" className="gap-2"><Star className="w-3.5 h-3.5" /> Resenhas</TabsTrigger>
              <TabsTrigger value="achievements" className="gap-2"><Trophy className="w-3.5 h-3.5" /> Conquistas</TabsTrigger>
            </TabsList>

            <TabsContent value="library" className="mt-8 space-y-12">
              {library.length === 0 ? (
                <p className="text-muted-foreground italic text-sm py-10 text-center">
                  {profile.library_visibility === "followers" && !isOwn
                    ? "Biblioteca disponível só para seguidores."
                    : "Nenhum livro público."}
                </p>
              ) : (
                <>
                  {reading.length > 0 && <LibraryShelf title="Lendo agora" items={reading} />}
                  {read.length > 0 && <LibraryShelf title="Já leu" subtitle={`${read.length} ${read.length === 1 ? "livro" : "livros"}`} items={read} />}
                  {wishlist.length > 0 && <LibraryShelf title="Quer ler" items={wishlist} />}
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
        )}
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
