/**
 * /series — Minhas séries
 *
 * Mostra todas as séries (mangás/HQs) que o usuário está acompanhando,
 * agrupadas por status (em curso / concluídas / na fila), com barra de
 * progresso e atalho para o próximo volume.
 *
 * Respeita o filtro global ContentTypeFilter (mangá/comic).
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { useMySeries, type MySeriesRow } from "@/hooks/useMySeries";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { BookOpen, Layers, CheckCircle2, PlayCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContentTypeFilter, useContentFilter } from "@/components/books/ContentTypeFilter";
import { CONTENT_TYPE_ICON, CONTENT_TYPE_LABEL } from "@/types/book";
import { cn } from "@/lib/utils";

export default function MySeriesPage() {
  const { data, isLoading } = useMySeries();
  const { active: activeTypes, available } = useContentFilter();

  const filtered = useMemo<MySeriesRow[]>(() => {
    if (!data) return [];
    const set = new Set(activeTypes);
    return data.filter((s) => set.has(s.content_type));
  }, [data, activeTypes]);

  const groups = useMemo(() => {
    const inProgress: MySeriesRow[] = [];
    const completed: MySeriesRow[] = [];
    const queued: MySeriesRow[] = [];
    for (const s of filtered) {
      if (s.total_volumes && s.owned_count >= s.total_volumes) completed.push(s);
      else if (s.reading_count > 0 || s.read_count > 0) inProgress.push(s);
      else queued.push(s);
    }
    return { inProgress, completed, queued };
  }, [filtered]);

  // Filtra os tipos disponíveis para o filtro só com mangá+comic (séries não fazem sentido p/ livro/revista)
  const seriesTypes = available.filter((t) => t === "manga" || t === "comic");

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 md:pt-12 pb-20 max-w-5xl mx-auto">
        <header className="mb-6 animate-fade-in">
          <h1 className="font-display text-4xl md:text-5xl font-bold flex items-center gap-3">
            <Layers className="w-8 h-8 text-primary" /> Minhas séries
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm md:text-base">
            Acompanhe o progresso das suas coleções de mangás e quadrinhos
          </p>
        </header>

        {seriesTypes.length > 1 && <ContentTypeFilter className="mb-6" />}

        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-2xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Layers />}
            title="Nenhuma série ainda"
            description="Adicione um mangá ou HQ à sua biblioteca para começar a acompanhar séries aqui."
            action={
              <Link to="/buscar">
                <Button variant="hero" className="gap-2">
                  <Search className="w-4 h-4" /> Buscar mangás
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="space-y-10">
            {groups.inProgress.length > 0 && (
              <Section
                icon={<PlayCircle className="w-4 h-4" />}
                title="Em andamento"
                items={groups.inProgress}
              />
            )}
            {groups.queued.length > 0 && (
              <Section
                icon={<BookOpen className="w-4 h-4" />}
                title="Na fila"
                items={groups.queued}
              />
            )}
            {groups.completed.length > 0 && (
              <Section
                icon={<CheckCircle2 className="w-4 h-4" />}
                title="Concluídas"
                items={groups.completed}
              />
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Section({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: MySeriesRow[];
}) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-3">
        {icon} {title} <span className="tabular-nums opacity-70">· {items.length}</span>
      </h2>
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((s) => (
          <li key={s.id}>
            <SeriesCard s={s} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SeriesCard({ s }: { s: MySeriesRow }) {
  const total = s.total_volumes ?? Math.max(s.owned_count, s.read_count);
  const pct = s.completion_pct; // agora baseado em owned_count
  const complete = total > 0 && s.owned_count >= total;

  return (
    <Link
      to={`/serie/${s.id}`}
      className={cn(
        "group glass rounded-2xl p-4 flex gap-3 hover:border-primary/40 transition-all relative overflow-hidden",
        complete && "ring-1 ring-primary/30",
      )}
    >
      {/* Pct badge destaque */}
      {pct > 0 && (
        <div className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full bg-primary/15 backdrop-blur text-primary text-[10px] font-bold tabular-nums">
          {pct}%
        </div>
      )}
      <div className="w-16 h-24 shrink-0 rounded-md overflow-hidden bg-muted shadow-book">
        {s.cover_url ? (
          <img
            src={s.cover_url}
            alt={s.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-muted-foreground">
            <BookOpen className="w-6 h-6" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span aria-hidden>{CONTENT_TYPE_ICON[s.content_type]}</span>
          {CONTENT_TYPE_LABEL[s.content_type]}
          {s.status && <span className="opacity-60">· {s.status}</span>}
        </div>
        <h3 className="font-display font-semibold leading-tight line-clamp-2 group-hover:text-primary transition-colors pr-10">
          {s.title}
        </h3>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{s.authors[0]}</p>

        <div className="mt-auto pt-3 space-y-1">
          <div className="flex items-center justify-between text-[11px] tabular-nums">
            <span className="text-muted-foreground">
              {s.owned_count} / {total || "?"} {complete ? "✓" : ""}
              {s.read_count > 0 && (
                <span className="opacity-60"> · {s.read_count} lidos</span>
              )}
            </span>
            {!complete && s.next_volume != null && (
              <span className="text-primary font-medium">próximo: vol. {s.next_volume}</span>
            )}
          </div>
          <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                complete ? "bg-primary" : "bg-gradient-to-r from-primary/70 to-primary",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          {s.missing_count != null && s.missing_count > 0 && (
            <p className="text-[10px] text-muted-foreground/80">
              Faltam <span className="font-semibold text-foreground/80">{s.missing_count}</span> volume{s.missing_count !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
