import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { useXpHistory, groupByDay, type XpEvent } from "@/hooks/useXpHistory";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Sparkles, ArrowLeft, BookPlus, BookCheck, Star, ScanLine, MessageCircle,
  Heart, UserPlus, Users2, Library, Sunrise, Trophy, Flame, Gift, Award, AtSign, Smile,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SOURCE_META: Record<string, { label: string; icon: any; tint: string }> = {
  add_book:        { label: "Livro adicionado",     icon: BookPlus,     tint: "text-emerald-400" },
  finish_book:     { label: "Leitura concluída",    icon: BookCheck,    tint: "text-primary" },
  rate_book:       { label: "Avaliação registrada", icon: Star,         tint: "text-amber-400" },
  scan_book:       { label: "Scanner usado",        icon: ScanLine,     tint: "text-sky-400" },
  write_review:    { label: "Resenha publicada",    icon: MessageCircle,tint: "text-purple-400" },
  like_review:     { label: "Curtida no feed",      icon: Heart,        tint: "text-pink-400" },
  comment_review:  { label: "Comentário no feed",   icon: MessageCircle,tint: "text-violet-400" },
  follow:          { label: "Novo leitor seguido",  icon: UserPlus,     tint: "text-cyan-400" },
  club_message:    { label: "Mensagem em clube",    icon: Users2,       tint: "text-indigo-400" },
  club_reaction_received: { label: "Reação recebida no clube", icon: Smile, tint: "text-rose-400" },
  club_mention:    { label: "Mencionado no clube",   icon: AtSign,       tint: "text-fuchsia-400" },
  loan_book:       { label: "Empréstimo registrado",icon: Library,      tint: "text-amber-300" },
  open_app:        { label: "Visita diária",        icon: Sunrise,      tint: "text-orange-300" },
  challenge:       { label: "Desafio completado",   icon: Trophy,       tint: "text-primary" },
  streak_milestone:{ label: "Marco de ofensiva!",   icon: Flame,        tint: "text-orange-500" },
  invite_signup:   { label: "Amigo convidado",      icon: Gift,         tint: "text-pink-300" },
  invite_welcome:  { label: "Bem-vindo ao Readify", icon: Award,        tint: "text-primary" },
  legacy:          { label: "XP retroativo",        icon: Sparkles,     tint: "text-muted-foreground" },
  misc:            { label: "+XP",                  icon: Sparkles,     tint: "text-muted-foreground" },
};

function metaFor(src: string) {
  return SOURCE_META[src] ?? { label: src, icon: Sparkles, tint: "text-muted-foreground" };
}

function formatDay(day: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yest = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  if (day === today) return "Hoje";
  if (day === yest) return "Ontem";
  return new Date(day + "T00:00:00").toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function XpHistoryPage() {
  const { user } = useAuth();
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useXpHistory(user?.id);
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

  const events = data?.pages.flat() ?? [];
  const totalXp = events.reduce((s, e) => s + e.amount, 0);
  const groups = groupByDay(events);

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 pb-16 max-w-3xl mx-auto space-y-6 animate-fade-in">
        <header>
          <Link
            to="/progresso"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition mb-3"
          >
            <ArrowLeft className="w-4 h-4" /> Progresso
          </Link>
          <h1 className="font-display text-4xl font-bold text-gradient-gold flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-primary" /> Histórico de XP
          </h1>
          <p className="text-muted-foreground mt-1">
            Cada ação recompensada — em ordem cronológica
          </p>
        </header>

        {!isLoading && events.length > 0 && (
          <div className="glass rounded-2xl p-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                XP nas últimas {events.length} ações
              </p>
              <p className="font-display text-3xl font-black text-primary tabular-nums">
                +{totalXp}
              </p>
            </div>
            <Sparkles className="w-10 h-10 text-primary/40" />
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            icon={<Sparkles />}
            title="Nenhum XP ainda"
            description="Adicione livros, faça resenhas e use o scanner para começar a acumular XP."
          />
        ) : (
          <div className="space-y-6">
            {groups.map((g) => (
              <DayGroup key={g.day} day={g.day} total={g.total} events={g.events} />
            ))}
          </div>
        )}

        <div ref={sentinelRef} className="h-12 flex items-center justify-center">
          {isFetchingNextPage && (
            <span className="text-xs text-muted-foreground animate-pulse">
              Carregando mais…
            </span>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function DayGroup({ day, total, events }: { day: string; total: number; events: XpEvent[] }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
          {formatDay(day)}
        </h3>
        <span className="text-xs font-bold text-primary tabular-nums">+{total} XP</span>
      </div>
      <ol className="space-y-1.5">
        {events.map((e) => {
          const m = metaFor(e.source);
          const Icon = m.icon;
          return (
            <li
              key={e.id}
              className="glass rounded-xl p-3 flex items-center gap-3 transition-all hover:translate-x-0.5"
            >
              <div className={cn("h-9 w-9 rounded-lg bg-muted/30 flex items-center justify-center shrink-0", m.tint)}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{m.label}</p>
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  {formatTime(e.created_at)}
                </p>
              </div>
              <span className="font-display text-base font-bold text-primary tabular-nums shrink-0">
                +{e.amount}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
