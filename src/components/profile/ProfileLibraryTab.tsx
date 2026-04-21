import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useLibrary } from "@/hooks/useLibrary";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowRight, BookOpen, Library as LibraryIcon } from "lucide-react";
import { BookCover } from "@/components/books/BookCover";

const STATUS_LABEL: Record<string, string> = {
  reading: "Lendo agora",
  read: "Lidos recentemente",
  wishlist: "Quero ler",
  not_read: "Na estante",
};

/**
 * Aba "Biblioteca" do perfil — preview leve da biblioteca do usuário,
 * agrupada por status. Usa o cache compartilhado de useLibrary, então
 * navegar de e para /biblioteca é instantâneo.
 */
export function ProfileLibraryTab() {
  const { data: items = [], isLoading } = useLibrary();

  const grouped = useMemo(() => {
    const map: Record<string, typeof items> = { reading: [], read: [], wishlist: [], not_read: [] };
    for (const it of items) {
      (map[it.status] ||= []).push(it);
    }
    // mais recente primeiro (já vem ordenado por updated_at desc do hook)
    return map;
  }, [items]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <div className="flex gap-3 overflow-hidden">
              {[0, 1, 2, 3, 4].map((j) => (
                <Skeleton key={j} className="h-44 w-28 rounded-lg shrink-0" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <LibraryIcon className="w-10 h-10 text-primary/60 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground mb-4">Sua biblioteca está vazia.</p>
        <Button asChild variant="hero" size="sm">
          <Link to="/buscar">Adicionar primeiro livro</Link>
        </Button>
      </div>
    );
  }

  const order = ["reading", "read", "wishlist", "not_read"] as const;

  return (
    <div className="space-y-6">
      {order.map((status) => {
        const list = grouped[status] || [];
        if (list.length === 0) return null;
        const preview = list.slice(0, 8);
        return (
          <section key={status}>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="font-display text-base sm:text-lg font-semibold flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                {STATUS_LABEL[status]}
                <span className="text-xs text-muted-foreground font-normal">· {list.length}</span>
              </h3>
              <Button asChild variant="ghost" size="sm" className="text-xs gap-1">
                <Link to="/biblioteca">Ver todos <ArrowRight className="w-3 h-3" /></Link>
              </Button>
            </div>
            <ul className="flex gap-3 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-2 scroll-snap-x">
              {preview.map((item) => (
                <li key={item.id} className="shrink-0 w-28">
                  <Link to={`/livro/${item.book_id}`} className="block tap-scale">
                    <BookCover
                      title={item.book?.title}
                      src={item.book?.cover_url}
                      className="w-28 h-44"
                    />
                    <p className="text-xs font-medium mt-1.5 line-clamp-2 leading-tight">
                      {item.book?.title || "Sem título"}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <Button asChild variant="outline" className="w-full gap-1.5">
        <Link to="/biblioteca">Abrir biblioteca completa <ArrowRight className="w-4 h-4" /></Link>
      </Button>
    </div>
  );
}
