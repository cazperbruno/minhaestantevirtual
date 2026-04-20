import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BookCover } from "@/components/books/BookCover";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  receiverId: string;
  receiverName?: string;
  receiverBookId?: string; // when proposing for a specific book
  trigger?: React.ReactNode;
}

interface Item { id: string; book: any }

export function ProposeTradeDialog({ receiverId, receiverName, receiverBookId, trigger }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [myBooks, setMyBooks] = useState<Item[]>([]);
  const [theirBooks, setTheirBooks] = useState<Item[]>([]);
  const [mineId, setMineId] = useState<string | null>(null);
  const [theirsId, setTheirsId] = useState<string | null>(receiverBookId ?? null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      setLoading(true);
      const [{ data: mine }, { data: theirs }] = await Promise.all([
        supabase
          .from("user_books")
          .select("id, book:books(*)")
          .eq("user_id", user.id)
          .eq("available_for_trade", true)
          .limit(60),
        supabase
          .from("user_books")
          .select("id, book:books(*)")
          .eq("user_id", receiverId)
          .eq("available_for_trade", true)
          .eq("is_public", true)
          .limit(60),
      ]);
      setMyBooks((mine || []) as any);
      setTheirBooks((theirs || []) as any);
      setLoading(false);
    })();
  }, [open, user, receiverId]);

  const send = async () => {
    if (!user || !mineId || !theirsId) {
      toast.error("Escolha um livro seu e um do outro leitor");
      return;
    }
    setSending(true);
    const { error } = await supabase.from("trades").insert({
      proposer_id: user.id,
      receiver_id: receiverId,
      proposer_book_id: mineId,
      receiver_book_id: theirsId,
      message: message.trim() || null,
    });
    setSending(false);
    if (error) {
      toast.error("Erro ao enviar proposta");
      return;
    }
    toast.success("Proposta enviada!");
    setOpen(false);
    setMineId(null);
    setTheirsId(receiverBookId ?? null);
    setMessage("");
  };

  if (!user || user.id === receiverId) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-1.5">
            <ArrowRightLeft className="w-3.5 h-3.5" /> Propor troca
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
            Propor troca {receiverName && <span className="text-muted-foreground">com {receiverName}</span>}
          </DialogTitle>
          <DialogDescription>
            Escolha um dos seus livros disponíveis e um livro que você quer em troca.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-6 pt-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Você oferece
              </h3>
              {myBooks.length === 0 ? (
                <p className="text-sm text-muted-foreground italic glass rounded-xl p-4">
                  Você ainda não marcou nenhum livro como "disponível para troca". Vá na Biblioteca e ative essa opção em algum livro.
                </p>
              ) : (
                <BookGrid items={myBooks} selectedId={mineId} onSelect={setMineId} />
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Você recebe
              </h3>
              {theirBooks.length === 0 ? (
                <p className="text-sm text-muted-foreground italic glass rounded-xl p-4">
                  Esse leitor não tem nenhum livro disponível para troca no momento.
                </p>
              ) : (
                <BookGrid items={theirBooks} selectedId={theirsId} onSelect={setTheirsId} />
              )}
            </div>

            <div>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Mensagem opcional para a pessoa..."
              />
            </div>

            <Button
              onClick={send}
              variant="hero"
              size="lg"
              className="w-full gap-2"
              disabled={sending || !mineId || !theirsId}
            >
              {sending && <Loader2 className="w-4 h-4 animate-spin" />}
              Enviar proposta
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BookGrid({ items, selectedId, onSelect }: { items: Item[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <ul className="grid grid-cols-3 sm:grid-cols-4 gap-3">
      {items.map((it) => {
        const bookId = it.book?.id;
        if (!bookId) return null;
        const selected = selectedId === bookId;
        return (
          <li key={it.id}>
            <button
              type="button"
              onClick={() => onSelect(bookId)}
              className={cn(
                "block w-full rounded-xl p-2 transition-all text-left",
                selected ? "bg-primary/15 ring-2 ring-primary" : "hover:bg-muted/50",
              )}
            >
              <BookCover book={it.book} size="sm" className="mx-auto" />
              <p className="text-xs font-medium mt-2 line-clamp-2 leading-tight">{it.book.title}</p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
