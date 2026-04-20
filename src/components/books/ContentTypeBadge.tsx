/**
 * Badge sutil de tipo de conteúdo (mangá/HQ/revista).
 * Não mostra para livros (default) — evita poluição.
 */
import { CONTENT_TYPE_ICON, CONTENT_TYPE_LABEL, type ContentType } from "@/types/book";
import { cn } from "@/lib/utils";

interface Props {
  type?: ContentType | null;
  className?: string;
  /** Mostra também livros (default: esconde para zero ruído). */
  showBook?: boolean;
}

export function ContentTypeBadge({ type, className, showBook = false }: Props) {
  if (!type) return null;
  if (type === "book" && !showBook) return null;
  return (
    <span
      title={CONTENT_TYPE_LABEL[type]}
      aria-label={CONTENT_TYPE_LABEL[type]}
      className={cn(
        "inline-flex items-center justify-center w-6 h-6 rounded-full bg-background/85 backdrop-blur-sm text-sm shadow-sm border border-border/60",
        className,
      )}
    >
      <span aria-hidden>{CONTENT_TYPE_ICON[type]}</span>
    </span>
  );
}
