/**
 * Timeline vertical estilo "feed do Telegram" listando todos os volumes
 * de uma série em ordem, intercalando volumes possuídos e faltantes.
 *
 * Destaca:
 * - ✔ verde = lido
 * - 📖 azul = lendo
 * - ○ cinza = possui mas não leu
 * - tracejado = falta na coleção (CTA Amazon)
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, BookOpen, Circle } from "lucide-react";
import { BookCover } from "@/components/books/BookCover";
import { MissingVolumeRow } from "./MissingVolumeRow";
import { AddVolumeDialog } from "./AddVolumeDialog";
import type { SeriesDetail, SeriesVolume } from "@/hooks/useSeries";
import { cn } from "@/lib/utils";

interface Props {
  detail: SeriesDetail;
  canEdit: boolean;
}

export function SeriesTimeline({ detail, canEdit }: Props) {
  const { series, volumes } = detail;
  const [addOpen, setAddOpen] = useState(false);

  /** Constrói a sequência completa de slots: 1..total_volumes */
  const slots = useMemo(() => {
    const ownedByNum = new Map<number, SeriesVolume>();
    let maxOwned = 0;
    for (const v of volumes) {
      if (typeof v.volume_number === "number") {
        ownedByNum.set(v.volume_number, v);
        if (v.volume_number > maxOwned) maxOwned = v.volume_number;
      }
    }
    // Total: usa o conhecido, ou pelo menos o maior volume + 1 (para sugerir próximo)
    const total = series.total_volumes ?? Math.max(maxOwned, volumes.length);
    const out: Array<{ kind: "owned" | "missing" | "loose"; vol: number; book?: SeriesVolume }> = [];
    if (total <= 0) {
      // Sem total — só mostra os possuídos
      for (const v of volumes) {
        out.push({ kind: "owned", vol: v.volume_number ?? 0, book: v });
      }
      return out;
    }
    for (let i = 1; i <= total; i++) {
      const b = ownedByNum.get(i);
      if (b) out.push({ kind: "owned", vol: i, book: b });
      else out.push({ kind: "missing", vol: i });
    }
    // Volumes "soltos" sem volume_number
    for (const v of volumes) {
      if (v.volume_number == null) out.push({ kind: "loose", vol: 0, book: v });
    }
    return out;
  }, [volumes, series.total_volumes]);

  if (slots.length === 0) {
    return (
      <div className="glass rounded-2xl p-8 text-center text-muted-foreground text-sm">
        Nenhum volume cadastrado ainda.
      </div>
    );
  }

  return (
    <>
      <ol className="relative space-y-2.5 before:absolute before:left-[27px] before:top-2 before:bottom-2 before:w-0.5 before:bg-gradient-to-b before:from-primary/40 before:via-primary/20 before:to-transparent">
        {slots.map((slot, i) => {
          if (slot.kind === "missing") {
            return (
              <li key={`miss-${slot.vol}`} className="relative pl-14 animate-fade-in">
                <span className="absolute left-5 top-5 z-10 w-3 h-3 rounded-full bg-muted border-2 border-dashed border-muted-foreground/40" />
                <MissingVolumeRow
                  seriesTitle={series.title}
                  volumeNumber={slot.vol}
                  onAddManually={canEdit ? () => setAddOpen(true) : undefined}
                />
              </li>
            );
          }
          const v = slot.book!;
          const status = v.user_book?.status;
          const dotColor =
            status === "read"
              ? "bg-status-read"
              : status === "reading"
                ? "bg-status-reading"
                : "bg-muted-foreground/30";
          const Icon =
            status === "read" ? CheckCircle2 : status === "reading" ? BookOpen : Circle;
          const iconClass =
            status === "read"
              ? "text-status-read"
              : status === "reading"
                ? "text-status-reading"
                : "text-muted-foreground/60";
          return (
            <li
              key={v.id}
              className="relative pl-14 animate-fade-in"
              style={{ animationDelay: `${Math.min(i * 20, 400)}ms` }}
            >
              <span
                className={cn(
                  "absolute left-5 top-5 z-10 w-3 h-3 rounded-full ring-4 ring-background",
                  dotColor,
                )}
              />
              <Link
                to={`/livro/${v.id}`}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl border bg-card hover:border-primary/50 hover:shadow-sm transition-all group",
                  status === "read" && "border-status-read/30",
                  status === "reading" && "border-status-reading/40 ring-1 ring-status-reading/20",
                )}
              >
                <div className="w-12 h-16 shrink-0">
                  <BookCover book={v} size="xs" className="!w-12 !h-16" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                    {slot.vol > 0 && <span className="font-bold tabular-nums">Vol. #{slot.vol}</span>}
                    <Icon className={cn("w-3.5 h-3.5", iconClass)} />
                    <span className="opacity-70">
                      {status === "read"
                        ? "Lido"
                        : status === "reading"
                          ? "Lendo"
                          : "Não lido"}
                    </span>
                  </div>
                  <p className="font-display font-semibold text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors mt-0.5">
                    {v.title}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
      {canEdit && (
        <AddVolumeDialog open={addOpen} onOpenChange={setAddOpen} detail={detail} />
      )}
    </>
  );
}
