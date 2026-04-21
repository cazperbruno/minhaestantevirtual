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
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { LogOut, BarChart3, Target, FileText, ArrowRight, Flame } from "lucide-react";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileStatsRow } from "@/components/profile/ProfileStatsRow";
import { AchievementsPanel } from "@/components/profile/AchievementsPanel";
import { LatestAchievementBanner } from "@/components/profile/LatestAchievementBanner";
import { VersionTag } from "@/components/pwa/VersionTag";
import { useStreak } from "@/hooks/useStreak";
import { useIsAdmin } from "@/hooks/useIsAdmin";

export default function ProfilePage() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState({ total: 0, read: 0, reading: 0, avgRating: 0, followers: 0, following: 0 });
  const [goal, setGoal] = useState<{ target: number; finished: number } | null>(null);
  const [goalDraft, setGoalDraft] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { data: streak } = useStreak(user?.id);
  const year = new Date().getFullYear();

  useEffect(() => {
    if (!user) return;
    (async () => {
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
      const target = g?.target_books ?? 0;
      setGoal({ target, finished: yearRead || 0 });
      setGoalDraft(target ? String(target) : "");
    })();
  }, [user, year]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const cleanUsername = (profile.username || "").trim().replace(/^@+/, "").toLowerCase();
    const { error } = await supabase.from("profiles").update({
      display_name: profile.display_name,
      bio: profile.bio,
      username: cleanUsername || null,
    }).eq("id", user.id);
    if (error) {
      toast.error(error.message?.includes("profiles_username_lower") ? "Esse @ já está em uso" : "Erro ao salvar");
    } else {
      setProfile({ ...profile, username: cleanUsername });
      toast.success("Perfil atualizado");
      setEditOpen(false);
    }
    setSaving(false);
  };

  const saveGoal = async () => {
    if (!user) return;
    const target = parseInt(goalDraft, 10);
    if (!target || target < 1) {
      toast.error("Informe um número válido");
      return;
    }
    setSavingGoal(true);
    const { error } = await supabase
      .from("reading_goals")
      .upsert({ user_id: user.id, year, target_books: target }, { onConflict: "user_id,year" });
    if (error) {
      toast.error("Erro ao salvar meta");
    } else {
      setGoal((g) => ({ target, finished: g?.finished ?? 0 }));
      toast.success("Meta atualizada");
    }
    setSavingGoal(false);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

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
          onEdit={() => setEditOpen(true)}
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

        <Tabs defaultValue="stats" className="mt-8">
          <TabsList className="w-full overflow-x-auto scrollbar-hide flex justify-start gap-1 bg-card/50 h-11 p-1">
            <TabsTrigger value="stats" className="gap-1.5 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
              <BarChart3 className="w-3.5 h-3.5" /> Estatísticas
            </TabsTrigger>
            <TabsTrigger value="goals" className="gap-1.5 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
              <Target className="w-3.5 h-3.5" /> Metas
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-1.5 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
              <FileText className="w-3.5 h-3.5" /> Relatórios
            </TabsTrigger>
          </TabsList>

          {/* Estatísticas */}
          <TabsContent value="stats" className="mt-6 space-y-4 animate-fade-in">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MiniStat label="Lidos" value={stats.read} />
              <MiniStat label="Lendo" value={stats.reading} />
              <MiniStat label="Avaliação" value={stats.avgRating ? stats.avgRating.toFixed(1) : "—"} />
              <MiniStat label="Streak" value={`${streak?.current_days ?? 0}d`} icon={<Flame className="w-3.5 h-3.5 text-status-wishlist" />} />
            </div>
            <AchievementsPanel userId={user!.id} />
            <Button asChild variant="outline" className="w-full gap-1.5">
              <Link to="/estatisticas">Ver estatísticas completas <ArrowRight className="w-4 h-4" /></Link>
            </Button>
          </TabsContent>

          {/* Metas */}
          <TabsContent value="goals" className="mt-6 space-y-4 animate-fade-in">
            <div className="glass rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Meta anual {year}</p>
                <p className="font-display text-lg font-bold tabular-nums">
                  {goal?.finished ?? 0}<span className="text-muted-foreground text-sm">/{goal?.target || "—"}</span>
                </p>
              </div>
              {goal?.target ? (
                <>
                  <Progress value={goalProgress ?? 0} className="h-2.5" />
                  <p className="text-xs text-muted-foreground">
                    {goalProgress! >= 100 ? "🎉 Meta concluída!" : `${Math.max(0, goal.target - goal.finished)} livros para concluir`}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Defina sua meta para o ano.</p>
              )}
            </div>

            <div className="glass rounded-2xl p-5 space-y-3">
              <Label htmlFor="goal">Quantos livros você quer ler em {year}?</Label>
              <div className="flex gap-2">
                <Input
                  id="goal"
                  type="number"
                  min={1}
                  value={goalDraft}
                  onChange={(e) => setGoalDraft(e.target.value)}
                  placeholder="Ex: 24"
                />
                <Button onClick={saveGoal} disabled={savingGoal} variant="hero">
                  {savingGoal ? "Salvando…" : "Salvar"}
                </Button>
              </div>
            </div>

            <Button asChild variant="outline" className="w-full gap-1.5">
              <Link to="/metas">Ver detalhes de metas <ArrowRight className="w-4 h-4" /></Link>
            </Button>
          </TabsContent>

          {/* Relatórios */}
          <TabsContent value="reports" className="mt-6 space-y-4 animate-fade-in">
            <div className="glass rounded-2xl p-5">
              <h3 className="font-display text-lg font-semibold mb-1">Relatórios de leitura</h3>
              <p className="text-sm text-muted-foreground">
                Exporte seus dados de leitura, filtre por período e veja sua evolução em detalhes.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Total no acervo" value={stats.total} />
              <MiniStat label="Concluídos no ano" value={goal?.finished ?? 0} />
            </div>
            <Button asChild variant="hero" className="w-full gap-1.5">
              <Link to="/relatorios">Abrir relatórios completos <ArrowRight className="w-4 h-4" /></Link>
            </Button>
            {!isAdmin && (
              <p className="text-xs text-muted-foreground text-center">
                Alguns recursos avançados estão disponíveis apenas para administradores.
              </p>
            )}
          </TabsContent>
        </Tabs>

        <div className="mt-10 flex justify-center">
          <Button variant="ghost" onClick={logout} className="gap-2">
            <LogOut className="w-4 h-4" /> Sair
          </Button>
        </div>

        <div className="pt-4 flex justify-center">
          <VersionTag />
        </div>
      </div>

      {/* Dialog de edição */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar perfil</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="dn">Nome</Label>
              <Input
                id="dn"
                value={profile.display_name || ""}
                onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="un">Usuário (@)</Label>
              <Input
                id="un"
                value={profile.username || ""}
                onChange={(e) => setProfile({ ...profile, username: e.target.value })}
                placeholder="seunome"
              />
            </div>
            <div>
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                value={profile.bio || ""}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                rows={3}
                maxLength={280}
                placeholder="Conte um pouco sobre você..."
              />
              <p className="text-[10px] text-muted-foreground mt-1 text-right">
                {(profile.bio || "").length}/280
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button variant="hero" onClick={save} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
