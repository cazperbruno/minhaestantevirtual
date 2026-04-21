import { useEffect, useState } from "react";
import { Book, UserBook } from "@/types/book";
import { Rating } from "./Rating";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Users } from "lucide-react";
import { AvailabilityToggles } from "./AvailabilityToggles";
import { RecommendBookDialog } from "./RecommendBookDialog";
import { InviteBuddyDialog } from "@/components/social/InviteBuddyDialog";
import { Button } from "@/components/ui/button";
import { useBookNotes, useSaveBookNotes } from "@/hooks/useBookNotes";

interface Props {
  book: Book;
  ub: UserBook;
  onUpdate: (patch: Partial<UserBook>) => void;
  onCommit: (patch: Partial<UserBook>) => void;
}

export function BookSidePanel({ book, ub, onUpdate, onCommit }: Props) {
  const showProgress = book.page_count && (ub.status === "reading" || ub.status === "read");
  const [buddyOpen, setBuddyOpen] = useState(false);
  const { data: savedNotes = "" } = useBookNotes(ub.id);
  const saveNotes = useSaveBookNotes(ub.id);
  const [notesDraft, setNotesDraft] = useState(savedNotes);
  useEffect(() => { setNotesDraft(savedNotes); }, [savedNotes]);

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
        <label className="text-sm text-muted-foreground mb-2 block font-medium">
          Notas pessoais <span className="text-xs text-muted-foreground/70">(privadas)</span>
        </label>
        <Textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={() => { if (notesDraft !== savedNotes) saveNotes.mutate(notesDraft); }}
          placeholder="Suas impressões, frases marcantes, reflexões…"
          rows={5}
          className="resize-none bg-card/40"
        />
      </div>

      <div className="pt-4 border-t border-border/40">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3 flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-primary" /> Compartilhar
        </p>
        <AvailabilityToggles
          userBookId={ub.id}
          initialTrade={!!ub.available_for_trade}
          initialLoan={!!ub.available_for_loan}
          compact
        />
        <div className="mt-3">
          <RecommendBookDialog bookId={book.id} bookTitle={book.title} />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-full gap-2"
          onClick={() => setBuddyOpen(true)}
        >
          <Users className="w-4 h-4" />
          Convidar pra ler junto
        </Button>
        <InviteBuddyDialog bookId={book.id} bookTitle={book.title} open={buddyOpen} onOpenChange={setBuddyOpen} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-full gap-2"
          onClick={() => openAmazon(book)}
        >
          <ShoppingCart className="w-4 h-4" />
          Ver preço na Amazon
        </Button>
      </div>

      {ub.status === "read" && (
        <div className="flex items-center gap-2 text-sm text-status-read font-semibold pt-2 border-t border-border/40">
          <Check className="w-4 h-4" /> Concluído
        </div>
      )}
    </aside>
  );
}
