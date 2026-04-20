import { useRef, useState } from "react";
import html2canvas from "html2canvas";
import { Book } from "@/types/book";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Instagram, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  book: Book;
  rating?: number | null;
  progress?: number | null;
}

export function InstagramShareCard({ book, rating, progress }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const generate = async (): Promise<Blob | null> => {
    if (!cardRef.current) return null;
    const canvas = await html2canvas(cardRef.current, {
      backgroundColor: "#000000",
      scale: 2,
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
      a.download = `pagina-${book.title.replace(/\s+/g, "-").toLowerCase()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Imagem salva");
    } catch { toast.error("Erro ao gerar imagem"); }
    finally { setBusy(false); }
  };

  const shareNative = async () => {
    setBusy(true);
    try {
      const blob = await generate();
      if (!blob) throw new Error("Falha");
      const file = new File([blob], "pagina.png", { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: book.title });
      } else {
        await download();
      }
    } catch { /* user cancel */ }
    finally { setBusy(false); }
  };

  const stars = "★".repeat(rating || 0) + "☆".repeat(5 - (rating || 0));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="lg"
          className="gap-2 rounded-none hover:bg-primary/10 hover:text-primary border-0"
          aria-label="Compartilhar no Instagram"
        >
          <Instagram className="w-4 h-4" />
          <span className="hidden sm:inline">Instagram</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Compartilhar no Instagram</DialogTitle></DialogHeader>
        <div className="overflow-hidden rounded-xl">
          <div
            ref={cardRef}
            className="relative w-[360px] h-[640px] mx-auto flex flex-col items-center justify-between p-8"
            style={{
              background: book.cover_url
                ? `linear-gradient(180deg, hsla(0,0%,0%,0.55), hsla(0,0%,0%,0.95)), url(${book.cover_url}) center/cover`
                : "linear-gradient(135deg, hsl(4 100% 59%), hsl(0 0% 0%))",
            }}
          >
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.3em] font-semibold" style={{ color: "hsl(4 100% 70%)" }}>Readify</p>
              <p className="text-xs mt-1" style={{ color: "hsla(0,0%,100%,0.6)" }}>minha leitura</p>
            </div>
            {book.cover_url && (
              <img
                src={book.cover_url}
                alt=""
                crossOrigin="anonymous"
                className="w-44 rounded shadow-2xl"
                style={{ boxShadow: "0 30px 60px -10px rgba(0,0,0,0.7)" }}
              />
            )}
            <div className="text-center w-full">
              <h2 className="font-serif text-2xl font-bold leading-tight" style={{ color: "hsl(0 0% 100%)" }}>{book.title}</h2>
              {book.authors[0] && <p className="text-sm mt-1 italic" style={{ color: "hsla(0,0%,100%,0.7)" }}>{book.authors[0]}</p>}
              {rating ? <p className="text-lg mt-3 tracking-widest" style={{ color: "hsl(4 100% 65%)" }}>{stars}</p> : null}
              {progress != null && progress > 0 && (
                <div className="mt-4">
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "hsla(0,0%,100%,0.15)" }}>
                    <div className="h-full" style={{ width: `${progress}%`, background: "hsl(4 100% 59%)" }} />
                  </div>
                  <p className="text-xs mt-1.5" style={{ color: "hsla(0,0%,100%,0.7)" }}>{progress}% lido</p>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="hero" className="flex-1 gap-2" onClick={shareNative} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Instagram className="w-4 h-4" />} Compartilhar
          </Button>
          <Button variant="outline" className="gap-2" onClick={download} disabled={busy}>
            <Download className="w-4 h-4" /> Baixar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Salve a imagem e poste como Story no Instagram.
        </p>
      </DialogContent>
    </Dialog>
  );
}
