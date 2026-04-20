import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { UserBook } from "@/types/book";
import { BookCard } from "@/components/books/BookCard";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRowSkeleton } from "@/components/ui/skeletons";
import { Heart, Share2, ShoppingBag, Link2, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { openAmazon } from "@/lib/amazon";

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
          <ListRowSkeleton count={5} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Heart />}
            title="Nenhum desejo ainda"
            description="Salve aqui os livros que você quer ler em breve. Acompanhe-os e compartilhe com quem quiser presentear você."
            action={
              <Link to="/buscar">
                <Button variant="hero" className="gap-2 tap-scale">
                  <Search className="w-4 h-4" /> Buscar livros
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="space-y-3 animate-stagger">
            {items.map((ub) => ub.book && (
              <div key={ub.id} className="glass rounded-xl p-4 flex gap-4 items-center hover:border-primary/30 hover:shadow-card transition-all tap-scale">
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
                  <Button variant="outline" size="sm" className="gap-2 tap-scale">
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
