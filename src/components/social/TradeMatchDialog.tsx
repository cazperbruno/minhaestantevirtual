import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BookCover } from "@/components/books/BookCover";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles, ArrowRightLeft, Heart, Loader2, X } from "lucide-react";
import { ProposeTradeDialog } from "./ProposeTradeDialog";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

interface Match {
  id: string;
  book_id: string;
  offerer_id: string;
  wisher_id: string;
  status: string;
  detected_at: string;
  book?: any;
  offerer?: any;
  wisher?: any;
}

interface Props {
  matchId: string | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Dialog cinemático de "Match!" — celebração tipo Tinder pra leitores.
 * Mostra os dois lados do match com confetti e CTA pra propor troca.
 */
export function TradeMatchDialog({ matchId, open, onClose }: Props) {
  const { user } = useAuth();
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !matchId) {
      setMatch(null);
      return;
    }
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("trade_matches")
        .select("*")
        .eq("id", matchId)
        .maybeSingle();
      if (!data) { setLoading(false); return; }
      const [{ data: book }, { data: profs }] = await Promise.all([
        supabase.from("books").select("id,title,authors,cover_url").eq("id", data.book_id).maybeSingle(),
        supabase.from("profiles").select("id,display_name,username,avatar_url").in("id", [data.offerer_id, data.wisher_id]),
      ]);
      const m = new Map((profs || []).map((p: any) => [p.id, p]));
      setMatch({
        ...(data as any),
        book,
        offerer: m.get(data.offerer_id),
        wisher: m.get(data.wisher_id),
      });
      setLoading(false);
      haptic("success");
    })();
  }, [matchId, open]);

  const dismiss = async () => {
    if (!matchId) return;
    await supabase.from("trade_matches").update({ status: "dismissed", resolved_at: new Date().toISOString() }).eq("id", matchId);
    onClose();
  };

  if (!open) return null;

  const iAmWisher = user?.id === match?.wisher_id;
  const other = iAmWisher ? match?.offerer : match?.wisher;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md p-0 overflow-hidden border-primary/40">
        {/* Glow background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-background to-accent/20 pointer-events-none" />
        <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-primary/30 blur-3xl pointer-events-none animate-pulse" />
        <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full bg-accent/30 blur-3xl pointer-events-none" />

        <div className="relative z-10 p-6 sm:p-8 space-y-5">
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {loading ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : !match ? (
            <DialogDescription className="py-10 text-center">Match não encontrado.</DialogDescription>
          ) : (
            <>
              <div className="text-center animate-fade-in">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 border border-primary/30 mb-3">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs uppercase tracking-widest font-semibold text-primary">Match de troca</span>
                </div>
                <DialogTitle className="font-display text-3xl font-bold leading-tight">
                  É um <span className="text-gradient-gold italic">match!</span>
                </DialogTitle>
                <DialogDescription className="mt-2 text-sm">
                  {iAmWisher
                    ? <>Você quer este livro e <strong className="text-foreground">{other?.display_name || "alguém"}</strong> está oferecendo pra troca.</>
                    : <><strong className="text-foreground">{other?.display_name || "alguém"}</strong> tem este livro nos desejos e você está oferecendo.</>}
                </DialogDescription>
              </div>

              {/* Visual: capa central + dois avatares laterais com pulse */}
              <div className="relative flex items-center justify-center gap-6 py-6 animate-scale-in">
                <Avatar className={cn("w-14 h-14 ring-2 ring-primary/40", iAmWisher && "ring-primary")}>
                  <AvatarImage src={match.wisher?.avatar_url} />
                  <AvatarFallback className="bg-pink-500/20"><Heart className="w-5 h-5 text-pink-500" /></AvatarFallback>
                </Avatar>

                <div className="relative">
                  {match.book && <BookCover book={match.book} size="md" />}
                  <div className="absolute -inset-2 rounded-xl ring-2 ring-primary/50 animate-pulse pointer-events-none" />
                </div>

                <Avatar className={cn("w-14 h-14 ring-2 ring-primary/40", !iAmWisher && "ring-primary")}>
                  <AvatarImage src={match.offerer?.avatar_url} />
                  <AvatarFallback className="bg-primary/20"><ArrowRightLeft className="w-5 h-5 text-primary" /></AvatarFallback>
                </Avatar>
              </div>

              {match.book && (
                <div className="text-center -mt-2">
                  <p className="font-display text-base font-semibold line-clamp-2">{match.book.title}</p>
                  {match.book.authors?.[0] && (
                    <p className="text-xs text-muted-foreground">{match.book.authors.slice(0, 2).join(", ")}</p>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-2 pt-2">
                {iAmWisher && match.offerer_id && (
                  <ProposeTradeDialog
                    receiverId={match.offerer_id}
                    receiverName={other?.display_name}
                    receiverBookId={match.book_id}
                    trigger={
                      <Button variant="hero" size="lg" className="w-full gap-2 shadow-glow">
                        <ArrowRightLeft className="w-4 h-4" /> Propor troca agora
                      </Button>
                    }
                  />
                )}
                {!iAmWisher && (
                  <p className="text-xs text-center text-muted-foreground italic">
                    Aguarde — quem quer o livro pode iniciar a proposta.
                  </p>
                )}
                <Button variant="ghost" size="sm" onClick={dismiss} className="text-muted-foreground">
                  Dispensar match
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
