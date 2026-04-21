import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Download, Loader2, Quote, Share2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Premium animated quote card for social sharing.
 * Generates a 1080x1350 PNG (Instagram-friendly portrait) using html2canvas
 * loaded dynamically (saves ~200kB on initial bundle).
 *
 * Three "moods" change the gradient palette to keep shares feeling personal.
 */
export type QuoteMood = "gold" | "sunset" | "ocean";

interface Props {
  quote: string;
  bookTitle?: string;
  bookAuthor?: string;
  bookCover?: string | null;
  username?: string | null;
  mood?: QuoteMood;
  trigger?: React.ReactNode;
}

const MOODS: Record<QuoteMood, { from: string; via: string; to: string; accent: string }> = {
  gold:    { from: "#1a1208", via: "#3a2410", to: "#0a0604", accent: "#e8b94a" },
  sunset:  { from: "#1a0810", via: "#3a142b", to: "#080410", accent: "#ff6b9d" },
  ocean:   { from: "#06121f", via: "#0a3050", to: "#020812", accent: "#5eb8ff" },
};

export function QuoteShareCard({
  quote, bookTitle, bookAuthor, bookCover, username, mood: initialMood = "gold", trigger,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mood, setMood] = useState<QuoteMood>(initialMood);
  const cardRef = useRef<HTMLDivElement>(null);

  const generate = async (): Promise<Blob | null> => {
    if (!cardRef.current) return null;
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(cardRef.current, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
    });
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 1));
  };

  const handleShare = async () => {
    setBusy(true);
    try {
      const blob = await generate();
      if (!blob) throw new Error("Falha ao gerar imagem");
      const file = new File([blob], "citacao-readify.png", { type: "image/png" });

      // Web Share API (native on mobile)
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Citação", text: quote });
        toast.success("Compartilhado!");
      } else {
        // Desktop fallback: download
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "citacao-readify.png";
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Imagem baixada");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        toast.error("Não foi possível compartilhar");
      }
    } finally {
      setBusy(false);
    }
  };

  const palette = MOODS[mood];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="gap-2">
            <Share2 className="h-4 w-4" /> Compartilhar
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Card de citação</DialogTitle>
        </DialogHeader>

        {/* Mood selector */}
        <div className="flex gap-2 justify-center">
          {(Object.keys(MOODS) as QuoteMood[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMood(m)}
              aria-label={`Cor ${m}`}
              className={cn(
                "h-8 w-8 rounded-full border-2 transition-all",
                mood === m ? "border-foreground scale-110" : "border-transparent opacity-60",
              )}
              style={{ background: `linear-gradient(135deg, ${MOODS[m].from}, ${MOODS[m].accent})` }}
            />
          ))}
        </div>

        {/* The card itself — fixed 1080x1350 scaled down for preview */}
        <div className="relative mx-auto overflow-hidden rounded-xl shadow-2xl" style={{ width: 270, height: 337.5 }}>
          <div
            ref={cardRef}
            style={{
              width: 1080,
              height: 1350,
              transform: "scale(0.25)",
              transformOrigin: "top left",
              background: `linear-gradient(160deg, ${palette.from}, ${palette.via}, ${palette.to})`,
              position: "relative",
              fontFamily: "'Playfair Display', 'Georgia', serif",
              color: "#fff",
              padding: 80,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxSizing: "border-box",
            }}
          >
            {/* Decorative quote mark */}
            <div style={{ position: "absolute", top: 60, left: 60, opacity: 0.1, fontSize: 380, lineHeight: 1, color: palette.accent }}>
              "
            </div>

            {/* Quote */}
            <div style={{ marginTop: 180, position: "relative", zIndex: 2 }}>
              <p style={{
                fontSize: quote.length > 200 ? 52 : quote.length > 100 ? 64 : 76,
                lineHeight: 1.3,
                fontWeight: 500,
                fontStyle: "italic",
                margin: 0,
                textShadow: "0 4px 20px rgba(0,0,0,0.5)",
              }}>
                {quote}
              </p>
            </div>

            {/* Footer: book + branding */}
            <div style={{ display: "flex", alignItems: "center", gap: 24, position: "relative", zIndex: 2 }}>
              {bookCover && (
                <img
                  src={bookCover}
                  alt=""
                  crossOrigin="anonymous"
                  style={{ width: 140, height: 210, borderRadius: 8, boxShadow: "0 12px 40px rgba(0,0,0,0.6)", objectFit: "cover" }}
                />
              )}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                {bookTitle && (
                  <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.2 }}>{bookTitle}</div>
                )}
                {bookAuthor && (
                  <div style={{ fontSize: 28, opacity: 0.7, fontStyle: "italic" }}>{bookAuthor}</div>
                )}
                <div style={{ marginTop: 12, fontSize: 22, color: palette.accent, fontFamily: "'Inter', sans-serif", letterSpacing: 2, textTransform: "uppercase", fontWeight: 600 }}>
                  {username ? `@${username}` : "Readify"}
                </div>
              </div>
            </div>

            {/* Subtle accent border */}
            <div style={{
              position: "absolute", inset: 40, border: `2px solid ${palette.accent}`, borderRadius: 24, opacity: 0.3, pointerEvents: "none",
            }} />
          </div>
        </div>

        <Button onClick={handleShare} disabled={busy} className="w-full" size="lg">
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
          {busy ? "Gerando..." : "Compartilhar / Baixar"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export { Quote as QuoteIcon };
