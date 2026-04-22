import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Quote, Sparkles } from "lucide-react";

export interface BookQuotePayload {
  text: string;
  page?: number | null;
  book_id?: string | null;
  book_title?: string | null;
}

interface Props {
  currentBook?: { id: string; title: string } | null;
  onAttach: (q: BookQuotePayload) => void;
}

/** Dialog para o usuário colar uma citação do livro do mês e enviá-la junto da mensagem. */
export function QuoteAttachDialog({ currentBook, onAttach }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [page, setPage] = useState<string>("");

  const submit = () => {
    const t = text.trim();
    if (t.length < 3) return;
    onAttach({
      text: t,
      page: page ? Number(page) : null,
      book_id: currentBook?.id ?? null,
      book_title: currentBook?.title ?? null,
    });
    setText("");
    setPage("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground hover:text-primary"
          aria-label="Anexar citação do livro"
          title="Anexar citação"
        >
          <Quote className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Anexar citação
          </DialogTitle>
        </DialogHeader>
        {currentBook ? (
          <p className="text-xs text-muted-foreground -mt-2">
            de <span className="font-semibold text-foreground">{currentBook.title}</span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground -mt-2">
            O clube ainda não tem livro do mês — você pode citar mesmo assim.
          </p>
        )}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Cole o trecho exato do livro…"
          rows={5}
          maxLength={1000}
          className="resize-none"
        />
        <Input
          type="number"
          min={1}
          value={page}
          onChange={(e) => setPage(e.target.value)}
          placeholder="Página (opcional)"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button variant="hero" onClick={submit} disabled={text.trim().length < 3}>
            Anexar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface BlockProps {
  quote: BookQuotePayload;
  compact?: boolean;
}

/** Bloco visual de citação dentro de uma mensagem. */
export function QuoteBlock({ quote, compact = false }: BlockProps) {
  return (
    <blockquote
      className={cn(
        "relative border-l-2 border-primary/60 pl-3 pr-2 py-1.5 my-1 rounded-r-md bg-primary/5 italic text-foreground",
        compact ? "text-xs" : "text-sm",
      )}
    >
      <Quote className="absolute -top-1 -left-1 w-3 h-3 text-primary/70 bg-background rounded-full" />
      <p className="whitespace-pre-line">"{quote.text}"</p>
      {(quote.book_title || quote.page) && (
        <footer className="text-[10px] text-muted-foreground mt-1 not-italic">
          {quote.book_title && <span>— {quote.book_title}</span>}
          {quote.page && <span>{quote.book_title ? `, p. ${quote.page}` : `p. ${quote.page}`}</span>}
        </footer>
      )}
    </blockquote>
  );
}

import { cn } from "@/lib/utils";
