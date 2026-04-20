import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LogOut, BookOpen, Star, Trophy, Lock, Globe, Users, Instagram, Twitter, Music2, ExternalLink, Eye, EyeOff } from "lucide-react";
import { AchievementsPanel } from "@/components/profile/AchievementsPanel";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { InstallAppCard } from "@/components/pwa/InstallAppCard";
import { VersionTag } from "@/components/pwa/VersionTag";

type Visibility = "public" | "private";
type LibVisibility = "public" | "followers" | "private";

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState({ total: 0, read: 0, reading: 0, avgRating: 0, followers: 0, following: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: p }, { data: ub }, { count: followers }, { count: following }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("user_books").select("status,rating").eq("user_id", user.id),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", user.id),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", user.id),
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

  if (!profile) return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 pb-16 max-w-3xl mx-auto space-y-6 animate-fade-in">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-full skeleton-shimmer" />
          <div className="flex-1 space-y-3">
            <div className="h-7 w-48 rounded skeleton-shimmer" />
            <div className="h-3 w-40 rounded skeleton-shimmer" />
            <div className="h-3 w-32 rounded skeleton-shimmer" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[0,1,2].map(i => <div key={i} className="h-20 rounded-xl skeleton-shimmer" />)}
        </div>
        <div className="h-64 rounded-2xl skeleton-shimmer" />
      </div>
    </AppShell>
  );

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 pb-16 max-w-3xl mx-auto">
        <div className="flex items-center gap-5 mb-8 animate-fade-in">
          <Avatar className="w-20 h-20 ring-2 ring-primary/30">
            <AvatarImage src={profile.avatar_url} />
            <AvatarFallback className="bg-gradient-gold text-primary-foreground font-display text-2xl">
              {(profile.display_name || user?.email || "?").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-3xl font-bold truncate">{profile.display_name || "Leitor"}</h1>
            <p className="text-muted-foreground text-sm truncate">{user?.email}</p>
            <div className="flex items-center gap-2 mt-2">
              <Trophy className="w-4 h-4 text-primary" />
              <span className="text-sm">Nível {profile.level} · {profile.xp} XP</span>
            </div>
            <div className="mt-2">
              <Progress value={(profile.xp % 100)} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground mt-1">
                {100 - (profile.xp % 100)} XP para o nível {profile.level + 1}
              </p>
            </div>
          </div>
          {profile.username && (
            <Button asChild variant="outline" size="sm" className="gap-1.5 hidden sm:inline-flex">
              <Link to={`/u/${profile.username}`}>
                <ExternalLink className="w-3.5 h-3.5" /> Ver público
              </Link>
            </Button>
          )}
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-8">
          <Stat icon={<BookOpen className="w-4 h-4" />} value={stats.total} label="Acervo" />
          <Stat icon={<BookOpen className="w-4 h-4 text-status-read" />} value={stats.read} label="Lidos" />
          <Stat icon={<Star className="w-4 h-4 text-primary fill-primary" />} value={stats.avgRating ? stats.avgRating.toFixed(1) : "—"} label="Média" />
          <Stat icon={<Users className="w-4 h-4" />} value={stats.followers} label="Seguidores" />
          <Stat icon={<Users className="w-4 h-4" />} value={stats.following} label="Seguindo" />
        </div>

        <div className="mb-6">
          <AchievementsPanel userId={user!.id} />
        </div>

        {/* Editar perfil */}
        <div className="glass rounded-2xl p-6 space-y-5 mb-6">
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
        </div>

        {/* Redes sociais */}
        <div className="glass rounded-2xl p-6 space-y-4 mb-6">
          <div>
            <h2 className="font-display text-xl font-semibold">Redes sociais</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Aparecem no seu perfil público para outros leitores te encontrarem.</p>
          </div>
          <SocialField icon={<Instagram className="w-4 h-4" />} label="Instagram" placeholder="seunome"
            value={profile.instagram || ""} onChange={(v) => setProfile({ ...profile, instagram: v })} />
          <SocialField icon={<Music2 className="w-4 h-4" />} label="TikTok" placeholder="seunome"
            value={profile.tiktok || ""} onChange={(v) => setProfile({ ...profile, tiktok: v })} />
          <SocialField icon={<Twitter className="w-4 h-4" />} label="X (Twitter)" placeholder="seunome"
            value={profile.twitter || ""} onChange={(v) => setProfile({ ...profile, twitter: v })} />
          <SocialField icon={<Globe className="w-4 h-4" />} label="Website" placeholder="https://seusite.com"
            value={profile.website || ""} onChange={(v) => setProfile({ ...profile, website: v })} />
        </div>

        {/* Instalar app (PWA) */}
        <div className="mb-6">
          <InstallAppCard />
        </div>

        {/* Privacidade */}
        <div className="glass rounded-2xl p-6 space-y-5 mb-6">
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
        </div>

        <div className="flex justify-between items-center pt-2">
          <Button variant="ghost" onClick={logout} className="gap-2"><LogOut className="w-4 h-4" /> Sair</Button>
          <Button variant="hero" onClick={save} disabled={saving} size="lg">
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  return (
    <div className="glass rounded-xl p-3 text-center">
      <div className="flex items-center justify-center mb-1 text-muted-foreground">{icon}</div>
      <p className="font-display text-xl font-bold tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  );
}

function SocialField({ icon, label, placeholder, value, onChange }: {
  icon: React.ReactNode; label: string; placeholder: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center text-muted-foreground shrink-0">{icon}</div>
      <div className="flex-1">
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
