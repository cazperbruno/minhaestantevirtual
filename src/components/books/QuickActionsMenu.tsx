import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, BookOpen, CheckCircle2, Heart, ShoppingBag, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpdateUserBook } from "@/hooks/useLibrary";
import { openAmazon } from "@/lib/amazon";
import { haptic } from "@/lib/haptics";
import { toast } from "sonner";
import type { UserBook, BookStatus } from "@/types/book";
import { cn } from "@/lib/utils";

interface Props {
  ub: UserBook;
  /** Permite controlar abertura externamente (ex: long-press do card pai). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

const STATUS_ACTIONS: { value: BookStatus; label: string; icon: typeof BookOpen }[] = [
  { value: "reading", label: "Marcar como lendo", icon: BookOpen },
  { value: "read", label: "Marcar como lido", icon: CheckCircle2 },
  { value: "wishlist", label: "Quero ler", icon: Heart },
];

/**
 * Ações rápidas sobre um livro da biblioteca, sem precisar abrir o detalhe.
 * - Desktop: aparece no hover do card.
 * - Mobile: o componente pai dispara `open` via long-press (controlled).
 */
export function QuickActionsMenu({ ub, open, onOpenChange, className }: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const value = isControlled ? open : internalOpen;
  const setValue = (v: boolean) => {
    if (!isControlled) setInternalOpen(v);
    onOpenChange?.(v);
  };
  const update = useUpdateUserBook();

  const setStatus = (status: BookStatus) => {
    if (ub.status === status) {
      toast.info(`Já está marcado como "${status}"`);
      return;
    }
    haptic("toggle");
    update.mutate(
      { id: ub.id, patch: { status } },
      {
        onSuccess: () => {
          const labels: Record<BookStatus, string> = {
            reading: "Marcado como lendo",
            read: "Marcado como lido",
            wishlist: "Movido para a fila",
            not_read: "Voltou ao acervo",
          };
          toast.success(labels[status]);
        },
      },
    );
  };

  return (
    <DropdownMenu open={value} onOpenChange={setValue}>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="secondary"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className={cn(
            "h-8 w-8 rounded-full bg-background/90 backdrop-blur-md border border-border shadow-elevated",
            "transition-opacity duration-200",
            className,
          )}
          aria-label="Ações rápidas"
        >
          {update.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <MoreHorizontal className="w-4 h-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onClick={(e) => e.stopPropagation()}
        className="w-56"
      >
        <DropdownMenuLabel className="line-clamp-1">{ub.book?.title}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {STATUS_ACTIONS.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setStatus(value)}
            disabled={ub.status === value}
            className="gap-2"
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            if (ub.book) openAmazon(ub.book);
          }}
          className="gap-2"
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Ver na Amazon</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Wrapper que detecta long-press (≥500ms) no mobile e dispara o callback.
 * No desktop não interfere — clique segue para o Link normalmente.
 */
export function useLongPress(onLongPress: () => void, ms = 500) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let triggered = false;

  const start = () => {
    triggered = false;
    timer = setTimeout(() => {
      triggered = true;
      haptic("toggle");
      onLongPress();
    }, ms);
  };
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  return {
    onTouchStart: start,
    onTouchEnd: clear,
    onTouchMove: clear,
    onTouchCancel: clear,
    /** Permite ao consumidor abortar o clique se foi long-press. */
    wasLongPress: () => triggered,
  };
}
