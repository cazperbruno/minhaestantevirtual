import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Loader2, ScanBarcode, Upload, Sparkles, X, Search, BookX } from "lucide-react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { lookupIsbn, recognizeCover, searchBooksGet } from "@/lib/books-api";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { BookCard } from "@/components/books/BookCard";
import type { Book } from "@/types/book";

type Mode = "barcode" | "cover";

export default function ScannerPage() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [mode, setMode] = useState<Mode>("barcode");
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manualIsbn, setManualIsbn] = useState("");
  const [results, setResults] = useState<Book[]>([]);
  const [recognized, setRecognized] = useState<{ title?: string; author?: string } | null>(null);
  const [notFoundIsbn, setNotFoundIsbn] = useState<string | null>(null);

  useEffect(() => () => { controlsRef.current?.stop(); }, []);

  const startBarcode = async () => {
    try {
      setActive(true);
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]);
      const reader = new BrowserMultiFormatReader(hints);
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      const back = devices.find((d) => /back|rear|environment/i.test(d.label)) || devices[0];
      controlsRef.current = await reader.decodeFromVideoDevice(
        back?.deviceId,
        videoRef.current!,
        async (result) => {
          if (!result) return;
          const code = result.getText().replace(/[^0-9Xx]/g, "");
          if (code.length !== 10 && code.length !== 13) return;
          controlsRef.current?.stop();
          setActive(false);
          await resolveIsbn(code);
        },
      );
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível acessar a câmera");
      setActive(false);
    }
  };

  const stop = () => { controlsRef.current?.stop(); setActive(false); };

  const resolveIsbn = async (isbn: string) => {
    setBusy(true);
    setNotFoundIsbn(null);
    try {
      const book = await lookupIsbn(isbn);
      if (book?.id) {
        toast.success("Livro encontrado");
        navigate(`/livro/${book.id}`);
      } else {
        setNotFoundIsbn(isbn);
        toast.error("ISBN não encontrado. Tente buscar por título.");
      }
    } catch (e: any) {
      toast.error(e.message || "Erro");
    } finally { setBusy(false); }
  };

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualIsbn.replace(/[^0-9Xx]/g, "");
    if (code.length !== 10 && code.length !== 13) {
      toast.error("ISBN deve ter 10 ou 13 dígitos");
      return;
    }
    resolveIsbn(code);
  };

  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });

  const handleCoverFile = async (file: File) => {
    setBusy(true);
    setRecognized(null);
    setResults([]);
    try {
      const b64 = await fileToBase64(file);
      const rec = await recognizeCover(b64);
      if (!rec.query) {
        toast.error("Capa não reconhecida. Tente outra foto.");
        return;
      }
      setRecognized({ title: rec.title, author: rec.author });
      const books = await searchBooksGet(rec.query);
      setResults(books.slice(0, 12));
      if (books.length === 0) toast.warning("Nenhum livro encontrado para esta capa");
    } catch (e: any) {
      toast.error(e.message || "Erro ao reconhecer capa");
    } finally { setBusy(false); }
  };

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 pb-16 max-w-4xl mx-auto">
        <header className="mb-8 animate-fade-in">
          <p className="text-sm text-primary font-medium mb-2 flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Scanner inteligente
          </p>
          <h1 className="font-display text-3xl md:text-5xl font-bold leading-tight mb-2">
            Aponte. <span className="text-gradient-gold italic">Encontre.</span>
          </h1>
          <p className="text-muted-foreground">Leia o código de barras ISBN ou identifique pela capa com IA.</p>
        </header>

        <div className="flex gap-2 mb-6">
          <Button variant={mode === "barcode" ? "hero" : "outline"} onClick={() => { stop(); setMode("barcode"); }} className="gap-2">
            <ScanBarcode className="w-4 h-4" /> Código de barras
          </Button>
          <Button variant={mode === "cover" ? "hero" : "outline"} onClick={() => { stop(); setMode("cover"); }} className="gap-2">
            <Camera className="w-4 h-4" /> Capa (IA)
          </Button>
        </div>

        {mode === "barcode" && (
          <section className="space-y-6">
            <div className="glass rounded-2xl overflow-hidden border border-border">
              <div className="relative aspect-[4/3] bg-black">
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                {!active && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Button variant="hero" size="lg" onClick={startBarcode} disabled={busy} className="gap-2">
                      <Camera className="w-4 h-4" /> Ativar câmera
                    </Button>
                  </div>
                )}
                {active && (
                  <>
                    <div className="absolute inset-x-8 top-1/2 h-0.5 bg-primary/80 shadow-glow -translate-y-1/2 animate-pulse" />
                    <Button variant="outline" size="sm" onClick={stop} className="absolute top-3 right-3 gap-1">
                      <X className="w-3 h-3" /> Parar
                    </Button>
                  </>
                )}
                {busy && (
                  <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={submitManual} className="glass rounded-2xl p-5 space-y-3">
              <label className="text-sm text-muted-foreground">Ou digite o ISBN manualmente</label>
              <div className="flex gap-2">
                <Input
                  value={manualIsbn}
                  onChange={(e) => setManualIsbn(e.target.value)}
                  placeholder="9788535914849"
                  inputMode="numeric"
                  className="flex-1"
                />
                <Button type="submit" disabled={busy} variant="hero">Buscar</Button>
              </div>
            </form>
          </section>
        )}

        {mode === "cover" && (
          <section className="space-y-6">
            <div className="glass rounded-2xl p-8 text-center border border-dashed border-border">
              <Camera className="w-10 h-10 mx-auto text-primary mb-3" />
              <h3 className="font-display text-xl font-semibold mb-1">Identificar livro pela capa</h3>
              <p className="text-sm text-muted-foreground mb-5">Tire ou envie uma foto nítida da capa do livro.</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleCoverFile(e.target.files[0])}
              />
              <div className="flex flex-wrap gap-2 justify-center">
                <Button variant="hero" onClick={() => fileRef.current?.click()} disabled={busy} className="gap-2">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                  Tirar / enviar foto
                </Button>
                <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy} className="gap-2">
                  <Upload className="w-4 h-4" /> Da galeria
                </Button>
              </div>
            </div>

            {recognized && (
              <div className="glass rounded-xl p-4 animate-fade-in">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">IA identificou</p>
                <p className="font-display text-lg font-semibold">{recognized.title || "Título desconhecido"}</p>
                {recognized.author && <p className="text-sm text-muted-foreground">{recognized.author}</p>}
              </div>
            )}

            {results.length > 0 && (
              <div>
                <h3 className="font-display text-xl font-semibold mb-3">Resultados</h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-5">
                  {results.map((b, i) => (
                    <BookCard key={b.id ?? `cover-${i}`} book={b} size="sm" />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </AppShell>
  );
}
