import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { UserBook } from "@/types/book";
import { BookCard } from "@/components/books/BookCard";
import { Button } from "@/components/ui/button";
import { Heart, Share2, ShoppingBag, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

export default function WishlistPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<UserBook[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("user_books").select("*, book:books(*)")
        .eq("user_id", user.id).eq("status", "wishlist")
        .order("created_at", { ascending: false });
      setItems((data as UserBook[]) || []);
      setLoading(false);
    })();
  }, [user]);

  const shareList = () => {
    const text = items.map((i) => `• ${i.book?.title}${i.book?.authors[0] ? ` — ${i.book.authors[0]}` : ""}`).join("\n");
    const full = `🎁 Minha lista de desejos no Página:\n\n${text}\n\n${window.location.href}`;
    if (navigator.share) navigator.share({ title: "Lista de desejos", text: full }).catch(() => {});
    else { navigator.clipboard.writeText(full); toast.success("Lista copiada!"); }
  };

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 pb-16 max-w-6xl mx-auto">
        <header className="flex items-end justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="font-display text-3xl md:text-4xl font-bold flex items-center gap-3">
              <Heart className="w-7 h-7 text-status-wishlist" /> Lista de desejos
            </h1>
            <p className="text-muted-foreground mt-1">{items.length} {items.length === 1 ? "livro" : "livros"}</p>
          </div>
          {items.length > 0 && (
            <Button variant="outline" onClick={shareList} className="gap-2">
              <Share2 className="w-4 h-4" /> Compartilhar lista
            </Button>
          )}
        </header>

        {loading ? (
          <div className="text-muted-foreground">Carregando…</div>
        ) : items.length === 0 ? (
          <div className="text-center py-20">
            <Heart className="w-12 h-12 text-status-wishlist/40 mx-auto mb-4" />
            <p className="font-display text-xl">Nenhum desejo ainda</p>
            <p className="text-muted-foreground mb-4">Adicione livros que quer ler em breve.</p>
            <Link to="/buscar"><Button variant="hero">Buscar livros</Button></Link>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((ub) => ub.book && (
              <div key={ub.id} className="glass rounded-xl p-4 flex gap-4 items-center hover:shadow-card transition-shadow animate-fade-in">
                <Link to={`/livro/${ub.book.id}`} className="shrink-0">
                  <BookCard book={ub.book} size="sm" showMeta={false} />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link to={`/livro/${ub.book.id}`}>
                    <h3 className="font-display font-semibold truncate hover:text-primary transition-colors">{ub.book.title}</h3>
                  </Link>
                  <p className="text-sm text-muted-foreground truncate">{ub.book.authors[0]}</p>
                </div>
                <a
                  href={`https://www.amazon.com.br/s?k=${encodeURIComponent(ub.book.isbn_13 || ub.book.title)}`}
                  target="_blank" rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm" className="gap-2">
                    <ShoppingBag className="w-3.5 h-3.5" /> Amazon <ExternalLink className="w-3 h-3" />
                  </Button>
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
