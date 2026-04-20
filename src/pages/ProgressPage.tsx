import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useChallenges, useClaimChallenge, type UserChallenge } from "@/hooks/useChallenges";
import { useStreak } from "@/hooks/useStreak";
import { useInvite, useAmbassadors } from "@/hooks/useInvite";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Flame, Trophy, Sparkles, Gift, Share2, Copy, Calendar, CalendarDays, Star, ChevronRight } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import * as Icons from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function getIcon(name: string) {
  return (Icons as any)[name] || Icons.Target;
}

export default function ProgressPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const { data: challenges = [], isLoading: loadingCh } = useChallenges(userId);
  const { data: streak } = useStreak(userId);
  const { data: invite } = useInvite(userId);
  const { data: ambassadors = [] } = useAmbassadors(20);
  const claim = useClaimChallenge(userId!);

  const daily = challenges.filter((c) => c.category === "daily");
  const weekly = challenges.filter((c) => c.category === "weekly");
  const epic = challenges.filter((c) => c.category === "epic");

  const inviteUrl = invite ? `${window.location.origin}/auth?ref=${invite.code}` : "";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success("Link copiado!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Junte-se a mim no Readify",
          text: "Descubra, organize e viva a leitura comigo no Readify 📚",
          url: inviteUrl,
        });
      } catch { /* user cancelled */ }
    } else {
      copyLink();
    }
  };

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 pb-16 max-w-4xl mx-auto space-y-6 animate-fade-in">
        <header className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-bold text-gradient-gold flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-primary" /> Progresso
            </h1>
            <p className="text-muted-foreground mt-1">Desafios, ofensiva e recompensas</p>
          </div>
        </header>

        {/* STREAK HERO */}
        <div className="glass rounded-3xl p-6 relative overflow-hidden border border-primary/20">
          <div className="absolute -top-12 -right-10 opacity-10 text-primary">
            <Flame className="w-48 h-48" />
          </div>
          <div className="relative flex items-center gap-5">
            <div className={cn(
              "h-20 w-20 rounded-full flex items-center justify-center shrink-0",
              streak?.current_days && streak.current_days > 0
                ? "bg-gradient-to-br from-primary to-primary/60 shadow-glow animate-pulse-soft"
                : "bg-muted/40 text-muted-foreground",
            )}>
              <Flame className="w-10 h-10 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Ofensiva atual</p>
              <p className="font-display text-4xl font-black tabular-nums">
                {streak?.current_days ?? 0} <span className="text-base font-medium text-muted-foreground">{streak?.current_days === 1 ? "dia" : "dias"}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Recorde: <span className="text-primary font-semibold">{streak?.longest_days ?? 0}</span> dias · Próximo bônus em <span className="text-primary font-semibold">{streak?.next_milestone ?? 7}</span>
              </p>
              {streak && streak.current_days > 0 && (
                <Progress
                  value={Math.min(100, (streak.current_days / streak.next_milestone) * 100)}
                  className="h-1.5 mt-2"
                />
              )}
            </div>
          </div>
        </div>

        {/* DESAFIOS */}
        <div className="glass rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-2xl font-bold flex items-center gap-2">
              <Trophy className="w-6 h-6 text-primary" /> Desafios
            </h2>
            {!loadingCh && (
              <span className="text-xs text-muted-foreground">
                {challenges.filter(c => c.status === "completed").length} prontos para coletar
              </span>
            )}
          </div>

          <Tabs defaultValue="daily">
            <TabsList className="grid grid-cols-3 mb-4">
              <TabsTrigger value="daily" className="gap-1.5"><Calendar className="w-3.5 h-3.5" /> Hoje</TabsTrigger>
              <TabsTrigger value="weekly" className="gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Semana</TabsTrigger>
              <TabsTrigger value="epic" className="gap-1.5"><Star className="w-3.5 h-3.5" /> Épicos</TabsTrigger>
            </TabsList>

            <TabsContent value="daily" className="space-y-2">
              {loadingCh ? <ChallengeSkeleton /> : daily.length === 0 ? <Empty msg="Sem desafios para hoje" /> : daily.map((ch) => (
                <ChallengeRow key={ch.id} ch={ch} onClaim={() => claim.mutate(ch.id)} claiming={claim.isPending} />
              ))}
            </TabsContent>
            <TabsContent value="weekly" className="space-y-2">
              {loadingCh ? <ChallengeSkeleton /> : weekly.length === 0 ? <Empty msg="Sem desafios semanais" /> : weekly.map((ch) => (
                <ChallengeRow key={ch.id} ch={ch} onClaim={() => claim.mutate(ch.id)} claiming={claim.isPending} />
              ))}
            </TabsContent>
            <TabsContent value="epic" className="space-y-2">
              {loadingCh ? <ChallengeSkeleton /> : epic.length === 0 ? <Empty msg="Sem desafios épicos" /> : epic.map((ch) => (
                <ChallengeRow key={ch.id} ch={ch} onClaim={() => claim.mutate(ch.id)} claiming={claim.isPending} />
              ))}
            </TabsContent>
          </Tabs>
        </div>

        {/* CONVITES */}
        <div className="glass rounded-3xl p-6">
          <h2 className="font-display text-2xl font-bold flex items-center gap-2 mb-1">
            <Gift className="w-6 h-6 text-primary" /> Convide amigos
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Ganhe <span className="text-primary font-semibold">+200 XP</span> a cada amigo que entrar pelo seu link.
          </p>

          {invite && (
            <>
              <div className="flex items-center gap-2 mb-3 p-3 rounded-xl bg-muted/30 border border-border">
                <code className="flex-1 font-mono text-sm truncate">{inviteUrl}</code>
                <Button size="sm" variant="ghost" onClick={copyLink} className="shrink-0">
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="flex gap-2 mb-5">
                <Button onClick={shareLink} className="flex-1 gap-2"><Share2 className="w-4 h-4" /> Compartilhar</Button>
                <div className="text-right px-3">
                  <p className="font-display text-2xl font-bold text-primary tabular-nums">{invite.signups_count}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">amigos</p>
                </div>
              </div>
            </>
          )}

          {/* Ranking de embaixadores */}
          {ambassadors.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Top embaixadores</p>
              <ol className="space-y-1.5">
                {ambassadors.slice(0, 5).map((a) => (
                  <li key={a.id} className={cn(
                    "flex items-center gap-3 p-2.5 rounded-xl",
                    a.id === userId ? "bg-primary/10 ring-1 ring-primary/40" : "bg-card/40",
                  )}>
                    <span className="w-6 text-center font-display font-bold text-sm text-muted-foreground">{a.position}</span>
                    <Avatar className="w-9 h-9">
                      <AvatarImage src={a.avatar_url || undefined} />
                      <AvatarFallback>{(a.display_name || "?").charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{a.display_name || "Leitor"}</p>
                      <p className="text-[10px] text-primary uppercase tracking-wider">{a.tier}</p>
                    </div>
                    <span className="text-sm font-bold tabular-nums">{a.signups_count}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function ChallengeRow({ ch, onClaim, claiming }: { ch: UserChallenge; onClaim: () => void; claiming: boolean }) {
  const Icon = getIcon(ch.template?.icon || "Target");
  const pct = Math.min(100, (ch.progress / ch.target) * 100);
  const done = ch.status === "completed";
  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-xl border transition-all",
      done ? "border-primary/40 bg-primary/5 shadow-glow" : "border-border bg-card/40",
    )}>
      <div className={cn(
        "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
        done ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground",
      )}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-sm truncate">{ch.template?.title}</p>
          <span className="text-xs font-bold text-primary shrink-0">+{ch.xp_reward} XP</span>
        </div>
        <p className="text-[11px] text-muted-foreground truncate mb-1.5">{ch.template?.description}</p>
        <div className="flex items-center gap-2">
          <Progress value={pct} className="h-1.5 flex-1" />
          <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">{ch.progress}/{ch.target}</span>
        </div>
      </div>
      {done && (
        <Button size="sm" onClick={onClaim} disabled={claiming} className="shrink-0 gap-1">
          Coletar <ChevronRight className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}

function ChallengeSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p className="text-sm text-muted-foreground text-center py-6">{msg}</p>;
}
