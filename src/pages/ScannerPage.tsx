import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Camera, Loader2, ScanBarcode, Sparkles, X, Search, BookX,
  Zap, ZapOff, Check, ArrowRight, BookOpen, FileText, Image as ImageIcon, Plus,
  Layers, Repeat, ScanLine,
} from "lucide-react";
import { BatchScanList, type BatchItem } from "@/components/books/BatchScanList";

import { invalidate } from "@/lib/query-client";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import {
  lookupIsbn, recognizeCover, searchBooksGet, recognizePage, saveBook,
  type PageRecognition, type PageCandidate,
} from "@/lib/books-api";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { BookCard } from "@/components/books/BookCard";
import type { Book } from "@/types/book";
import { cn } from "@/lib/utils";
import { awardXp } from "@/lib/xp";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { haptic } from "@/lib/haptics";
import { markScanStart, markScanSuccess, markScanCancelled, getScanStats } from "@/lib/scan-metrics";
import { trackEvent } from "@/lib/track";

type Mode = "barcode" | "cover" | "page";

/** Erros normalizados pra mostrar fallback claro ao usuário. */
type CameraError =
  | { kind: "permission"; message: string }
  | { kind: "no-device"; message: string }
  | { kind: "in-use"; message: string }
  | { kind: "insecure"; message: string }
  | { kind: "unknown"; message: string };

function classifyCameraError(err: unknown): CameraError {
  const e = err as { name?: string; message?: string } | undefined;
  const name = e?.name ?? "";
  const msg = e?.message ?? "Erro desconhecido";
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return { kind: "insecure", message: "A câmera só funciona em HTTPS" };
  }
  if (name === "NotAllowedError" || name === "SecurityError") {
    return { kind: "permission", message: "Permissão de câmera negada" };
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return { kind: "no-device", message: "Nenhuma câmera traseira disponível" };
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return { kind: "in-use", message: "Câmera em uso por outro app" };
  }
  return { kind: "unknown", message: msg };
}

const MODE_LABEL: Record<Mode, string> = {
  barcode: "Código",
  cover: "Capa",
  page: "Página",
};

export default function ScannerPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const lastScanRef = useRef<{ code: string; ts: number }>({ code: "", ts: 0 });
  const lockRef = useRef(false);

  const [mode, setMode] = useState<Mode>("barcode");
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string>("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [manualIsbn, setManualIsbn] = useState("");
  /**
   * Modos de escaneamento (UX Apple-style segmented):
   *  - "single":     scaneia 1 livro, pára e mostra cartão "ver livro"
   *  - "continuous": auto-adiciona ao acervo (status: not_read) e reagenda scan
   *  - "batch":      junta numa lista temporária com escolha de status por item
   */
  const [scanMode, setScanMode] = useState<"single" | "continuous" | "batch">("batch");
  /** Histórico da sessão (modo contínuo). */
  const [sessionLog, setSessionLog] = useState<Array<{ id: string; title: string; cover_url?: string | null }>>([]);
  /** Lista do lote atual (modo batch). Resetada manualmente pelo usuário. */
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const continuousTimerRef = useRef<number | null>(null);

  // Barcode state
  const [detected, setDetected] = useState<string | null>(null);
  const [foundBook, setFoundBook] = useState<{ id: string; title: string; authors?: string[]; cover_url?: string | null } | null>(null);
  const [notFoundIsbn, setNotFoundIsbn] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<CameraError | null>(null);
  const [scanStats, setScanStats] = useState(getScanStats());

  // Cover state
  const [coverResults, setCoverResults] = useState<Book[]>([]);
  const [coverGuess, setCoverGuess] = useState<{ title?: string; author?: string } | null>(null);

  // Page state
  const [pageResult, setPageResult] = useState<PageRecognition | null>(null);

  // Auto-start camera when entering barcode mode (zero friction)
  useEffect(() => {
    if (mode === "barcode" && !active && !busy && !foundBook && !notFoundIsbn) {
      const t = setTimeout(() => { startBarcode().catch(() => { /* user can tap */ }); }, 200);
      return () => clearTimeout(t);
    } else if (mode !== "barcode") {
      stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => () => {
    stop();
    if (continuousTimerRef.current) clearTimeout(continuousTimerRef.current);
  }, []);

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
      setCameraError(null);
      lockRef.current = false;
      markScanStart();

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 80 });

      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          // @ts-expect-error vendor focus hint
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

          // Debounce: rejeita o MESMO código por 2.5s, e qualquer código por 350ms
          // (evita dupla leitura quando o ZXing retorna 2 frames seguidos)
          const now = Date.now();
          const sinceLast = now - lastScanRef.current.ts;
          if (lastScanRef.current.code === code && sinceLast < 2500) return;
          if (sinceLast < 350) return;
          lastScanRef.current = { code, ts: now };

          lockRef.current = true;
          markScanSuccess(result.getBarcodeFormat?.().toString());
          setScanStats(getScanStats());
          haptic("success");
          setDetected(code);
          controls.stop();
          setActive(false);
          await resolveIsbn(code);
        },
      );

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
      console.error("[scanner] camera error", e);
      markScanCancelled();
      const err = classifyCameraError(e);
      setCameraError(err);
      stop();
    }
  };

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track) return;
    try {
      // @ts-expect-error torch is browser-specific
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn((v) => !v);
    } catch {
      toast.error("Lanterna indisponível neste dispositivo");
    }
  };

  /**
   * Reagenda um novo scan no modo contínuo OU lote — pequeno delay pro usuário
   * conseguir ver o feedback visual antes da câmera reativar.
   */
  const rescheduleScan = (delay = 1200) => {
    if (continuousTimerRef.current) clearTimeout(continuousTimerRef.current);
    continuousTimerRef.current = window.setTimeout(() => {
      setFoundBook(null);
      setDetected(null);
      if (mode === "barcode") startBarcode();
    }, delay);
  };

  /**
   * Adiciona um item ao batch (modo lote). Se o ISBN já existe na lista
   * (ainda não salvo), apenas re-vibra como feedback — não duplica.
   */
  const pushBatchItem = async (isbn: string) => {
    // Dedupe por ISBN dentro da sessão atual (ignora itens já salvos)
    const exists = batch.some((b) => b.isbn === isbn && b.status !== "saved");
    if (exists) {
      haptic("tap");
      toast.info("Já está no lote", { duration: 1200 });
      rescheduleScan(800);
      return;
    }

    const key = `${isbn}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setBatch((prev) => [
      { key, isbn, status: "loading", pickedStatus: "not_read" },
      ...prev,
    ]);

    // Reagenda câmera IMEDIATAMENTE — lookup roda em paralelo
    rescheduleScan(900);

    try {
      const book = await lookupIsbn(isbn);
      if (book?.id) {
        haptic("success");
        setBatch((prev) => prev.map((it) => it.key === key ? {
          ...it,
          status: "ready",
          bookId: book.id,
          title: book.title,
          authors: (book as any).authors,
          cover_url: (book as any).cover_url,
        } : it));
        if (user) {
          void supabase.from("user_interactions").insert({
            user_id: user.id, book_id: book.id, kind: "scan", weight: 1,
          });
        }
      } else {
        haptic("error");
        setBatch((prev) => prev.map((it) => it.key === key ? {
          ...it, status: "error", errorMessage: "ISBN não encontrado",
        } : it));
      }
    } catch (e: any) {
      setBatch((prev) => prev.map((it) => it.key === key ? {
        ...it, status: "error", errorMessage: e?.message || "Erro",
      } : it));
    }
  };

  // Cascade: ISBN → cache+search. Roteia pelo modo selecionado.
  const resolveIsbn = async (isbn: string) => {
    // ===== MODO LOTE: não bloqueia a UI, apenas empilha =====
    if (scanMode === "batch") {
      pushBatchItem(isbn);
      return;
    }

    setBusy(true);
    setBusyLabel(`Buscando ISBN ${isbn}…`);
    setNotFoundIsbn(null);
    setFoundBook(null);
    const t0 = performance.now();
    try {
      const book = await lookupIsbn(isbn);
      if (book?.id) {
        haptic("success");
        trackEvent("scanner_isbn_found", {
          isbn, book_id: book.id, mode: scanMode, latency_ms: Math.round(performance.now() - t0),
        });
        setFoundBook({
          id: book.id,
          title: book.title,
          authors: (book as any).authors,
          cover_url: (book as any).cover_url,
        });
        if (user) {
          void supabase.from("user_interactions").insert({
            user_id: user.id, book_id: book.id, kind: "scan", weight: 1,
          });
          void awardXp(user.id, "scan_book", { silent: true });

          // Modo contínuo: auto-adiciona como 'not_read' e reagenda
          if (scanMode === "continuous") {
            await supabase.from("user_books").upsert(
              { user_id: user.id, book_id: book.id, status: "not_read" },
              { onConflict: "user_id,book_id" },
            );
            invalidate.library(user.id);
            setSessionLog((log) => [
              { id: book.id, title: book.title, cover_url: (book as any).cover_url },
              ...log,
            ].slice(0, 10));
            toast.success(`✓ ${book.title}`, {
              description: "Adicionado · escaneando próximo…",
              duration: 1800,
            });
            rescheduleScan(1500);
          } else {
            toast.success("Livro encontrado");
          }
        } else {
          toast.success("Livro encontrado");
        }
      } else {
        haptic("error");
        trackEvent("scanner_isbn_not_found", { isbn, mode: scanMode });
        setNotFoundIsbn(isbn);
      }
    } catch (e: any) {
      trackEvent("scanner_isbn_error", { isbn, message: e?.message ?? "unknown" });
      toast.error(e.message || "Erro");
    } finally {
      setBusy(false);
      setBusyLabel("");
      lockRef.current = false;
    }
  };

  const scanNext = () => {
    setFoundBook(null);
    setNotFoundIsbn(null);
    setDetected(null);
    setManualIsbn("");
    setPageResult(null);
    setCoverResults([]);
    setCoverGuess(null);
    if (mode === "barcode") startBarcode();
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

  // Cover mode
  const handleCoverFile = async (file: File) => {
    setBusy(true);
    setBusyLabel("Identificando capa com IA…");
    setCoverGuess(null);
    setCoverResults([]);
    try {
      const b64 = await fileToBase64(file);
      const rec = await recognizeCover(b64);
      if (!rec.query) {
        toast.error("Capa não reconhecida. Tente outra foto.");
        return;
      }
      setCoverGuess({ title: rec.title, author: rec.author });
      const books = await searchBooksGet(rec.query);
      setCoverResults(books.slice(0, 12));
      if (books.length === 0) toast.warning("Nenhum livro encontrado para esta capa");
      else haptic("success");
    } catch (e: any) {
      toast.error(e.message || "Erro ao reconhecer capa");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  // Page mode (OCR)
  const handlePageFile = async (file: File) => {
    setBusy(true);
    setBusyLabel("Analisando página…");
    setPageResult(null);
    try {
      const b64 = await fileToBase64(file);
      const rec = await recognizePage(b64);
      setPageResult(rec);
      if (rec.candidates.length === 0) {
        toast.warning("Não consegui identificar o livro a partir desta página");
      } else {
        haptic("success");
        toast.success(`Encontramos ${rec.candidates.length} possível${rec.candidates.length === 1 ? "" : "is"}`);
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao analisar página");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  const addCandidateToLibrary = async (c: PageCandidate) => {
    setBusy(true);
    setBusyLabel("Adicionando à biblioteca…");
    try {
      const saved = await saveBook({
        title: c.title,
        authors: c.authors,
        cover_url: c.cover_url,
        description: c.description ?? null,
        isbn_13: c.isbn && c.isbn.length === 13 ? c.isbn : null,
        isbn_10: c.isbn && c.isbn.length === 10 ? c.isbn : null,
        source: c.source,
      } as any);
      if (saved?.id) {
        // Adicionar à biblioteca pessoal com status NEUTRO (usuário decide quando começar)
        if (user) {
          await supabase
            .from("user_books")
            .upsert(
              { user_id: user.id, book_id: saved.id, status: "not_read" },
              { onConflict: "user_id,book_id" },
            );
          void awardXp(user.id, "add_book", { silent: true });
        }
        toast.success("Adicionado à sua biblioteca", {
          description: "Quando começar a ler, mude o status para 'Lendo'.",
        });
        navigate(`/livro/${saved.id}`);
      } else {
        toast.error("Não foi possível salvar");
      }
    } catch (e: any) {
      toast.error(e.message || "Erro");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 pb-32 md:pb-16 max-w-4xl mx-auto">
        <header className="mb-6 animate-fade-in">
          <p className="text-sm text-primary font-medium mb-2 flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Scanner inteligente
          </p>
          <h1 className="font-display text-3xl md:text-5xl font-bold leading-tight mb-2">
            Aponte. <span className="text-primary italic">Encontre.</span>
          </h1>
          <p className="text-muted-foreground text-sm md:text-base">
            ISBN, capa ou qualquer página interna — a IA descobre o livro pra você.
          </p>
        </header>

        {/* Mode switch — Apple-style segmented control */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="inline-flex items-center gap-1 p-1 rounded-full bg-card/60 border border-border">
            {(["barcode", "cover", "page"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => { stop(); setMode(m); scanNext(); }}
                className={cn(
                  "px-4 h-9 text-sm font-medium rounded-full transition-all flex items-center gap-1.5",
                  mode === m
                    ? "bg-primary text-primary-foreground shadow-glow"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "barcode" && <ScanBarcode className="w-3.5 h-3.5" />}
                {m === "cover" && <ImageIcon className="w-3.5 h-3.5" />}
                {m === "page" && <FileText className="w-3.5 h-3.5" />}
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>

          {mode === "barcode" && (
            <div
              className="inline-flex items-center gap-1 p-1 rounded-full bg-card/60 border border-border"
              role="radiogroup"
              aria-label="Comportamento do scanner"
            >
              {[
                { value: "single",     label: "Único",     icon: ScanLine, hint: "Para após cada livro" },
                { value: "continuous", label: "Contínuo",  icon: Repeat,   hint: "Auto-adiciona ao acervo" },
                { value: "batch",      label: "Lote",      icon: Layers,   hint: "Junta numa lista pra revisar" },
              ].map(({ value, label, icon: Icon, hint }) => (
                <button
                  key={value}
                  role="radio"
                  aria-checked={scanMode === value}
                  title={hint}
                  onClick={() => setScanMode(value as typeof scanMode)}
                  className={cn(
                    "px-3 h-8 text-xs font-medium rounded-full transition-all flex items-center gap-1.5",
                    scanMode === value
                      ? "bg-primary text-primary-foreground shadow-glow"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="w-3 h-3" /> {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* === BATCH MODE: lista de revisão antes de salvar em massa === */}
        {mode === "barcode" && scanMode === "batch" && batch.length > 0 && (
          <div className="mb-6">
            <BatchScanList
              items={batch}
              onUpdateStatus={(key, status) =>
                setBatch((prev) => prev.map((it) => it.key === key ? { ...it, pickedStatus: status } : it))
              }
              onRemove={(key) => setBatch((prev) => prev.filter((it) => it.key !== key))}
              onClear={() => setBatch([])}
              onMarkSaved={(keys) => {
                const set = new Set(keys);
                setBatch((prev) => prev.map((it) => set.has(it.key) ? { ...it, status: "saved" } : it));
              }}
            />
          </div>
        )}

        {/* === CONTINUOUS MODE: histórico horizontal compacto === */}
        {mode === "barcode" && scanMode === "continuous" && sessionLog.length > 0 && (
          <div className="glass rounded-2xl p-4 mb-6 animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Adicionados nesta sessão · {sessionLog.length}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setSessionLog([])} className="h-6 text-xs">
                Limpar
              </Button>
            </div>
            <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 snap-x snap-mandatory">
              {sessionLog.map((b) => (
                <button
                  key={b.id}
                  onClick={() => navigate(`/livro/${b.id}`)}
                  className="shrink-0 w-14 snap-start group"
                  aria-label={`Abrir ${b.title}`}
                >
                  <div className="aspect-[2/3] rounded-md overflow-hidden bg-muted ring-1 ring-border group-hover:ring-primary/60 transition-all">
                    {b.cover_url ? (
                      <img src={b.cover_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <BookOpen className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* === BARCODE MODE === */}
        {mode === "barcode" && (
          <section className="space-y-6 animate-fade-in">
            <div className="glass rounded-2xl overflow-hidden border border-border">
              <div className="relative aspect-[4/3] bg-black">
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />

                {!active && !busy && !foundBook && !notFoundIsbn && !cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-transparent to-black/40">
                    <Button variant="hero" size="lg" onClick={startBarcode} className="gap-2 shadow-glow">
                      <Camera className="w-4 h-4" /> Ativar câmera
                    </Button>
                  </div>
                )}

                {cameraError && !active && (
                  <CameraErrorOverlay
                    error={cameraError}
                    onRetry={() => { setCameraError(null); startBarcode(); }}
                    onManual={() => {
                      setCameraError(null);
                      stop();
                      // foca no input manual
                      setTimeout(() => {
                        document.querySelector<HTMLInputElement>('input[inputmode="numeric"]')?.focus();
                      }, 50);
                    }}
                    onCover={() => { setCameraError(null); setMode("cover"); scanNext(); }}
                  />
                )}

                {active && (
                  <>
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
                        <Button variant="outline" size="sm" onClick={toggleTorch} className="gap-1 h-8 bg-background/80 backdrop-blur-sm" aria-label="Lanterna">
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
                    <p className="text-sm text-foreground/90 font-medium">{busyLabel || (detected ? `Buscando ISBN ${detected}…` : "Buscando…")}</p>
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
              {scanStats.count >= 3 && (
                <p className="text-[11px] text-muted-foreground/80 pt-1">
                  Tempo médio de leitura: <span className="font-mono text-foreground/80">{(scanStats.median / 1000).toFixed(1)}s</span>
                  <span className="opacity-50"> · {scanStats.count} scans</span>
                </p>
              )}
            </form>

            {foundBook && (
              <div className="glass rounded-2xl p-5 border border-primary/40 shadow-glow animate-scale-in">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-24 shrink-0 rounded-md overflow-hidden bg-muted">
                    {foundBook.cover_url ? (
                      <img src={foundBook.cover_url} alt={foundBook.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground"><BookOpen className="w-6 h-6" /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-primary font-medium flex items-center gap-1.5 mb-1">
                      <Check className="w-3.5 h-3.5" /> Livro encontrado
                    </p>
                    <h3 className="font-display font-semibold text-lg leading-tight line-clamp-2">{foundBook.title}</h3>
                    {foundBook.authors?.length ? <p className="text-sm text-muted-foreground line-clamp-1">{foundBook.authors.join(", ")}</p> : null}
                    <div className="flex flex-wrap gap-2 mt-4">
                      <Button variant="hero" onClick={() => navigate(`/livro/${foundBook.id}`)} className="gap-2">
                        Ver livro <ArrowRight className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" onClick={scanNext} className="gap-2">
                        <ScanBarcode className="w-4 h-4" /> Escanear próximo
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {notFoundIsbn && (
              <div className="glass rounded-2xl p-5 border border-destructive/40 animate-fade-in">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
                    <BookX className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display font-semibold text-lg leading-tight">ISBN não encontrado</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Não localizamos <span className="font-mono text-foreground">{notFoundIsbn}</span>. Tente identificar pela capa ou por uma página interna.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-4">
                      <Button variant="hero" onClick={() => { setMode("cover"); scanNext(); }} className="gap-2">
                        <ImageIcon className="w-4 h-4" /> Tentar pela capa
                      </Button>
                      <Button variant="outline" onClick={() => { setMode("page"); scanNext(); }} className="gap-2">
                        <FileText className="w-4 h-4" /> Tentar pela página
                      </Button>
                      <Button variant="ghost" onClick={() => navigate(`/buscar?q=${encodeURIComponent(notFoundIsbn)}`)} className="gap-2">
                        <Search className="w-4 h-4" /> Buscar título
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* === COVER MODE === */}
        {mode === "cover" && (
          <section className="space-y-6 animate-fade-in">
            <CapturePanel
              icon={<ImageIcon className="w-10 h-10 text-primary" />}
              title="Identificar pela capa"
              hint="Tire ou envie uma foto nítida da capa do livro. A IA reconhece e busca em todos os catálogos."
              busy={busy}
              busyLabel={busyLabel}
              onPick={() => fileRef.current?.click()}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (mode === "cover") handleCoverFile(f);
                else if (mode === "page") handlePageFile(f);
                e.target.value = "";
              }}
            />

            {coverGuess && (
              <div className="glass rounded-xl p-4 animate-fade-in">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">IA identificou</p>
                <p className="font-display text-lg font-semibold">{coverGuess.title || "Título desconhecido"}</p>
                {coverGuess.author && <p className="text-sm text-muted-foreground">{coverGuess.author}</p>}
              </div>
            )}

            {coverResults.length > 0 && (
              <div>
                <h3 className="font-display text-xl font-semibold mb-3">Resultados</h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-5">
                  {coverResults.map((b, i) => (
                    <BookCard key={b.id ?? `cover-${i}`} book={b} size="sm" />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* === PAGE MODE (OCR + AI) === */}
        {mode === "page" && (
          <section className="space-y-6 animate-fade-in">
            <CapturePanel
              icon={<FileText className="w-10 h-10 text-primary" />}
              title="Identificar pela página"
              hint="Tire uma foto de qualquer página interna. A IA lê o texto, identifica trechos marcantes e descobre qual livro é."
              busy={busy}
              busyLabel={busyLabel}
              onPick={() => fileRef.current?.click()}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                handlePageFile(f);
                e.target.value = "";
              }}
            />

            {pageResult && (
              <>
                {pageResult.excerpt && (
                  <div className="glass rounded-xl p-4 animate-fade-in">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <FileText className="w-3 h-3" /> Trecho extraído
                    </p>
                    <p className="font-display text-base italic leading-relaxed">"{pageResult.excerpt}"</p>
                    {(pageResult.guess.title || pageResult.guess.author) && (
                      <p className="text-xs text-muted-foreground mt-3">
                        Palpite da IA:{" "}
                        <span className="text-foreground font-medium">{pageResult.guess.title || "?"}</span>
                        {pageResult.guess.author && <> — {pageResult.guess.author}</>}
                        {pageResult.confidence > 0 && (
                          <> · {Math.round(pageResult.confidence * 100)}% confiança</>
                        )}
                      </p>
                    )}
                  </div>
                )}

                {pageResult.candidates.length > 0 ? (
                  <div className="space-y-3">
                    <h3 className="font-display text-xl font-semibold">
                      {pageResult.candidates.length === 1 ? "Encontramos esse livro" : "Possíveis livros"}
                    </h3>
                    {pageResult.candidates.map((c, i) => (
                      <PageCandidateCard
                        key={`${c.title}-${i}`}
                        candidate={c}
                        primary={i === 0}
                        onAdd={() => addCandidateToLibrary(c)}
                        disabled={busy}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="glass rounded-2xl p-5 border border-destructive/30 animate-fade-in">
                    <p className="font-display font-semibold text-lg mb-1">Não consegui identificar</p>
                    <p className="text-sm text-muted-foreground mb-3">
                      A foto pode estar com pouco texto ou desfocada. Tente outra página com mais texto, ou use a busca.
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <Button onClick={scanNext} variant="hero" className="gap-2">
                        <Camera className="w-4 h-4" /> Tentar outra foto
                      </Button>
                      {pageResult.guess.title && (
                        <Button
                          variant="outline"
                          onClick={() => navigate(`/buscar?q=${encodeURIComponent(pageResult.guess.title!)}`)}
                          className="gap-2"
                        >
                          <Search className="w-4 h-4" /> Buscar palpite
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </AppShell>
  );
}

function CapturePanel({
  icon, title, hint, busy, busyLabel, onPick,
}: {
  icon: React.ReactNode; title: string; hint: string;
  busy: boolean; busyLabel: string; onPick: () => void;
}) {
  return (
    <div className="glass rounded-2xl p-8 text-center border border-dashed border-border relative overflow-hidden">
      {busy && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-10 animate-fade-in">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm font-medium">{busyLabel}</p>
        </div>
      )}
      <div className="mx-auto mb-3 w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        {icon}
      </div>
      <h3 className="font-display text-xl font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground mb-5 max-w-sm mx-auto">{hint}</p>
      <Button variant="hero" size="lg" onClick={onPick} disabled={busy} className="gap-2 shadow-glow">
        <Camera className="w-4 h-4" /> Tirar / enviar foto
      </Button>
    </div>
  );
}

function PageCandidateCard({
  candidate, primary, onAdd, disabled,
}: { candidate: PageCandidate; primary: boolean; onAdd: () => void; disabled: boolean }) {
  return (
    <div className={cn(
      "glass rounded-2xl p-4 flex gap-4 items-start animate-fade-in",
      primary ? "border border-primary/40 shadow-glow" : "border border-border",
    )}>
      <div className="w-16 h-24 shrink-0 rounded-md overflow-hidden bg-muted">
        {candidate.cover_url ? (
          <img src={candidate.cover_url} alt={candidate.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <BookOpen className="w-6 h-6" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {primary && (
          <p className="text-xs text-primary font-medium flex items-center gap-1.5 mb-1">
            <Check className="w-3.5 h-3.5" /> Mais provável
          </p>
        )}
        <h4 className="font-display font-semibold text-base leading-tight line-clamp-2">{candidate.title}</h4>
        {candidate.authors?.length > 0 && (
          <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">{candidate.authors.join(", ")}</p>
        )}
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
          fonte: {candidate.source === "openlibrary" ? "Open Library" : "Google Books"}
        </p>
        <Button onClick={onAdd} disabled={disabled} size="sm" variant={primary ? "hero" : "outline"} className="mt-3 gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Adicionar à biblioteca
        </Button>
      </div>
    </div>
  );
}

/**
 * Overlay claro quando a câmera falha — explica a causa e oferece
 * fallbacks acionáveis: tentar de novo, digitar ISBN ou ir pra capa.
 */
function CameraErrorOverlay({
  error, onRetry, onManual, onCover,
}: {
  error: CameraError;
  onRetry: () => void;
  onManual: () => void;
  onCover: () => void;
}) {
  const titleByKind: Record<CameraError["kind"], string> = {
    permission: "Permissão de câmera negada",
    "no-device": "Câmera traseira não encontrada",
    "in-use": "Câmera em uso por outro app",
    insecure: "Câmera só funciona em HTTPS",
    unknown: "Não foi possível abrir a câmera",
  };
  const hintByKind: Record<CameraError["kind"], string> = {
    permission: "Toque no cadeado da barra de endereço e libere a câmera. Depois tente de novo.",
    "no-device": "Seu dispositivo não tem câmera traseira disponível ou está bloqueada.",
    "in-use": "Feche outros apps que estão usando a câmera (Instagram, WhatsApp) e tente de novo.",
    insecure: "Acesse pelo domínio publicado (HTTPS). Câmera bloqueada em conexões inseguras.",
    unknown: error.message,
  };

  return (
    <div className="absolute inset-0 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center gap-3 px-6 text-center animate-fade-in">
      <div className="w-12 h-12 rounded-full bg-destructive/15 text-destructive flex items-center justify-center">
        <Camera className="w-6 h-6" />
      </div>
      <div>
        <p className="font-display font-semibold">{titleByKind[error.kind]}</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">{hintByKind[error.kind]}</p>
      </div>
      <div className="flex flex-wrap gap-2 justify-center mt-1">
        {error.kind !== "insecure" && (
          <Button size="sm" variant="hero" onClick={onRetry} className="gap-1.5">
            <Camera className="w-3.5 h-3.5" /> Tentar de novo
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onManual} className="gap-1.5">
          <FileText className="w-3.5 h-3.5" /> Digitar ISBN
        </Button>
        <Button size="sm" variant="ghost" onClick={onCover} className="gap-1.5">
          <ImageIcon className="w-3.5 h-3.5" /> Foto da capa
        </Button>
      </div>
    </div>
  );
}
