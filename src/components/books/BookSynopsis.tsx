import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Props {
  bookId: string;
  description?: string | null;
  onDescriptionUpdated: (d: string) => void;
}

export function BookSynopsis({ bookId, description, onDescriptionUpdated }: Props) {
  const [loading, setLoading] = useState(false);
  const has = !!(description && description.trim().length > 40);
  const autoTriedRef = useRef<string | null>(null);

  const generate = async (silent = false) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-synopsis", {
        body: { bookId },
      });
      if (error) throw error;
      if (data?.description) {
        onDescriptionUpdated(data.description);
        if (!silent) toast.success("Sinopse gerada");
      }
    } catch (e) {
      if (!silent) toast.error("Não foi possível gerar a sinopse");
    } finally {
      setLoading(false);
    }
  };

  // Auto-generate silently on first view when missing — never leave empty
  useEffect(() => {
    if (has) return;
    if (autoTriedRef.current === bookId) return;
    autoTriedRef.current = bookId;
    generate(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, has]);

  return (
    <article>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl md:text-3xl font-semibold">Sobre o livro</h2>
        {has && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => generate(false)}
            disabled={loading}
            className="gap-1.5 text-xs text-muted-foreground hover:text-primary"
            aria-label="Regerar sinopse com IA"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Regerar
          </Button>
        )}
      </div>
      {has ? (
        <p className="text-base md:text-lg leading-relaxed text-foreground/85 whitespace-pre-line font-light">
          {description}
        </p>
      ) : loading ? (
        <div className="space-y-2.5" aria-label="Gerando sinopse">
          <div className="h-4 skeleton-shimmer rounded" />
          <div className="h-4 skeleton-shimmer rounded w-[95%]" />
          <div className="h-4 skeleton-shimmer rounded w-[88%]" />
          <div className="h-4 skeleton-shimmer rounded w-[92%]" />
          <p className="text-xs text-muted-foreground pt-1 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-primary" /> Gerando sinopse com IA…
          </p>
        </div>
      ) : (
        <Button variant="hero" size="sm" onClick={() => generate(false)} className="gap-2">
          <Sparkles className="w-3.5 h-3.5" /> Gerar sinopse com IA
        </Button>
      )}
    </article>
  );
}
