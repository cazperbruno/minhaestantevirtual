import { Book, UserBook } from "@/types/book";
import { Rating } from "./Rating";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Check } from "lucide-react";

interface Props {
  book: Book;
  ub: UserBook;
  onUpdate: (patch: Partial<UserBook>) => void;
  onCommit: (patch: Partial<UserBook>) => void;
}

export function BookSidePanel({ book, ub, onUpdate, onCommit }: Props) {
  const showProgress = book.page_count && (ub.status === "reading" || ub.status === "read");

  return (
    <aside className="glass rounded-2xl p-6 h-fit md:sticky md:top-6 space-y-6">
      <div>
        <p className="text-sm text-muted-foreground mb-2 font-medium">Sua avaliação</p>
        <Rating value={ub.rating ?? 0} onChange={(v) => onCommit({ rating: v })} />
      </div>

      {showProgress && (
        <div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-muted-foreground font-medium">Progresso</span>
            <span className="font-bold text-primary tabular-nums">
              {Math.round(((ub.current_page ?? 0) / book.page_count!) * 100)}%
            </span>
          </div>
          <Slider
            value={[ub.current_page ?? 0]}
            max={book.page_count!}
            step={1}
            onValueChange={(v) => onUpdate({ current_page: v[0] })}
            onValueCommit={(v) => onCommit({ current_page: v[0] })}
          />
          <p className="text-xs text-muted-foreground mt-1.5 tabular-nums">
            {ub.current_page ?? 0} de {book.page_count} páginas
          </p>
        </div>
      )}

      <div>
        <label className="text-sm text-muted-foreground mb-2 block font-medium">Notas pessoais</label>
        <Textarea
          value={ub.notes ?? ""}
          onChange={(e) => onUpdate({ notes: e.target.value })}
          onBlur={() => onCommit({ notes: ub.notes })}
          placeholder="Suas impressões, frases marcantes, reflexões…"
          rows={5}
          className="resize-none bg-card/40"
        />
      </div>

      {ub.status === "read" && (
        <div className="flex items-center gap-2 text-sm text-status-read font-semibold pt-2 border-t border-border/40">
          <Check className="w-4 h-4" /> Concluído
        </div>
      )}
    </aside>
  );
}
