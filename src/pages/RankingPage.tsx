import { useEffect, useRef } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Medal, BookOpen, Star, Flame, Sparkles, Users2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { FollowButton } from "@/components/social/FollowButton";
import { RankingSkeleton } from "@/components/ui/skeletons";
import { EmptyState } from "@/components/ui/empty-state";
import { useRanking } from "@/hooks/useRanking";
import { useWeeklyRankingInfinite, useAmbassadors } from "@/hooks/useWeeklyRanking";

const TIER_LABEL: Record<string, string> = {
  legend: "Lenda 🔥",
  ambassador: "Embaixador",
  influencer: "Influenciador",
  connector: "Conector",
  starter: "Iniciante Social",
};

export default function RankingPage() {
  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 pb-16 max-w-3xl mx-auto">
        <header className="mb-6 animate-fade-in">
          <h1 className="font-display text-4xl font-bold text-gradient-gold flex items-center gap-3">
            <Trophy className="w-8 h-8 text-primary" /> Ranking
          </h1>
          <p className="text-muted-foreground mt-1">
            Os leitores mais ativos da comunidade
          </p>
        </header>

        <Tabs defaultValue="weekly" className="w-full">
          <TabsList className="grid grid-cols-3 w-full mb-6">
            <TabsTrigger value="weekly" className="gap-1.5">
              <Flame className="w-4 h-4" /> Semanal
            </TabsTrigger>
            <TabsTrigger value="global" className="gap-1.5">
              <Sparkles className="w-4 h-4" /> Global
            </TabsTrigger>
            <TabsTrigger value="ambassadors" className="gap-1.5">
              <Users2 className="w-4 h-4" /> Embaixadores
            </TabsTrigger>
          </TabsList>

          <TabsContent value="weekly"><WeeklyTab /></TabsContent>
          <TabsContent value="global"><GlobalTab /></TabsContent>
          <TabsContent value="ambassadors"><AmbassadorsTab /></TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function podiumIcon(pos: number) {
  if (pos === 1) return <Trophy className="w-6 h-6 text-primary" />;
  if (pos === 2) return <Medal className="w-6 h-6 text-muted-foreground" />;
  if (pos === 3) return <Medal className="w-6 h-6 text-primary/60" />;
  return null;
}

/* ---------------- WEEKLY ---------------- */
function WeeklyTab() {
  const { user } = useAuth();
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useWeeklyRankingInfinite();
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sentinelRef.current || !hasNextPage) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "200px" },
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const rows = data?.pages.flat() ?? [];

  if (isLoading) return <RankingSkeleton count={8} />;
  if (rows.length === 0)
    return (
      <EmptyState
        icon={<Flame />}
        title="Sem XP esta semana"
        description="Ganhe XP lendo, avaliando ou interagindo no feed para entrar no ranking semanal."
      />
    );

  return (
    <>
      <ol className="space-y-2">
        {rows.map((r) => {
          const isMe = r.id === user?.id;
          return (
            <li
              key={r.id}
              className={cn(
                "glass rounded-xl p-4 flex items-center gap-4 transition-all",
                isMe && "ring-2 ring-primary shadow-glow",
                r.position <= 3 && "p-5",
              )}
            >
              <div className="w-10 text-center font-display font-bold text-lg flex items-center justify-center">
                {podiumIcon(r.position) || (
                  <span className="text-muted-foreground">{r.position}</span>
                )}
              </div>
              <Avatar className={cn("w-12 h-12", r.position <= 3 && "ring-2 ring-primary/40")}>
                <AvatarImage src={r.avatar_url || undefined} />
                <AvatarFallback className="bg-gradient-gold text-primary-foreground font-display">
                  {(r.display_name || "?").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">
                  {r.display_name || "Leitor"}{" "}
                  {isMe && <span className="text-primary text-xs">(você)</span>}
                </p>
                <p className="text-xs text-muted-foreground">nv {r.level}</p>
              </div>
              <div className="text-right">
                <p className="font-display text-xl font-bold text-primary">
                  +{r.weekly_xp}
                </p>
                <p className="text-xs text-muted-foreground">XP semanal</p>
              </div>
              {!isMe && <FollowButton targetUserId={r.id} />}
            </li>
          );
        })}
      </ol>
      <div ref={sentinelRef} className="h-12 flex items-center justify-center">
        {isFetchingNextPage && (
          <span className="text-xs text-muted-foreground animate-pulse">
            Carregando mais…
          </span>
        )}
      </div>
    </>
  );
}

/* ---------------- GLOBAL ---------------- */
function GlobalTab() {
  const { user } = useAuth();
  const { data: rows = [], isLoading } = useRanking(100);

  if (isLoading) return <RankingSkeleton count={8} />;
  if (rows.length === 0)
    return (
      <EmptyState
        icon={<Trophy />}
        title="Ranking vazio"
        description="Ainda não há leitores no ranking. Seja o primeiro a ganhar XP."
      />
    );

  return (
    <ol className="space-y-2">
      {rows.map((r) => {
        const isMe = r.id === user?.id;
        return (
          <li
            key={r.id}
            className={cn(
              "glass rounded-xl p-4 flex items-center gap-4 transition-all",
              isMe && "ring-2 ring-primary shadow-glow",
              r.position <= 3 && "p-5",
            )}
          >
            <div className="w-10 text-center font-display font-bold text-lg flex items-center justify-center">
              {podiumIcon(r.position) || (
                <span className="text-muted-foreground">{r.position}</span>
              )}
            </div>
            <Avatar className={cn("w-12 h-12", r.position <= 3 && "ring-2 ring-primary/40")}>
              <AvatarImage src={r.avatar_url || undefined} />
              <AvatarFallback className="bg-gradient-gold text-primary-foreground font-display">
                {(r.display_name || "?").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">
                {r.display_name || "Leitor"}{" "}
                {isMe && <span className="text-primary text-xs">(você)</span>}
              </p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <BookOpen className="w-3 h-3" /> {r.books_read}
                </span>
                <span className="flex items-center gap-1">
                  <Star className="w-3 h-3" /> {r.reviews_count}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="font-display text-xl font-bold text-primary">{r.xp}</p>
              <p className="text-xs text-muted-foreground">XP · nv {r.level}</p>
            </div>
            {!isMe && <FollowButton targetUserId={r.id} />}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------- AMBASSADORS ---------------- */
function AmbassadorsTab() {
  const { user } = useAuth();
  const { data: rows = [], isLoading } = useAmbassadors(50);

  if (isLoading) return <RankingSkeleton count={8} />;
  if (rows.length === 0)
    return (
      <EmptyState
        icon={<Users2 />}
        title="Nenhum embaixador ainda"
        description="Convide amigos pelo seu link em /progresso para subir no ranking de embaixadores."
      />
    );

  return (
    <ol className="space-y-2">
      {rows.map((r) => {
        const isMe = r.id === user?.id;
        return (
          <li
            key={r.id}
            className={cn(
              "glass rounded-xl p-4 flex items-center gap-4 transition-all",
              isMe && "ring-2 ring-primary shadow-glow",
              r.position <= 3 && "p-5",
            )}
          >
            <div className="w-10 text-center font-display font-bold text-lg flex items-center justify-center">
              {podiumIcon(r.position) || (
                <span className="text-muted-foreground">{r.position}</span>
              )}
            </div>
            <Avatar className={cn("w-12 h-12", r.position <= 3 && "ring-2 ring-primary/40")}>
              <AvatarImage src={r.avatar_url || undefined} />
              <AvatarFallback className="bg-gradient-gold text-primary-foreground font-display">
                {(r.display_name || "?").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">
                {r.display_name || "Leitor"}{" "}
                {isMe && <span className="text-primary text-xs">(você)</span>}
              </p>
              <p className="text-xs text-primary font-medium">
                {TIER_LABEL[r.tier] || r.tier}
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-xl font-bold text-primary">
                {r.signups_count}
              </p>
              <p className="text-xs text-muted-foreground">
                convites · +{r.xp_earned} XP
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
