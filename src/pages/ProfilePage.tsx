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
import { LogOut, BookOpen, Star, Trophy } from "lucide-react";
import { AchievementsPanel } from "@/components/profile/AchievementsPanel";
import { Progress } from "@/components/ui/progress";

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState({ total: 0, read: 0, reading: 0, avgRating: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: p }, { data: ub }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("user_books").select("status,rating").eq("user_id", user.id),
      ]);
      setProfile(p);
      const list = ub || [];
      const ratings = list.filter((x) => x.rating).map((x) => x.rating as number);
      setStats({
        total: list.length,
        read: list.filter((x) => x.status === "read").length,
        reading: list.filter((x) => x.status === "reading").length,
        avgRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0,
      });
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      display_name: profile.display_name,
      bio: profile.bio,
      username: profile.username,
    }).eq("id", user.id);
    if (error) toast.error("Erro ao salvar");
    else toast.success("Perfil atualizado");
    setSaving(false);
  };

  const logout = async () => { await supabase.auth.signOut(); window.location.href = "/auth"; };

  if (!profile) return <AppShell><div className="p-10 text-muted-foreground">Carregando…</div></AppShell>;

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
        </div>

        <div className="grid grid-cols-3 gap-3 mb-8">
          <Stat icon={<BookOpen className="w-4 h-4" />} value={stats.total} label="No acervo" />
          <Stat icon={<BookOpen className="w-4 h-4 text-status-read" />} value={stats.read} label="Lidos" />
          <Stat icon={<Star className="w-4 h-4 text-primary fill-primary" />} value={stats.avgRating ? stats.avgRating.toFixed(1) : "—"} label="Média" />
        </div>

        <div className="mb-6">
          <AchievementsPanel userId={user!.id} />
        </div>

        <div className="glass rounded-2xl p-6 space-y-4">
          <h2 className="font-display text-xl font-semibold">Editar perfil</h2>
          <div>
            <Label htmlFor="dn">Nome</Label>
            <Input id="dn" value={profile.display_name || ""} onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="un">Usuário</Label>
            <Input id="un" value={profile.username || ""} onChange={(e) => setProfile({ ...profile, username: e.target.value })} placeholder="@usuario" />
          </div>
          <div>
            <Label htmlFor="bio">Bio</Label>
            <Textarea id="bio" value={profile.bio || ""} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} rows={3} maxLength={280} />
          </div>
          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={logout} className="gap-2"><LogOut className="w-4 h-4" /> Sair</Button>
            <Button variant="hero" onClick={save} disabled={saving}>Salvar</Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  return (
    <div className="glass rounded-xl p-4 text-center">
      <div className="flex items-center justify-center mb-1 text-muted-foreground">{icon}</div>
      <p className="font-display text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
