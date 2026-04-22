import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Gift, Sparkles, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useOpenSurpriseBox, useSurpriseStatus, type SurpriseRarity } from "@/hooks/useSurpriseBox";
import { useEpicSaturday } from "@/hooks/useEpicSaturday";
import { supabase } from "@/integrations/supabase/client";
import { BookCover } from "@/components/books/BookCover";
import { goldenBurst } from "@/lib/confetti";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/track";
import type { Book } from "@/types/book";

const rarityStyles: Record<SurpriseRarity, { label: string; gradient: string; glow: string }> = {
  common:    { label: "Comum",    gradient: "from-slate-400/30 to-slate-500/10",     glow: "shadow-[0_0_30px_-10px_rgba(148,163,184,0.5)]" },
  rare:      { label: "Raro",     gradient: "from-sky-400/40 to-blue-500/10",        glow: "shadow-[0_0_30px_-8px_rgba(56,189,248,0.6)]" },
  epic:      { label: "Épico",    gradient: "from-purple-500/50 to-fuchsia-500/10",  glow: "shadow-[0_0_40px_-8px_rgba(168,85,247,0.7)]" },
  legendary: { label: "Lendário", gradient: "from-amber-400/60 to-orange-500/20",    glow: "shadow-[0_0_50px_-6px_rgba(251,191,36,0.85)]" },
};

/**
 * Caixa Surpresa Diária — recompensa variável (slot machine).
 * 1 abertura por dia. Mostra livro + XP bônus com raridade aleatória.
 */
export function DailySurpriseBox() {
  const { user } = useAuth();
  const { data: status, isLoading } = useSurpriseStatus(user?.id);
  const { data: isEpicSaturday } = useEpicSaturday();
  const open = useOpenSurpriseBox(user?.id);
  const [revealedBook, setRevealedBook] = useState<Book | null>(null);
  const [shaking, setShaking] = useState(false);
  const [opened, setOpened] = useState(false);

  // Quando já abriu hoje, marca como aberto mesmo se livro não for encontrado
  useEffect(() => {
    if (status?.available === false) {
      setOpened(true);
    }
    if (!status?.last_book_id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("books").select("*").eq("id", status.last_book_id!).maybeSingle();
      if (!cancelled && data) setRevealedBook(data as Book);
    })();
    return () => { cancelled = true; };
  }, [status?.last_book_id, status?.available]);

  if (!user || isLoading) return null;

  const handleOpen = async () => {
    if (open.isPending) return;
    haptic("tap");
    setShaking(true);
    try {
      const claim = await open.mutateAsync();
      setShaking(false);
      if (claim.book_id) {
        const { data } = await supabase
          .from("books").select("*").eq("id", claim.book_id).maybeSingle();
        if (data) setRevealedBook(data as Book);
      }
      setOpened(true);
      // Telemetria de profundidade — Fase 3
      trackEvent("surprise_box_opened", {
        rarity: claim.rarity,
        bonus_xp: claim.bonus_xp,
        epic_saturday: !!isEpicSaturday,
      });
      if (claim.rarity === "epic" || claim.rarity === "legendary") {
        haptic("success");
        goldenBurst();
      }
    } catch (err) {
      setShaking(false);
      console.error("open surprise box", err);
    }
  };

  // Estado: já abriu hoje (com ou sem livro disponível)
  if (opened) {
    const rarity = (status?.last_rarity ?? "common") as SurpriseRarity;
    const style = rarityStyles[rarity];
    return (
      <div
        className={cn(
          "relative mb-4 rounded-2xl border border-primary/20 bg-gradient-to-br p-4 overflow-hidden",
          style.gradient,
          style.glow,
        )}
      >
        <div className="flex items-center gap-4">
          {revealedBook ? (
            <Link to={`/livro/${revealedBook.id}`} className="shrink-0">
              <BookCover book={revealedBook} size="sm" className="hover:scale-105 transition-transform" />
            </Link>
          ) : (
            <div className="shrink-0 w-16 h-24 rounded-lg bg-primary/15 grid place-items-center">
              <Gift className="w-7 h-7 text-primary" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Gift className="w-3.5 h-3.5 text-primary" />
              <span className="text-[11px] uppercase tracking-wider font-semibold text-primary">
                Caixa do dia · {style.label}
              </span>
            </div>
            <p className="font-display font-bold text-base leading-tight line-clamp-2">
              {revealedBook?.title ?? "Recompensa do dia coletada"}
            </p>
            {revealedBook?.authors?.[0] && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {revealedBook.authors.join(", ")}
              </p>
            )}
            <p className="text-xs mt-1.5 font-semibold text-primary">
              +{status?.last_bonus_xp ?? 0} XP recebido
            </p>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3 text-center">
          Volte amanhã pra uma nova caixa 🎁
        </p>
      </div>
    );
  }

  // Estado: pode abrir
  return (
    <div
      className={cn(
        "relative mb-4 rounded-2xl border p-4 overflow-hidden",
        isEpicSaturday
          ? "border-amber-400/60 bg-gradient-to-br from-amber-500/25 via-fuchsia-500/10 to-transparent shadow-[0_0_40px_-12px_rgba(251,191,36,0.6)]"
          : "border-primary/30 bg-gradient-to-br from-primary/15 via-amber-500/5 to-transparent",
      )}
    >
      {isEpicSaturday && (
        <div className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-amber-500/90 text-amber-950 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">
          <Star className="w-3 h-3 fill-current" /> Sábado épico
        </div>
      )}
      <div className="flex items-center gap-4">
        <button
          onClick={handleOpen}
          disabled={open.isPending}
          className={cn(
            "relative shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 grid place-items-center transition-transform",
            shaking && "animate-[shake_0.5s_ease-in-out]",
            !open.isPending && "hover:scale-110 active:scale-95",
          )}
          aria-label="Abrir caixa surpresa do dia"
        >
          {open.isPending ? (
            <Loader2 className="w-7 h-7 text-white animate-spin" />
          ) : (
            <>
              <Gift className="w-8 h-8 text-white drop-shadow" />
              <Sparkles className="w-3.5 h-3.5 text-white absolute -top-0.5 -right-0.5 animate-pulse" />
            </>
          )}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-primary mb-0.5">
            Caixa Surpresa
          </p>
          <p className="font-display font-bold text-base leading-tight">
            {isEpicSaturday ? "Hoje as chances de lendário sobem 🌟" : "Sua recompensa diária está esperando"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            1 livro + XP bônus. {isEpicSaturday
              ? <>Hoje pode chegar a <span className="text-amber-500 font-semibold">+150 XP</span>!</>
              : <>Pode ser <span className="text-amber-500 font-semibold">lendário</span>!</>}
          </p>
        </div>
        <Button
          size="sm"
          variant="hero"
          onClick={handleOpen}
          disabled={open.isPending}
          className="shrink-0 hidden sm:inline-flex"
        >
          Abrir
        </Button>
      </div>
      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0) rotate(0); }
          15% { transform: translateX(-4px) rotate(-5deg); }
          30% { transform: translateX(4px) rotate(5deg); }
          45% { transform: translateX(-4px) rotate(-3deg); }
          60% { transform: translateX(4px) rotate(3deg); }
          75% { transform: translateX(-2px) rotate(-1deg); }
        }
      `}</style>
    </div>
  );
}
