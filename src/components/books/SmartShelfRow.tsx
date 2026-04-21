import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookCover } from "./BookCover";
import { CinematicShelf, ShelfItem } from "./CinematicShelf";
import { QuickActionsMenu } from "./QuickActionsMenu";
import { Star } from "lucide-react";
import type { UserBook } from "@/types/book";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

interface Props {
  id: string;
  title: string;
  subtitle?: string;
  items: UserBook[];
}

const LONG_PRESS_MS = 500;

/**
 * Prateleira Netflix-like genérica para a biblioteca.
 *
 * - Hover (desktop): mostra overlay + botão de ações rápidas
 * - Long-press (mobile): abre o menu de ações sem navegar
 * - Toque/click curto: abre o detalhe mantendo contexto da prateleira
 */
export function SmartShelfRow({ id, title, subtitle, items }: Props) {
  if (!items.length) return null;

  return (
    <CinematicShelf title={title} subtitle={subtitle}>
      {items.map((ub) => (
        <ShelfItem key={`${id}-${ub.id}`} width="wide">
          <SmartShelfCard shelfId={id} shelfTitle={title} ub={ub} />
        </ShelfItem>
      ))}
    </CinematicShelf>
  );
}

function SmartShelfCard({
  shelfId,
  shelfTitle,
  ub,
}: {
  shelfId: string;
  shelfTitle: string;
  ub: UserBook;
}) {
  const navigate = useNavigate();
  const [actionsOpen, setActionsOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  if (!ub.book) return null;
  const total = ub.book.page_count || 0;
  const current = ub.current_page || 0;
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const showProgress = ub.status === "reading" && pct > 0 && pct < 100;

  const startLongPress = () => {
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      haptic("toggle");
      setActionsOpen(true);
    }, LONG_PRESS_MS);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const handleClick = (e: React.MouseEvent) => {
    if (longPressFired.current) {
      e.preventDefault();
      longPressFired.current = false;
      return;
    }
    haptic("tap");
  };
  const handleTouchEnd = () => {
    cancelLongPress();
    // Programmatic navigation acontece via Link click — só impedimos via handleClick
  };

  // Quando o menu abre via long-press, ainda precisamos suprimir o link uma vez.
  // O click handler já cuida disso porque longPressFired === true.

  return (
    <div className="relative group/sc">
      <Link
        to={`/livro/${ub.book.id}`}
        state={{ shelfId, shelfTitle }}
        onClick={handleClick}
        onTouchStart={startLongPress}
        onTouchEnd={handleTouchEnd}
        onTouchMove={cancelLongPress}
        onTouchCancel={cancelLongPress}
        onContextMenu={(e) => {
          // Long-press desktop ou mobile: abre o menu, não o context menu nativo
          e.preventDefault();
          setActionsOpen(true);
        }}
        className="block animate-fade-in select-none"
        aria-label={ub.book.title}
      >
        <div className="relative">
          <BookCover
            book={ub.book}
            size="lg"
            interactive={false}
            className="w-full h-auto aspect-[2/3] group-hover/sc:shadow-elevated transition-all duration-300 group-hover/sc:scale-[1.03]"
          />
          {/* Overlay no hover (desktop) */}
          <div
            className={cn(
              "absolute inset-0 rounded-md bg-gradient-to-t from-background/95 via-background/50 to-transparent",
              "opacity-0 group-hover/sc:opacity-100 transition-opacity duration-300",
              "flex flex-col justify-end p-3 gap-1 pointer-events-none",
            )}
          >
            {ub.rating ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                <Star className="w-3 h-3 fill-current" /> {ub.rating}/5
              </span>
            ) : null}
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Toque para abrir
            </span>
          </div>

          {/* Barra de progresso */}
          {showProgress && (
            <div className="absolute bottom-1.5 left-1.5 right-1.5 h-1 rounded-full bg-background/60 overflow-hidden backdrop-blur-sm">
              <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>

        <div className="mt-2 px-0.5">
          <p className="font-display text-sm font-semibold leading-tight line-clamp-2 group-hover/sc:text-primary transition-colors">
            {ub.book.title}
          </p>
          {ub.book.authors?.[0] && (
            <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
              {ub.book.authors[0]}
            </p>
          )}
        </div>
      </Link>

      {/* Botão de ações rápidas — visível no hover (desktop) e controlado via long-press (mobile) */}
      <div
        className={cn(
          "absolute top-2 right-2 z-10",
          "opacity-0 group-hover/sc:opacity-100 transition-opacity duration-200",
          actionsOpen && "opacity-100",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <QuickActionsMenu
          ub={ub}
          open={actionsOpen}
          onOpenChange={setActionsOpen}
        />
      </div>
    </div>
  );
}
