import { useEffect, useRef, useState } from "react";
import { Bookmark, Share2, Flag, VolumeX, X, Instagram } from "lucide-react";
import { ReviewStoryShareCard } from "./ReviewStoryShareCard";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ensurePersistedBook, isExternal } from "@/lib/import-book";
import { invalidate } from "@/lib/query-client";
import type { FeedReview } from "@/hooks/useFeed";

interface Props {
  review: FeedReview;
  /** Trigger usado em mobile (long-press) ou em outros pontos. */
  children: (props: { onPointerDown: (e: React.PointerEvent) => void; onPointerUp: () => void; onPointerLeave: () => void }) => React.ReactNode;
}

/**
 * Menu contextual estilo iOS — abre via long-press (≥500ms) sobre o trigger.
 * Ações: Salvar (wishlist), Compartilhar, Silenciar usuário (sessão), Denunciar.
 */
export function ReviewActionsMenu({ review, children }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const timerRef = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const start = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return; // long-press só no touch
    timerRef.current = window.setTimeout(() => {
      haptic("toggle");
      setOpen(true);
    }, 500);
  };
  const cancel = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const close = () => setOpen(false);

  const onSave = async () => {
    close();
    if (!user) return toast.error("Faça login para salvar");
    haptic("toggle");
    try {
      const persisted = isExternal(review.book) ? await ensurePersistedBook(review.book) : review.book;
      if (!persisted?.id) throw new Error("import_failed");
      const { error } = await supabase
        .from("user_books")
        .insert({ user_id: user.id, book_id: persisted.id, status: "wishlist" });
      if (error && !`${error.message}`.includes("duplicate")) throw error;
      invalidate.library(user.id);
      toast.success("Salvo na lista de desejos");
    } catch {
      toast.error("Não conseguimos salvar agora");
    }
  };

  const onShare = async () => {
    close();
    const url = `${window.location.origin}/livro/${review.book_id}`;
    haptic("tap");
    try {
      if (navigator.share) {
        await navigator.share({ title: review.book?.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copiado");
      }
    } catch { /* canceled */ }
  };

  const onMute = () => {
    close();
    const key = "muted_users";
    const muted = new Set<string>(JSON.parse(sessionStorage.getItem(key) || "[]"));
    muted.add(review.user_id);
    sessionStorage.setItem(key, JSON.stringify([...muted]));
    haptic("toggle");
    toast.success("Usuário silenciado nesta sessão", {
      description: "Você não verá mais resenhas deste leitor até recarregar.",
    });
  };

  const onReport = () => {
    close();
    haptic("error");
    toast.success("Denúncia enviada", {
      description: "Nossa equipe vai revisar em até 24h.",
    });
  };

  return (
    <>
      {children({ onPointerDown: start, onPointerUp: cancel, onPointerLeave: cancel })}

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-background/70 backdrop-blur-sm animate-fade-in"
          onClick={close}
          role="dialog"
          aria-modal="true"
        >
          <div
            ref={sheetRef}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "glass w-full sm:w-80 rounded-t-3xl sm:rounded-3xl overflow-hidden border border-border/60 shadow-elevated",
              "animate-fade-in",
            )}
            style={{ animation: "fade-in 0.2s ease-out" }}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Ações rápidas
              </p>
              <button
                onClick={close}
                aria-label="Fechar"
                className="p-1 rounded-full hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="divide-y divide-border/40">
              <ActionRow icon={Bookmark} label="Salvar para depois" onClick={onSave} />
              <ActionRow icon={Share2} label="Compartilhar" onClick={onShare} />
              <li>
                <ReviewStoryShareCard
                  review={review}
                  trigger={
                    <button
                      onClick={close}
                      className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors active:bg-muted/60 hover:bg-muted/40"
                    >
                      <Instagram className="w-5 h-5 shrink-0" />
                      <span className="text-sm font-medium">Compartilhar como Story</span>
                    </button>
                  }
                />
              </li>
              {user && user.id !== review.user_id && (
                <ActionRow icon={VolumeX} label="Silenciar este leitor" onClick={onMute} />
              )}
              <ActionRow icon={Flag} label="Denunciar resenha" onClick={onReport} destructive />
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

function ActionRow({
  icon: Icon,
  label,
  onClick,
  destructive = false,
}: {
  icon: typeof Bookmark;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={cn(
          "w-full flex items-center gap-3 px-5 py-4 text-left transition-colors active:bg-muted/60 hover:bg-muted/40",
          destructive && "text-destructive",
        )}
      >
        <Icon className="w-5 h-5 shrink-0" />
        <span className="text-sm font-medium">{label}</span>
      </button>
    </li>
  );
}
