import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  bookId: string;
  description?: string | null;
  onDescriptionUpdated: (d: string) => void;
}

export function BookSynopsis({ bookId, description, onDescriptionUpdated }: Props) {
  const [loading, setLoading] = useState(false);
  const has = description && description.trim().length > 40;

  const generate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-synopsis", {
        body: { bookId },
      });
      if (error) throw error;
      if (data?.description) {
        onDescriptionUpdated(data.description);
        toast.success("Sinopse gerada");
      }
    } catch (e) {
      toast.error("Não foi possível gerar a sinopse");
    } finally {
      setLoading(false);
    }
  };

  return (
    <article>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-2xl md:text-3xl font-semibold">Sobre o livro</h2>
        {!has && (
          <Button variant="hero" size="sm" onClick={generate} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {loading ? "Gerando…" : "Gerar com IA"}
          </Button>
        )}
      </div>
      {has ? (
        <p className="text-base md:text-lg leading-relaxed text-foreground/85 whitespace-pre-line font-light">
          {description}
        </p>
      ) : loading ? (
        <div className="space-y-2.5">
          <div className="h-4 bg-muted/40 rounded animate-pulse" />
          <div className="h-4 bg-muted/40 rounded animate-pulse w-[95%]" />
          <div className="h-4 bg-muted/40 rounded animate-pulse w-[88%]" />
          <div className="h-4 bg-muted/40 rounded animate-pulse w-[92%]" />
        </div>
      ) : (
        <p className="italic text-muted-foreground">
          Sinopse indisponível. Clique em <span className="text-primary font-medium">"Gerar com IA"</span> para criar uma agora.
        </p>
      )}
    </article>
  );
}
