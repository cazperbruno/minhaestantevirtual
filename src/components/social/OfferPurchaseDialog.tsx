import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { BookCover } from "@/components/books/BookCover";
import { DollarSign, Loader2, HandCoins } from "lucide-react";
import { toast } from "sonner";

interface Props {
  receiverId: string;
  receiverName?: string;
  book?: { id: string; title?: string; authors?: string[]; cover_url?: string | null } | null;
  trigger?: React.ReactNode;
}

/**
 * Card / diálogo pra oferecer comprar um livro em vez de trocar.
 * Envia uma notificação direta pro dono com a proposta de valor e mensagem.
 */
export function OfferPurchaseDialog({ receiverId, receiverName, book, trigger }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  if (!user || user.id === receiverId) return null;

  const send = async () => {
    const value = Number(amount.replace(",", "."));
    if (!amount || Number.isNaN(value) || value <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    setSending(true);
    const formatted = value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const { data: me } = await supabase
      .from("profiles")
      .select("display_name,username")
      .eq("id", user.id)
      .maybeSingle();
    const myName = me?.display_name || me?.username || "Alguém";
    const bookTitle = book?.title || "seu livro";

    const { error } = await supabase.from("notifications").insert({
      user_id: receiverId,
      kind: "purchase_offer",
      title: `${myName} quer comprar ${bookTitle}`,
      body: `Oferta: ${formatted}${message.trim() ? ` — "${message.trim()}"` : ""}`,
      link: book?.id ? `/livro/${book.id}` : "/trocas",
      meta: {
        from_user_id: user.id,
        book_id: book?.id ?? null,
        amount: value,
        currency: "BRL",
        message: message.trim() || null,
      },
    });
    setSending(false);
    if (error) {
      toast.error("Não foi possível enviar a oferta");
      return;
    }
    toast.success("Oferta enviada! 💸", {
      description: `${receiverName || "A pessoa"} vai receber sua proposta.`,
    });
    setOpen(false);
    setAmount("");
    setMessage("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-1.5">
            <HandCoins className="w-3.5 h-3.5" /> Oferecer pagar
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl flex items-center gap-2">
            <HandCoins className="w-5 h-5 text-primary" /> Oferecer pagar
          </DialogTitle>
          <DialogDescription>
            Em vez de trocar, faça uma proposta em dinheiro {receiverName ? `para ${receiverName}` : ""}. A pessoa recebe sua oferta e decide se aceita.
          </DialogDescription>
        </DialogHeader>

        {book && (
          <div className="flex items-center gap-3 glass rounded-xl p-3">
            <BookCover book={book as any} size="sm" />
            <div className="min-w-0">
              <p className="font-display font-semibold line-clamp-2 text-sm">{book.title}</p>
              {book.authors?.[0] && (
                <p className="text-xs text-muted-foreground line-clamp-1">{book.authors.slice(0, 2).join(", ")}</p>
              )}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="offer-amount" className="text-xs uppercase tracking-wider text-muted-foreground">
            Valor da oferta
          </Label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="offer-amount"
              inputMode="decimal"
              placeholder="50,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
              className="pl-9"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">Em reais (R$). Combine entrega/pagamento direto com a pessoa.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="offer-message" className="text-xs uppercase tracking-wider text-muted-foreground">
            Mensagem (opcional)
          </Label>
          <Textarea
            id="offer-message"
            rows={3}
            maxLength={400}
            placeholder="Posso retirar aí ou pago o frete. Topa?"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <Button
          onClick={send}
          variant="hero"
          size="lg"
          className="w-full gap-2"
          disabled={sending || !amount}
        >
          {sending && <Loader2 className="w-4 h-4 animate-spin" />}
          Enviar oferta
        </Button>
      </DialogContent>
    </Dialog>
  );
}
