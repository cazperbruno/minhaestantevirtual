/**
 * Linha de "volume faltante" — slot vazio para um volume que o usuário
 * ainda não tem na coleção. Inclui CTA para comprar na Amazon.
 */
import { ShoppingCart, Plus, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  seriesTitle: string;
  volumeNumber: number;
  onAddManually?: () => void;
}

export function MissingVolumeRow({ seriesTitle, volumeNumber, onAddManually }: Props) {
  const amazonTag =
    (import.meta.env.VITE_AMAZON_AFFILIATE_TAG as string | undefined) || "cazperbruno-20";
  const url = `https://www.amazon.com.br/s?k=${encodeURIComponent(`${seriesTitle} volume ${volumeNumber}`)}&tag=${amazonTag}`;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-border/50 bg-muted/20 hover:border-primary/40 transition-colors">
      <div className="w-12 h-16 shrink-0 rounded-md bg-muted/40 grid place-items-center text-muted-foreground/50">
        <BookOpen className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Volume faltante</p>
        <p className="font-semibold text-sm">Vol. #{volumeNumber}</p>
      </div>
      <div className="flex flex-col gap-1.5 shrink-0">
        <a href={url} target="_blank" rel="noopener noreferrer">
          <Button size="sm" variant="hero" className="gap-1.5 h-8 text-xs">
            <ShoppingCart className="w-3.5 h-3.5" /> Comprar
          </Button>
        </a>
        {onAddManually && (
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 h-7 text-[11px]"
            onClick={onAddManually}
          >
            <Plus className="w-3 h-3" /> Já tenho
          </Button>
        )}
      </div>
    </div>
  );
}
