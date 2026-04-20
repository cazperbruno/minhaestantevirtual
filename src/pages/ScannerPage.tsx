import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Loader2, ScanBarcode, Upload, Sparkles, X, Search, BookX, Zap, ZapOff, Check, ArrowRight } from "lucide-react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { lookupIsbn, recognizeCover, searchBooksGet } from "@/lib/books-api";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { BookCard } from "@/components/books/BookCard";
import type { Book } from "@/types/book";

type Mode = "barcode" | "cover";

// Haptic feedback helper (works on iOS PWA + Android via Vibration API)
function vibrate(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern); } catch { /* noop */ }
}

export default function ScannerPage() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const lastScanRef = useRef<{ code: string; ts: number }>({ code: "", ts: 0 });
  const lockRef = useRef(false);
  const [mode, setMode] = useState<Mode>("barcode");
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [manualIsbn, setManualIsbn] = useState("");
  const [results, setResults] = useState<Book[]>([]);
  const [recognized, setRecognized] = useState<{ title?: string; author?: string } | null>(null);
  const [notFoundIsbn, setNotFoundIsbn] = useState<string | null>(null);
  const [detected, setDetected] = useState<string | null>(null);
  const [foundBook, setFoundBook] = useState<{ id: string; title: string; authors?: string[]; cover_url?: string | null } | null>(null);

  // Auto-iniciar câmera no modo barcode (Steve Jobs: zero fricção)
  useEffect(() => {
    if (mode === "barcode" && !active && !busy) {
      const t = setTimeout(() => { startBarcode().catch(() => { /* user can tap button */ }); }, 250);
      return () => clearTimeout(t);
    }
  }, [mode]); // eslint-disable-line

  useEffect(() => () => stop(), []);

  const stop = () => {
    try { controlsRef.current?.stop(); } catch { /* noop */ }
    controlsRef.current = null;
    trackRef.current = null;
    setActive(false);
    setTorchOn(false);
    setTorchSupported(false);
    lockRef.current = false;
  };

  const startBarcode = async () => {
    try {
      setActive(true);
      setDetected(null);
      setNotFoundIsbn(null);
      lockRef.current = false;

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 80 });

      // Prefer the rear camera with sensible resolution constraints
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          // @ts-expect-error - browser-specific hint for continuous focus
          focusMode: "continuous",
        },
      };

      controlsRef.current = await reader.decodeFromConstraints(
        constraints,
        videoRef.current!,
        async (result, _err, controls) => {
          if (!result || lockRef.current) return;
          const raw = result.getText();
          const code = raw.replace(/[^0-9Xx]/g, "");
          if (code.length !== 10 && code.length !== 13) return;

          // Debounce: ignore same code within 1.5s window (anti-jitter)
          const now = Date.now();
          if (lastScanRef.current.code === code && now - lastScanRef.current.ts < 1500) return;
          lastScanRef.current = { code, ts: now };

          // Lock to prevent multiple concurrent reads
          lockRef.current = true;
          vibrate(40);
          setDetected(code);
          controls.stop();
          setActive(false);
          await resolveIsbn(code);
        },
      );

      // Detect torch capability post-attach
      requestAnimationFrame(() => {
        const stream = (videoRef.current?.srcObject as MediaStream | null);
        const track = stream?.getVideoTracks()[0];
        if (track) {
          trackRef.current = track;
          const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
          if (caps.torch) setTorchSupported(true);
        }
      });
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível acessar a câmera");
      stop();
    }
  };

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track) return;
    try {
      // @ts-expect-error - torch is browser-specific
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn((v) => !v);
    } catch {
      toast.error("Lanterna indisponível neste dispositivo");
    }
  };

  const resolveIsbn = async (isbn: string) => {
    setBusy(true);
    setNotFoundIsbn(null);
    setFoundBook(null);
    try {
      const book = await lookupIsbn(isbn);
      if (book?.id) {
        vibrate([20, 30, 60]); // success pattern
        setFoundBook({
          id: book.id,
          title: book.title,
          authors: (book as any).authors,
          cover_url: (book as any).cover_url,
        });
        toast.success("Livro encontrado");
      } else {
        vibrate([100, 50, 100]); // error pattern
        setNotFoundIsbn(isbn);
        toast.error("ISBN não encontrado. Tente buscar por título.");
      }
    } catch (e: any) {
      toast.error(e.message || "Erro");
    } finally {
      setBusy(false);
      lockRef.current = false;
    }
  };

  const scanNext = () => {
    setFoundBook(null);
    setNotFoundIsbn(null);
    setDetected(null);
    setManualIsbn("");
    startBarcode();
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
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
                {!active && !busy && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-transparent to-black/40">
                    <Button variant="hero" size="lg" onClick={startBarcode} className="gap-2 shadow-glow">
                      <Camera className="w-4 h-4" /> Ativar câmera
                    </Button>
                  </div>
                )}

                {active && (
                  <>
                    {/* Reading frame: corners + scanning line */}
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute inset-x-[12%] inset-y-[28%] border-2 border-primary/80 rounded-2xl shadow-glow">
                        <span className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-primary rounded-tl-xl" />
                        <span className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-primary rounded-tr-xl" />
                        <span className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-primary rounded-bl-xl" />
                        <span className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-primary rounded-br-xl" />
                        <div className="absolute inset-x-3 top-1/2 h-0.5 bg-primary/90 shadow-glow -translate-y-1/2 animate-pulse" />
                      </div>
                      <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-white/90 font-medium tracking-wide bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">
                        Centralize o código de barras
                      </p>
                    </div>

                    <div className="absolute top-3 right-3 flex gap-2">
                      {torchSupported && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={toggleTorch}
                          className="gap-1 h-8 bg-background/80 backdrop-blur-sm"
                          aria-label="Alternar lanterna"
                        >
                          {torchOn ? <ZapOff className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={stop} className="gap-1 h-8 bg-background/80 backdrop-blur-sm">
                        <X className="w-3 h-3" /> Parar
                      </Button>
                    </div>
                  </>
                )}

                {busy && (
                  <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 animate-fade-in">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-sm text-foreground/90 font-medium">
                      {detected ? `Buscando ISBN ${detected}…` : "Buscando…"}
                    </p>
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

            {notFoundIsbn && (
              <div className="glass rounded-2xl p-5 border border-destructive/40 animate-fade-in">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
                    <BookX className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display font-semibold text-lg leading-tight">
                      ISBN não encontrado
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Não localizamos <span className="font-mono text-foreground">{notFoundIsbn}</span> nos catálogos.
                      Tente buscar pelo título ou autor — às vezes o livro está cadastrado com outro código.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-4">
                      <Button
                        variant="hero"
                        onClick={() => navigate(`/buscar?q=${encodeURIComponent(notFoundIsbn)}`)}
                        className="gap-2"
                      >
                        <Search className="w-4 h-4" /> Buscar por título/autor
                      </Button>
                      <Button variant="outline" onClick={() => { setNotFoundIsbn(null); startBarcode(); }}>
                        Tentar outro ISBN
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
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
