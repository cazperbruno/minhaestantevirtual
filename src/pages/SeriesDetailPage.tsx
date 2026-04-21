/**
 * Página de detalhe de uma série (mangá / HQ) — modo colecionador.
 * - Banner (anilist) + capa + sinopse
 * - Card colecionador com % progresso + média global
 * - Timeline vertical estilo "feed do Telegram" com volumes possuídos + faltantes
 */
import { useParams, Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { useSeriesDetail } from "@/hooks/useSeries";
import { BookCover } from "@/components/books/BookCover";
import { Skeleton } from "@/components/ui/skeleton";
import { ContentTypeBadge } from "@/components/books/ContentTypeBadge";
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { SeriesTimeline } from "@/components/series/SeriesTimeline";
import { CollectorRankCard } from "@/components/series/CollectorRankCard";

const STATUS_LABEL: Record<string, string> = {
  finished: "Finalizada",
  ongoing: "Em curso",
  hiatus: "Em hiato",
  cancelled: "Cancelada",
  upcoming: "Em breve",
};

export default function SeriesDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, isLoading } = useSeriesDetail(id);

  if (isLoading) {
    return (
      <AppShell>
        <div className="px-5 md:px-10 pt-10 pb-20 max-w-5xl mx-auto">
          <Skeleton className="h-72 w-full rounded-2xl mb-6" />
          <Skeleton className="h-8 w-1/2 mb-3" />
          <Skeleton className="h-4 w-2/3 mb-10" />
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell>
        <div className="px-6 py-32 text-center">
          <p className="text-lg mb-3">Série não encontrada</p>
          <Link to="/" className="text-primary underline">Voltar ao início</Link>
        </div>
      </AppShell>
    );
  }

  const { series, owned_count, total, completion_pct, missing_count, ranking } = data;
  const banner = (series as any).raw?.banner_url as string | undefined;

  return (
    <AppShell>
      <div className="relative">
        {banner && (
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-72 -z-10 bg-cover bg-center opacity-25"
            style={{ backgroundImage: `url(${banner})`, filter: "blur(2px) saturate(120%)" }}
          />
        )}
        <div className="absolute inset-x-0 top-0 h-96 -z-10 bg-gradient-to-b from-transparent to-background" />

        <div className="px-5 md:px-10 pt-10 md:pt-16 pb-12 max-w-5xl mx-auto">
          <div className="grid md:grid-cols-[220px_1fr] gap-8 items-start">
            <div className="mx-auto md:mx-0 animate-scale-in drop-shadow-[0_25px_50px_hsl(var(--primary)/0.25)]">
              <BookCover
                book={{ id: series.id, title: series.title, authors: series.authors, cover_url: series.cover_url } as any}
                size="xl"
              />
            </div>
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 flex-wrap">
                <ContentTypeBadge type={series.content_type} showBook />
                {series.status && STATUS_LABEL[series.status] && (
                  <Badge variant="secondary" className="text-xs">{STATUS_LABEL[series.status]}</Badge>
                )}
                {series.source === "anilist" && (
                  <Badge variant="outline" className="text-xs">via AniList</Badge>
                )}
                {series.source === "auto-detected" && (
                  <Badge variant="outline" className="text-xs">Auto-agrupada</Badge>
                )}
              </div>
              <h1 className="font-display text-4xl md:text-6xl font-bold leading-tight">
                {series.title}
              </h1>
              <p className="text-foreground/90 text-lg">
                {series.authors.length > 0 ? series.authors.join(", ") : "Autor desconhecido"}
              </p>
              {series.description && (
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-5 max-w-2xl">
                  {series.description}
                </p>
              )}

              {/* Card colecionador */}
              <div className="pt-4">
                <CollectorRankCard
                  myCompletionPct={completion_pct}
                  collectors={ranking?.collectors}
                  avgCompletion={ranking?.avg_completion}
                  missingCount={missing_count}
                  total={total}
                />
              </div>
            </div>
          </div>

          {/* Timeline vertical de volumes */}
          <section className="mt-12">
            <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
              <h2 className="font-display text-2xl font-bold flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                Coleção
                <span className="text-sm font-normal text-muted-foreground tabular-nums">
                  · {owned_count}/{total} {total > 0 ? `(${completion_pct}%)` : ""}
                </span>
              </h2>
            </div>

            <SeriesTimeline detail={data} canEdit={!!user} />
          </section>
        </div>
      </div>
    </AppShell>
  );
}
