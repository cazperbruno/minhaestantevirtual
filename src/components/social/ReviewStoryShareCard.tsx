import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Instagram, Download, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import type { FeedReview } from "@/hooks/useFeed";

interface Props {
  review: FeedReview;
  trigger?: React.ReactNode;
}

/**
 * Gera uma imagem 9:16 (1080x1920 @2x via html2canvas) da resenha estilo Story do
 * Instagram, pronta para baixar ou compartilhar pelo share-sheet nativo.
 *
 * Carrega html2canvas dinamicamente para não pesar no bundle inicial.
 */
export function ReviewStoryShareCard({ review, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const generate = async (): Promise<Blob | null> => {
    if (!cardRef.current) return null;
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(cardRef.current, {
      backgroundColor: "#000000",
      scale: 3, // 360x640 → 1080x1920 nativo de story
      useCORS: true,
      allowTaint: true,
    });
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 1));
  };

  const download = async () => {
    setBusy(true);
    try {
      const blob = await generate();
      if (!blob) throw new Error("Falha");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `readify-resenha-${(review.book?.title || "livro").replace(/\s+/g, "-").toLowerCase()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Story salvo na galeria");
    } catch { toast.error("Erro ao gerar imagem"); }
    finally { setBusy(false); }
  };

  const shareNative = async () => {
    setBusy(true);
    try {
      const blob = await generate();
      if (!blob) throw new Error("Falha");
      const file = new File([blob], "story.png", { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: review.book?.title });
      } else {
        await download();
      }
    } catch { /* user cancel */ }
    finally { setBusy(false); }
  };

  const stars = "★".repeat(review.rating || 0) + "☆".repeat(5 - (review.rating || 0));
  const author = review.book?.authors?.[0];
  const reader = review.profile?.display_name || "Leitor";
  // Trecho da resenha — limita para não overflow
  const excerpt = (review.content || "").slice(0, 220) + ((review.content || "").length > 220 ? "…" : "");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-primary">
            <Instagram className="w-4 h-4" /> Story
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Compartilhar como Story</DialogTitle>
        </DialogHeader>
        <div className="overflow-hidden rounded-xl">
          <div
            ref={cardRef}
            className="relative w-[360px] h-[640px] mx-auto flex flex-col p-7"
            style={{
              background: review.book?.cover_url
                ? `linear-gradient(180deg, hsla(0,0%,0%,0.45) 0%, hsla(0,0%,0%,0.85) 60%, hsla(0,0%,0%,0.98) 100%), url(${review.book.cover_url}) center/cover`
                : "linear-gradient(135deg, hsl(4 100% 59%), hsl(0 0% 5%))",
            }}
          >
            {/* Top badge */}
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.3em] font-bold" style={{ color: "hsl(4 100% 70%)" }}>
                Readify
              </p>
              <p className="text-[10px]" style={{ color: "hsla(0,0%,100%,0.5)" }}>
                /resenha
              </p>
            </div>

            {/* Spacer top */}
            <div className="flex-1" />

            {/* Rating */}
            {review.rating ? (
              <p className="text-2xl tracking-widest text-center mb-3" style={{ color: "hsl(4 100% 65%)" }}>
                {stars}
              </p>
            ) : null}

            {/* Resenha */}
            <blockquote
              className="font-display text-lg italic leading-snug text-center px-2"
              style={{ color: "hsl(0 0% 100%)" }}
            >
              "{excerpt}"
            </blockquote>

            {/* Spacer mid */}
            <div className="flex-1" />

            {/* Book info bottom */}
            <div className="flex items-end gap-3 mt-3">
              {review.book?.cover_url && (
                <img
                  src={review.book.cover_url}
                  alt=""
                  crossOrigin="anonymous"
                  loading="lazy"
                  className="w-16 rounded shadow-2xl shrink-0"
                  style={{ boxShadow: "0 20px 40px -10px rgba(0,0,0,0.7)" }}
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-serif text-base font-bold leading-tight line-clamp-2" style={{ color: "hsl(0 0% 100%)" }}>
                  {review.book?.title}
                </p>
                {author && (
                  <p className="text-xs italic mt-0.5" style={{ color: "hsla(0,0%,100%,0.7)" }}>
                    {author}
                  </p>
                )}
                <p className="text-[10px] uppercase tracking-wider mt-2" style={{ color: "hsla(0,0%,100%,0.55)" }}>
                  resenhado por {reader}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="hero" className="flex-1 gap-2" onClick={shareNative} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
            Compartilhar
          </Button>
          <Button variant="outline" className="gap-2" onClick={download} disabled={busy}>
            <Download className="w-4 h-4" /> Baixar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Imagem 9:16 pronta para postar no Instagram, TikTok ou WhatsApp Status.
        </p>
      </DialogContent>
    </Dialog>
  );
}
