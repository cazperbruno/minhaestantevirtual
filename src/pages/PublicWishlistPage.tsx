import { useEffect, useState } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { BookCover } from "@/components/books/BookCover";
import { Heart, Share2, ShoppingBag, ArrowRight, Loader2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { openAmazon } from "@/lib/amazon";
import { cn } from "@/lib/utils";
import type { Book } from "@/types/book";

interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  profile_visibility: string;
}

interface WishItem {
  id: string;
  created_at: string;
  book: Book | null;
}

/**
 * Página pública (sem login) da lista de desejos de um leitor: /u/:username/desejos
 *
 * RLS já filtra: o RLS de `user_books` só retorna registros com is_public=true
 * e profile_visibility='public', então não precisamos validar visibilidade aqui.
 */
export default function PublicWishlistPage() {
  const { username } = useParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems] = useState<WishItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // 1) Busca perfil pelo username (case-insensitive)
      const { data: prof } = await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url,bio,profile_visibility")
        .ilike("username", username)
        .maybeSingle();
      if (cancelled) return;
      if (!prof) { setNotFound(true); setLoading(false); return; }
      setProfile(prof as Profile);

      // 2) Wishlist pública desse perfil
      const { data: ub } = await supabase
        .from("user_books")
        .select("id,created_at,book:books(*)")
        .eq("user_id", prof.id)
        .eq("status", "wishlist")
        .eq("is_public", true)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setItems((ub as WishItem[]) || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [username]);

  const shareLink = async () => {
    const url = window.location.href;
    const text = `🎁 Lista de desejos de ${profile?.display_name || username} no Readify`;
    try {
      if (navigator.share) await navigator.share({ title: text, url });
      else { await navigator.clipboard.writeText(url); toast.success("Link copiado"); }
    } catch { /* user cancel */ }
  };

  if (notFound) return <Navigate to="/auth" replace />;

  return (
    <div className="min-h-screen bg-background">
      {/* Header com gradiente */}
      <div className="relative border-b border-border/40 overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-primary/10 via-background/40 to-background -z-10" />
        <div className="px-5 md:px-10 py-10 md:py-14 max-w-4xl mx-auto">
          {loading ? (
            <div className="flex items-center gap-4 animate-pulse">
              <div className="w-20 h-20 rounded-full bg-muted" />
              <div className="space-y-2">
                <div className="h-5 w-40 bg-muted rounded" />
                <div className="h-3 w-24 bg-muted rounded" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-end gap-5">
              <Avatar className="w-20 h-20 ring-4 ring-primary/30 shadow-glow">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="text-2xl font-display bg-gradient-gold text-primary-foreground">
                  {(profile?.display_name || username || "?").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold mb-1 flex items-center gap-1.5">
                  <Heart className="w-3 h-3 fill-primary" /> Lista de desejos
                </p>
                <h1 className="font-display text-3xl md:text-5xl font-bold leading-tight">
                  {profile?.display_name || username}
                </h1>
                {profile?.bio && (
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2 max-w-xl">{profile.bio}</p>
                )}
                <p className="text-sm text-muted-foreground mt-2">
                  {items.length} {items.length === 1 ? "livro" : "livros"} na lista
                </p>
              </div>
              <Button variant="outline" onClick={shareLink} className="gap-2 shrink-0">
                <Share2 className="w-4 h-4" /> Compartilhar
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Lista */}
      <div className="px-5 md:px-10 py-10 max-w-4xl mx-auto pb-24">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 max-w-md mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-gradient-spine border border-border mx-auto mb-4 flex items-center justify-center">
              <BookOpen className="w-7 h-7 text-primary/60" />
            </div>
            <h2 className="font-display text-xl font-semibold mb-2">Nenhum desejo público</h2>
            <p className="text-sm text-muted-foreground">Esta pessoa ainda não compartilhou nenhum livro publicamente.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((it, idx) => it.book && (
              <li
                key={it.id}
                className={cn(
                  "glass rounded-2xl p-4 flex gap-4 items-center hover:border-primary/30 hover:shadow-card transition-all animate-fade-in",
                )}
                style={{ animationDelay: `${Math.min(idx * 40, 400)}ms` }}
              >
                <Link to={`/livro/${it.book.id}`} className="shrink-0">
                  <BookCover book={it.book} size="sm" />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link to={`/livro/${it.book.id}`} className="block">
                    <h3 className="font-display font-semibold leading-tight line-clamp-2 hover:text-primary transition-colors">
                      {it.book.title}
                    </h3>
                  </Link>
                  {it.book.authors?.[0] && (
                    <p className="text-sm text-muted-foreground truncate mt-0.5">{it.book.authors[0]}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openAmazon(it.book!)}
                    className="gap-1.5"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Presentear</span>
                  </Button>
                  <Link to={`/livro/${it.book.id}`} aria-label="Ver detalhes">
                    <Button variant="ghost" size="sm" className="gap-1">
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Footer com CTA para criar conta */}
        <div className="mt-12 pt-8 border-t border-border/30 text-center">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Powered by</p>
          <Link to="/" className="inline-block">
            <p className="font-display text-2xl font-bold hover:text-primary transition-colors">
              Readify
            </p>
          </Link>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
            Crie sua biblioteca, compartilhe leituras e descubra livros incríveis.
          </p>
          <Link to="/auth" className="inline-block mt-4">
            <Button variant="hero" className="gap-2">
              Começar grátis <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
