import { AppShell } from "@/components/layout/AppShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy, Medal, BookOpen, Star } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { FollowButton } from "@/components/social/FollowButton";
import { RankingSkeleton } from "@/components/ui/skeletons";
import { EmptyState } from "@/components/ui/empty-state";
import { useRanking } from "@/hooks/useRanking";

export default function RankingPage() {
  const { user } = useAuth();
  const { data: rows = [], isLoading } = useRanking(100);

  const podiumIcon = (pos: number) => {
    if (pos === 1) return <Trophy className="w-6 h-6 text-primary" />;
    if (pos === 2) return <Medal className="w-6 h-6 text-muted-foreground" />;
    if (pos === 3) return <Medal className="w-6 h-6 text-primary/60" />;
    return null;
  };

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 pb-16 max-w-3xl mx-auto">
        <header className="mb-8 animate-fade-in">
          <h1 className="font-display text-4xl font-bold text-gradient-gold flex items-center gap-3">
            <Trophy className="w-8 h-8 text-primary" /> Ranking
          </h1>
          <p className="text-muted-foreground mt-1">Top leitores da comunidade</p>
        </header>

        {isLoading ? (
          <RankingSkeleton count={8} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Trophy />}
            title="Ranking vazio"
            description="Ainda não há leitores no ranking. Seja o primeiro a ganhar XP lendo e avaliando livros."
          />
        ) : (
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
                    {podiumIcon(r.position) || <span className="text-muted-foreground">{r.position}</span>}
                  </div>
                  <Avatar className={cn("w-12 h-12", r.position <= 3 && "ring-2 ring-primary/40")}>
                    <AvatarImage src={r.avatar_url || undefined} />
                    <AvatarFallback className="bg-gradient-gold text-primary-foreground font-display">
                      {(r.display_name || "?").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{r.display_name || "Leitor"} {isMe && <span className="text-primary text-xs">(você)</span>}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> {r.books_read}</span>
                      <span className="flex items-center gap-1"><Star className="w-3 h-3" /> {r.reviews_count}</span>
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
        )}
      </div>
    </AppShell>
  );
}
