import { useEffect, useRef, useState } from "react";
import { Book } from "@/types/book";
import { BookOpen, Camera, Loader2, RefreshCw, Upload, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveCover, invalidateCover } from "@/lib/cover-fallback";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Props {
  book: Pick<Book, "title" | "authors" | "cover_url" | "isbn_10" | "isbn_13"> & { id?: string };
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  /** Disable async fallback (e.g. inside lists for perf). Defaults to true. */
  fallback?: boolean;
  /** Allow click-to-fix interactive menu. Defaults to true when there's a book.id. */
  interactive?: boolean;
  onCoverChange?: (url: string) => void;
  /** view-transition-name aplicado no wrapper — usado para shared element entre telas. */
  transitionName?: string;
}

const SIZES = {
  sm: "w-16 h-24 text-[10px]",
  md: "w-28 h-44 text-xs",
  lg: "w-40 h-60 text-sm",
  xl: "w-52 h-80 text-base",
};

export function BookCover({
  book, size = "md", className, fallback = true, interactive, onCoverChange, transitionName,
}: Props) {
  const { user } = useAuth();
  const [src, setSrc] = useState<string | null>(book.cover_url ?? null);
  const [errored, setErrored] = useState(false);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const allowInteractive = (interactive ?? !!book.id) && !!user;

  useEffect(() => {
    setSrc(book.cover_url ?? null);
    setErrored(false);
  }, [book.cover_url]);

  // Auto-resolve when no cover or current source failed.
  // CRÍTICO: quando errored=true a URL atual tá morta — passa cover_url:null
  // pra forçar o cover-search a buscar uma nova fonte. invalidateCover() limpa
  // o memo pra não reutilizar a URL quebrada cacheada.
  useEffect(() => {
    if (!fallback) return;
    if (src && !errored) return;
    let cancelled = false;
    if (errored) invalidateCover(book);
    resolveCover(
      errored ? { ...book, cover_url: null } : book,
      { persist: !!book.id }, // persiste no banco — outros usuários não veem capa quebrada
    ).then((u) => {
      if (cancelled || !u) return;
      setErrored(false);
      setSrc(u);
      onCoverChange?.(u);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.isbn_13, book.isbn_10, book.id, errored, fallback]);

  const reSearch = async () => {
    setSearching(true);
    invalidateCover(book);
    try {
      const u = await resolveCover({ ...book, cover_url: null }, { persist: !!book.id });
      if (u) {
        setSrc(u);
        setErrored(false);
        onCoverChange?.(u);
        toast.success("Capa encontrada");
      } else {
        toast.error("Nenhuma capa encontrada — tente upload");
      }
    } finally {
      setSearching(false);
      setMenuOpen(false);
    }
  };

  const uploadFile = async (file: File) => {
    if (!user || !book.id) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 5MB)");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${book.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("book-covers").upload(path, file, { cacheControl: "3600", upsert: true });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("book-covers").getPublicUrl(path);
      const { error: dbErr } = await supabase.from("books").update({ cover_url: data.publicUrl }).eq("id", book.id);
      if (dbErr) throw dbErr;
      invalidateCover(book);
      setSrc(data.publicUrl);
      setErrored(false);
      onCoverChange?.(data.publicUrl);
      toast.success("Capa atualizada");
    } catch (e: any) {
      toast.error(e?.message || "Erro no upload");
    } finally {
      setUploading(false);
      setMenuOpen(false);
    }
  };

  const showImage = src && !errored;
  const overlay = (searching || uploading) && (
    <div className="absolute inset-0 bg-background/70 backdrop-blur-sm flex items-center justify-center z-10 rounded-[inherit]">
      <Loader2 className="w-5 h-5 animate-spin text-primary" />
    </div>
  );

  const transitionStyle = transitionName
    ? ({ viewTransitionName: transitionName } as React.CSSProperties)
    : undefined;

  const inner = showImage ? (
    <div
      className={cn("book-cover relative", SIZES[size], className)}
      style={transitionStyle}
    >
      <img
        src={src!}
        alt={`Capa de ${book.title}`}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover"
        onError={() => setErrored(true)}
      />
      {overlay}
    </div>
  ) : (
    <div
      className={cn(
        "book-cover relative flex flex-col items-center justify-center text-center p-3 border border-border/60",
        SIZES[size],
        className,
      )}
      style={{
        background:
          "linear-gradient(135deg, hsl(30 18% 14%) 0%, hsl(30 14% 8%) 50%, hsl(8 35% 18%) 100%)",
        ...(transitionStyle || {}),
      }}
    >
      <div className="absolute inset-0 opacity-20" style={{
        background: "repeating-linear-gradient(45deg, transparent, transparent 6px, hsl(38 75% 62% / 0.08) 6px, hsl(38 75% 62% / 0.08) 7px)",
      }} />
      <BookOpen className="w-6 h-6 text-primary/70 mb-2 relative" />
      <p className="font-display font-semibold text-foreground/95 line-clamp-3 leading-tight relative">
        {book.title}
      </p>
      {book.authors?.[0] && (
        <p className="text-muted-foreground mt-2 line-clamp-2 text-[0.85em] italic relative">
          {book.authors[0]}
        </p>
      )}
      {allowInteractive && (
        <div className="absolute bottom-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded-full bg-primary/90 text-primary-foreground text-[9px] font-medium uppercase tracking-wider opacity-90 group-hover:opacity-100 transition pointer-events-none">
          Adicionar
        </div>
      )}
      {overlay}
    </div>
  );

  if (!allowInteractive) return inner;

  return (
    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Opções de capa"
          className="group relative outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          {inner}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-56 p-1.5">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
        />
        <button
          onClick={reSearch}
          disabled={searching}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors text-left"
        >
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4 text-primary" />}
          <span>Buscar automaticamente</span>
        </button>
        <button
          onClick={() => cameraRef.current?.click()}
          disabled={uploading}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors text-left"
        >
          <Camera className="w-4 h-4 text-primary" />
          <span>Tirar foto</span>
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors text-left"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 text-primary" />}
          <span>Enviar imagem</span>
        </button>
        {showImage && (
          <button
            onClick={() => { setErrored(true); setSrc(null); reSearch(); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors text-left text-muted-foreground"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Substituir capa atual</span>
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
