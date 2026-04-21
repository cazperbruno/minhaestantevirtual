import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  LogOut, Lock, Globe, Users, Instagram, Twitter, Music2, Eye, EyeOff,
  Library as LibraryIcon, BarChart3, Target, Settings as SettingsIcon, ArrowRight, Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileStatsRow } from "@/components/profile/ProfileStatsRow";
import { ProfileSocialTab } from "@/components/profile/ProfileSocialTab";
import { AchievementsPanel } from "@/components/profile/AchievementsPanel";
import { LatestAchievementBanner } from "@/components/profile/LatestAchievementBanner";
import { InstallAppCard } from "@/components/pwa/InstallAppCard";
import { PushNotificationsCard } from "@/components/pwa/PushNotificationsCard";
import { VersionTag } from "@/components/pwa/VersionTag";
import { useStreak } from "@/hooks/useStreak";

type Visibility = "public" | "private";
type LibVisibility = "public" | "followers" | "private";

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState({ total: 0, read: 0, reading: 0, avgRating: 0, followers: 0, following: 0 });
  const [goal, setGoal] = useState<{ target: number; finished: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const { data: streak } = useStreak(user?.id);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const year = new Date().getFullYear();
      const start = `${year}-01-01`;
      const end = `${year}-12-31T23:59:59`;
      const [{ data: p }, { data: ub }, { count: followers }, { count: following }, { data: g }, { count: yearRead }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("user_books").select("status,rating").eq("user_id", user.id),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", user.id),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", user.id),
        supabase.from("reading_goals").select("target_books").eq("user_id", user.id).eq("year", year).maybeSingle(),
        supabase.from("user_books").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "read").gte("finished_at", start).lte("finished_at", end),
      ]);
      setProfile(p);
      const list = ub || [];
      const ratings = list.filter((x) => x.rating).map((x) => x.rating as number);
      setStats({
        total: list.length,
        read: list.filter((x) => x.status === "read").length,
        reading: list.filter((x) => x.status === "reading").length,
        avgRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0,
        followers: followers || 0,
        following: following || 0,
      });
      if (g) setGoal({ target: g.target_books, finished: yearRead || 0 });
      else setGoal({ target: 0, finished: yearRead || 0 });
    })();
  }, [user]);

  const sanitizeHandle = (v: string) =>
    v.trim().replace(/^https?:\/\/(www\.)?(instagram|tiktok|twitter|x)\.com\/@?/i, "").replace(/^@+/, "").replace(/\/.*$/, "") || null;

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const cleanUsername = (profile.username || "").trim().replace(/^@+/, "").toLowerCase();
    const { error } = await supabase.from("profiles").update({
      display_name: profile.display_name,
      bio: profile.bio,
      username: cleanUsername || null,
      profile_visibility: profile.profile_visibility,
      library_visibility: profile.library_visibility,
      instagram: sanitizeHandle(profile.instagram || ""),
      tiktok: sanitizeHandle(profile.tiktok || ""),
      twitter: sanitizeHandle(profile.twitter || ""),
      website: profile.website?.trim() || null,
    }).eq("id", user.id);
    if (error) {
      console.error(error);
      toast.error(error.message?.includes("profiles_username_lower") ? "Esse @ já está em uso" : "Erro ao salvar");
    } else {
      setProfile({ ...profile, username: cleanUsername });
      toast.success("Perfil atualizado");
    }
    setSaving(false);
  };

  const logout = async () => { await supabase.auth.signOut(); window.location.href = "/auth"; };

  const goalProgress = useMemo(() => {
    if (!goal || !goal.target) return undefined;
    return Math.min(100, (goal.finished / goal.target) * 100);
  }, [goal]);

  if (!profile) return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 pb-16 max-w-3xl mx-auto space-y-6 animate-fade-in">
        <div className="flex items-center gap-5">
          <Skeleton className="w-20 h-20 rounded-full" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </AppShell>
  );

  const publicHref = profile.username ? `/u/${profile.username}` : `/u/${user!.id}`;

  return (
    <AppShell>
      <div className="px-4 sm:px-6 md:px-10 pt-6 sm:pt-8 pb-16 max-w-3xl mx-auto min-w-0">
        <ProfileHeader
          profile={profile}
          email={user?.email}
          publicHref={publicHref}
          onEdit={() => {
            const el = document.getElementById("tab-config");
            el?.click();
            setTimeout(() => document.getElementById("edit-section")?.scrollIntoView({ behavior: "smooth" }), 50);
          }}
        />

        <div className="mt-6">
          <LatestAchievementBanner userId={user!.id} />
        </div>

        <div className="mt-5">
          <ProfileStatsRow
            total={stats.total}
            read={stats.read}
            avgRating={stats.avgRating}
            followers={stats.followers}
            following={stats.following}
            streak={streak?.current_days ?? 0}
            goalProgress={goalProgress}
          />
        </div>

        <Tabs defaultValue="overview" className="mt-8">
          <TabsList className="w-full overflow-x-auto scrollbar-hide flex justify-start gap-1 bg-card/50 h-11 p-1">
            <TabsTrigger value="overview" className="gap-1.5 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
              <LibraryIcon className="w-3.5 h-3.5" /> Visão geral
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-1.5 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
              <BarChart3 className="w-3.5 h-3.5" /> Estatísticas
            </TabsTrigger>
            <TabsTrigger value="goals" className="gap-1.5 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
              <Target className="w-3.5 h-3.5" /> Metas
            </TabsTrigger>
            <TabsTrigger value="social" className="gap-1.5 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
              <Users className="w-3.5 h-3.5" /> Social
            </TabsTrigger>
            <TabsTrigger id="tab-config" value="config" className="gap-1.5 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
              <SettingsIcon className="w-3.5 h-3.5" /> Configurações
            </TabsTrigger>
          </TabsList>

          {/* Visão geral: conquistas + atalhos */}
          <TabsContent value="overview" className="mt-6 space-y-6 animate-fade-in">
            <AchievementsPanel userId={user!.id} />
            <div className="grid sm:grid-cols-2 gap-3">
              <QuickLink to="/biblioteca" icon={<LibraryIcon className="w-4 h-4" />} title="Minha biblioteca" desc={`${stats.total} livros`} />
              <QuickLink to="/desejos" icon={<Target className="w-4 h-4" />} title="Lista de desejos" desc="O que ler depois" />
              <QuickLink to="/series" icon={<LibraryIcon className="w-4 h-4" />} title="Minhas séries" desc="Coleções e volumes" />
              <QuickLink to="/leitores" icon={<Users className="w-4 h-4" />} title="Encontrar leitores" desc="Comunidade Readify" />
            </div>
          </TabsContent>

          {/* Estatísticas: resumo + link para página completa */}
          <TabsContent value="stats" className="mt-6 space-y-4 animate-fade-in">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MiniStat label="Lidos" value={stats.read} />
              <MiniStat label="Lendo" value={stats.reading} />
              <MiniStat label="Avaliação" value={stats.avgRating ? stats.avgRating.toFixed(1) : "—"} />
              <MiniStat label="Streak" value={`${streak?.current_days ?? 0}d`} icon={<Flame className="w-3.5 h-3.5 text-status-wishlist" />} />
            </div>
            <Button asChild variant="outline" className="w-full gap-1.5">
              <Link to="/estatisticas">Ver estatísticas completas <ArrowRight className="w-4 h-4" /></Link>
            </Button>
          </TabsContent>

          {/* Metas */}
          <TabsContent value="goals" className="mt-6 space-y-4 animate-fade-in">
            <div className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Meta anual {new Date().getFullYear()}</p>
                <p className="font-display text-lg font-bold tabular-nums">
                  {goal?.finished ?? 0}<span className="text-muted-foreground text-sm">/{goal?.target || "—"}</span>
                </p>
              </div>
              {goal?.target ? (
                <>
                  <Progress value={goalProgress ?? 0} className="h-2.5" />
                  <p className="text-xs text-muted-foreground mt-2">
                    {goalProgress! >= 100 ? "🎉 Meta concluída!" : `${Math.max(0, goal.target - goal.finished)} livros para concluir`}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Defina uma meta anual para acompanhar seu ritmo de leitura.</p>
              )}
            </div>
            <Button asChild variant="outline" className="w-full gap-1.5">
              <Link to="/metas">Gerenciar metas <ArrowRight className="w-4 h-4" /></Link>
            </Button>
          </TabsContent>

          {/* Social */}
          <TabsContent value="social" className="mt-6 animate-fade-in">
            <ProfileSocialTab userId={user!.id} />
          </TabsContent>

          {/* Configurações: edição + privacidade + redes + PWA */}
          <TabsContent value="config" className="mt-6 space-y-6 animate-fade-in">
            <section id="edit-section" className="glass rounded-2xl p-5 space-y-4">
              <h2 className="font-display text-xl font-semibold">Editar perfil</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="dn">Nome</Label>
                  <Input id="dn" value={profile.display_name || ""} onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="un">Usuário (@)</Label>
                  <Input id="un" value={profile.username || ""} onChange={(e) => setProfile({ ...profile, username: e.target.value })} placeholder="seunome" />
                </div>
              </div>
              <div>
                <Label htmlFor="bio">Bio</Label>
                <Textarea id="bio" value={profile.bio || ""} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} rows={3} maxLength={280} placeholder="Conte um pouco sobre você e seus livros favoritos..." />
                <p className="text-[10px] text-muted-foreground mt-1 text-right">{(profile.bio || "").length}/280</p>
              </div>
            </section>

            <section className="glass rounded-2xl p-5 space-y-3">
              <div>
                <h2 className="font-display text-xl font-semibold">Redes sociais</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Aparecem no seu perfil público.</p>
              </div>
              <SocialField icon={<Instagram className="w-4 h-4" />} label="Instagram" placeholder="seunome"
                value={profile.instagram || ""} onChange={(v) => setProfile({ ...profile, instagram: v })} />
              <SocialField icon={<Music2 className="w-4 h-4" />} label="TikTok" placeholder="seunome"
                value={profile.tiktok || ""} onChange={(v) => setProfile({ ...profile, tiktok: v })} />
              <SocialField icon={<Twitter className="w-4 h-4" />} label="X (Twitter)" placeholder="seunome"
                value={profile.twitter || ""} onChange={(v) => setProfile({ ...profile, twitter: v })} />
              <SocialField icon={<Globe className="w-4 h-4" />} label="Website" placeholder="https://seusite.com"
                value={profile.website || ""} onChange={(v) => setProfile({ ...profile, website: v })} />
            </section>

            <section className="glass rounded-2xl p-5 space-y-5">
              <div>
                <h2 className="font-display text-xl font-semibold flex items-center gap-2"><Lock className="w-4 h-4" /> Privacidade</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Controle quem vê seu perfil e biblioteca.</p>
              </div>

              <div>
                <Label className="text-sm mb-2 block">Visibilidade do perfil</Label>
                <RadioGroup
                  value={profile.profile_visibility || "public"}
                  onValueChange={(v: Visibility) => setProfile({ ...profile, profile_visibility: v })}
                  className="grid sm:grid-cols-2 gap-2"
                >
                  <PrivacyOption value="public" icon={<Eye className="w-4 h-4" />} label="Público" desc="Qualquer leitor pode ver" current={profile.profile_visibility} />
                  <PrivacyOption value="private" icon={<EyeOff className="w-4 h-4" />} label="Privado" desc="Só você vê" current={profile.profile_visibility} />
                </RadioGroup>
              </div>

              <div>
                <Label className="text-sm mb-2 block">Visibilidade da biblioteca</Label>
                <RadioGroup
                  value={profile.library_visibility || "public"}
                  onValueChange={(v: LibVisibility) => setProfile({ ...profile, library_visibility: v })}
                  className="grid sm:grid-cols-3 gap-2"
                >
                  <PrivacyOption value="public" icon={<Globe className="w-4 h-4" />} label="Pública" desc="Todos veem" current={profile.library_visibility} />
                  <PrivacyOption value="followers" icon={<Users className="w-4 h-4" />} label="Seguidores" desc="Só quem te segue" current={profile.library_visibility} />
                  <PrivacyOption value="private" icon={<Lock className="w-4 h-4" />} label="Privada" desc="Só você" current={profile.library_visibility} />
                </RadioGroup>
              </div>
            </section>

            <div className="space-y-4">
              <InstallAppCard />
              <PushNotificationsCard />
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button variant="ghost" onClick={logout} className="gap-2"><LogOut className="w-4 h-4" /> Sair</Button>
              <Button variant="hero" onClick={save} disabled={saving} size="lg">
                {saving ? "Salvando…" : "Salvar alterações"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <div className="pt-8 flex justify-center">
          <VersionTag />
        </div>
      </div>
    </AppShell>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) {
  return (
    <div className="glass rounded-xl p-3 text-center min-w-0">
      {icon && <div className="flex items-center justify-center mb-1">{icon}</div>}
      <p className="font-display text-xl font-bold tabular-nums truncate">{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">{label}</p>
    </div>
  );
}

function QuickLink({ to, icon, title, desc }: { to: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Link to={to} className="glass rounded-2xl p-4 flex items-center gap-3 hover:border-primary/30 transition-all tap-scale group">
      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">{title}</p>
        <p className="text-xs text-muted-foreground truncate">{desc}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
    </Link>
  );
}

function SocialField({ icon, label, placeholder, value, onChange }: {
  icon: React.ReactNode; label: string; placeholder: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center text-muted-foreground shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-9 mt-0.5" />
      </div>
    </div>
  );
}

function PrivacyOption({ value, icon, label, desc, current }: {
  value: string; icon: React.ReactNode; label: string; desc: string; current: string;
}) {
  const active = current === value;
  return (
    <label className={cn(
      "relative flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all tap-scale",
      active ? "border-primary bg-primary/10 shadow-glow" : "border-border bg-card/40 hover:border-primary/40",
    )}>
      <RadioGroupItem value={value} className="sr-only" />
      <div className={cn("mt-0.5", active ? "text-primary" : "text-muted-foreground")}>{icon}</div>
      <div className="min-w-0">
        <p className={cn("text-sm font-semibold leading-tight", active && "text-primary")}>{label}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{desc}</p>
      </div>
    </label>
  );
}
