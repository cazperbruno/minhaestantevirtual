import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, Users, Sparkles, Search, Loader2, User as UserIcon } from "lucide-react";
import { useFeed, useToggleReviewLike, FeedReview } from "@/hooks/useFeed";
import { useActivityFeed, useToggleActivityLike, ActivityItem } from "@/hooks/useActivityFeed";
import { usePublicRecommendations } from "@/hooks/useRecommendations";
import { RecommendationCard } from "@/components/books/RecommendationCard";
import { ContentTypeFilter, useContentFilter } from "@/components/books/ContentTypeFilter";
import { ReviewFeedCard } from "@/components/social/ReviewFeedCard";
import { ActivityCard } from "@/components/social/ActivityCard";
import { FeedStoriesBar } from "@/components/social/FeedStoriesBar";

type FeedRow =
  | { kind: "review"; ts: string; id: string; review: FeedReview }
  | { kind: "activity"; ts: string; id: string; activity: ActivityItem };

export default function FeedPage() {
  const [tab, setTab] = useState<"all" | "following" | "you">("all");
  const {
    data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useFeed(tab);
  const {
    data: actsData, fetchNextPage: fetchActs, hasNextPage: hasMoreActs,
    isFetchingNextPage: isFetchingActs,
  } = useActivityFeed(tab);
  const toggleLike = useToggleReviewLike(tab);
  const toggleActivityLike = useToggleActivityLike(tab);
  // Refs estáveis para que o memo dos cards funcione
  const handleToggleLike = useCallback((rev: FeedReview) => toggleLike.mutate(rev), [toggleLike]);
  const handleToggleActivityLike = useCallback(
    (a: ActivityItem) => toggleActivityLike.mutate(a),
    [toggleActivityLike],
  );
  const { data: recsData } = usePublicRecommendations();
  const recs = useMemo(() => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const p of recsData?.pages ?? []) {
      for (const r of p.items) {
        if (!seen.has(r.id)) { seen.add(r.id); out.push(r); }
      }
    }
    return out.slice(0, 5); // só os 5 mais recentes no topo
  }, [recsData]);

  const { active: activeTypes, available } = useContentFilter();

  // Mescla resenhas + atividades em ordem cronológica única, com dedupe e
  // filtro por content_type/usuários silenciados.
  const rows = useMemo<FeedRow[]>(() => {
    const seen = new Set<string>();
    const typeSet = new Set(activeTypes);
    let muted: Set<string>;
    try {
      muted = new Set<string>(JSON.parse(sessionStorage.getItem("muted_users") || "[]"));
    } catch { muted = new Set(); }

    const out: FeedRow[] = [];

    for (const page of data?.pages ?? []) {
      for (const r of page.items) {
        const k = `r:${r.id}`;
        if (seen.has(k)) continue;
        if (muted.has(r.user_id)) continue;
        const t = (r.book?.content_type ?? "book") as string;
        if (!typeSet.has(t as any)) continue;
        seen.add(k);
        out.push({ kind: "review", ts: r.created_at, id: r.id, review: r });
      }
    }
    for (const page of actsData?.pages ?? []) {
      for (const a of page.items) {
        const k = `a:${a.id}`;
        if (seen.has(k)) continue;
        if (muted.has(a.user_id)) continue;
        if (a.book) {
          const t = (a.book?.content_type ?? "book") as string;
          if (!typeSet.has(t as any)) continue;
        }
        seen.add(k);
        out.push({ kind: "activity", ts: a.created_at, id: a.id, activity: a });
      }
    }

    out.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
    return out;
  }, [data, actsData, activeTypes]);

  // IntersectionObserver — dispara fetch quando sentinela entra na viewport.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        if (hasMoreActs && !isFetchingActs) fetchActs();
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, hasMoreActs, isFetchingActs, fetchActs]);

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 md:pt-12 pb-20 max-w-2xl mx-auto">
        <header className="mb-6 animate-fade-in">
          <h1 className="font-display text-4xl md:text-5xl font-bold">Feed</h1>
          <p className="text-muted-foreground mt-1.5 text-sm md:text-base">
            Resenhas frescas da comunidade leitora
          </p>
        </header>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mb-4 sticky top-0 z-10 -mx-5 px-5 md:mx-0 md:px-0 py-2 bg-background/85 backdrop-blur-xl border-b border-border/30">
          <TabsList className="grid grid-cols-3 max-w-md">
            <TabsTrigger value="you" className="gap-1.5"><UserIcon className="w-3.5 h-3.5" /> Você</TabsTrigger>
            <TabsTrigger value="following" className="gap-1.5"><Users className="w-3.5 h-3.5" /> Seguindo</TabsTrigger>
            <TabsTrigger value="all" className="gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> Todos</TabsTrigger>
          </TabsList>
        </Tabs>

        {available.length > 1 && <ContentTypeFilter className="mb-5" />}

        {tab === "all" && <FeedStoriesBar />}

        {tab === "all" && recs.length > 0 && (
          <section className="mb-6 space-y-4">
            <h2 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-primary" /> Recomendações da comunidade
            </h2>
            <ul className="space-y-4">
              {recs.map((r) => (
                <li key={r.id}><RecommendationCard rec={r} /></li>
              ))}
            </ul>
          </section>
        )}

        {isLoading ? (
          <ul className="space-y-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="glass rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-2.5 w-24" />
                  </div>
                </div>
                <div className="flex gap-3">
                  <Skeleton className="w-16 h-24 rounded-md" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
              </li>
            ))}
          </ul>
        ) : reviews.length === 0 ? (
          <EmptyFeed tab={tab} />
        ) : (
          <>
            <ul className="space-y-5">
              {reviews.map((r) => (
                <li key={r.id}>
                  <ReviewFeedCard review={r} onToggleLike={handleToggleLike} />
                </li>
              ))}
            </ul>

            {/* Sentinela do IntersectionObserver */}
            <div ref={sentinelRef} className="h-10" aria-hidden />

            {isFetchingNextPage && (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            )}
            {!hasNextPage && reviews.length >= 20 && (
              <p className="text-center text-xs text-muted-foreground italic py-8">
                Você chegou ao fim ✨
              </p>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function EmptyFeed({ tab }: { tab: "all" | "following" | "you" }) {
  const icon = tab === "following" ? <Users className="w-9 h-9 text-primary/60" />
    : tab === "you" ? <UserIcon className="w-9 h-9 text-primary/60" />
    : <Sparkles className="w-9 h-9 text-primary/60" />;
  const title = tab === "following" ? "Você ainda não segue ninguém"
    : tab === "you" ? "Você ainda não publicou nada"
    : "O feed está silencioso";
  const desc = tab === "following" ? "Encontre leitores e siga suas resenhas para ver tudo aqui."
    : tab === "you" ? "Suas resenhas e atualizações aparecem aqui."
    : "Seja a primeira pessoa a publicar uma resenha hoje.";
  const ctaTo = tab === "following" ? "/ranking" : tab === "you" ? "/biblioteca" : "/buscar";
  const ctaLabel = tab === "following" ? <><Users className="w-4 h-4" /> Descobrir leitores</>
    : tab === "you" ? <><Sparkles className="w-4 h-4" /> Ir para biblioteca</>
    : <><Search className="w-4 h-4" /> Buscar livros</>;
  return (
    <div className="text-center py-16 px-6 max-w-md mx-auto animate-fade-in">
      <div className="w-20 h-20 rounded-3xl bg-gradient-spine border border-border mx-auto mb-5 flex items-center justify-center shadow-book">
        {icon}
      </div>
      <h2 className="font-display text-2xl font-semibold mb-2">{title}</h2>
      <p className="text-muted-foreground text-sm mb-6">{desc}</p>
      <Link to={ctaTo}>
        <Button variant="hero" className="gap-2">{ctaLabel}</Button>
      </Link>
    </div>
  );
}
