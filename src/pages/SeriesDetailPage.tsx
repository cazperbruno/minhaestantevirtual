/**
 * Página de detalhe de uma série (mangá / HQ).
 * Mostra capa, banner (se anilist), sinopse, e lista de volumes com progresso.
 */
import { useParams, Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { useSeriesDetail } from "@/hooks/useSeries";
import { BookCover } from "@/components/books/BookCover";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ContentTypeBadge } from "@/components/books/ContentTypeBadge";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, BookOpen, Circle } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  finished: "Finalizada",
  ongoing: "Em curso",
  hiatus: "Em hiato",
  cancelled: "Cancelada",
  upcoming: "Em breve",
};

export default function SeriesDetailPage() {
  const { id } = useParams();
  const { data, isLoading } = useSeriesDetail(id);

  if (isLoading) {
    return (
      <AppShell>
        <div className="px-5 md:px-10 pt-10 pb-20 max-w-5xl mx-auto">
          <Skeleton className="h-72 w-full rounded-2xl mb-6" />
          <Skeleton className="h-8 w-1/2 mb-3" />
          <Skeleton className="h-4 w-2/3 mb-10" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[2/3]" />
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

  const { series, volumes, read_count, total } = data;
  const banner = (series as any).raw?.banner_url as string | undefined;
  const progressPct = total > 0 ? Math.round((read_count / total) * 100) : 0;

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

              {/* Progresso global */}
              <div className="max-w-md pt-2">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">
                    Progresso: <span className="text-foreground font-semibold tabular-nums">{read_count}/{total}</span>
                  </span>
                  <span className="font-semibold text-primary tabular-nums">{progressPct}%</span>
                </div>
                <Progress value={progressPct} className="h-2" />
              </div>
            </div>
          </div>

          {/* Volumes */}
          <section className="mt-14">
            <h2 className="font-display text-2xl font-bold mb-5 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              Volumes
              <span className="text-sm font-normal text-muted-foreground tabular-nums">
                · {volumes.length} {volumes.length === 1 ? "no acervo" : "no acervo"}
              </span>
            </h2>

            {volumes.length === 0 ? (
              <div className="glass rounded-2xl p-8 text-center text-muted-foreground text-sm">
                Nenhum volume cadastrado ainda. Adicione volumes a esta série para acompanhar seu progresso.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-5 gap-y-8">
                {volumes.map((v) => {
                  const status = v.user_book?.status;
                  const dot =
                    status === "read" ? <CheckCircle2 className="w-4 h-4 text-status-read" /> :
                    status === "reading" ? <BookOpen className="w-4 h-4 text-status-reading" /> :
                    <Circle className="w-4 h-4 text-muted-foreground/40" />;
                  return (
                    <Link key={v.id} to={`/livro/${v.id}`} className="group block animate-fade-in">
                      <div className="relative">
                        <BookCover book={v} size="md" className="mx-auto group-hover:shadow-elevated" />
                        <div className="absolute top-1.5 left-1.5 z-10 w-7 h-7 rounded-full bg-background/90 backdrop-blur-sm border border-border/60 shadow-sm flex items-center justify-center">
                          {dot}
                        </div>
                        {v.volume_number != null && (
                          <div className="absolute bottom-1.5 right-1.5 z-10 px-2 py-0.5 rounded-full bg-background/90 backdrop-blur-sm border border-border/60 text-[10px] font-semibold tabular-nums">
                            #{v.volume_number}
                          </div>
                        )}
                      </div>
                      <h3 className="mt-2.5 px-1 font-display font-semibold text-xs leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                        {v.title}
                      </h3>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
