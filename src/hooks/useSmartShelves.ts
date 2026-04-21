import { useMemo } from "react";
import type { UserBook } from "@/types/book";

export interface SmartShelf {
  id: string;
  title: string;
  subtitle?: string;
  items: UserBook[];
  /** Used to order shelves: lower = more important. */
  priority: number;
}

const RECENT_DAYS = 30;

/**
 * Gera prateleiras dinâmicas a partir da biblioteca do usuário.
 *
 * - "Continue lendo" / "Adicionados recentemente" / "Favoritos" são fixas.
 * - "Por gênero" / "Por autor" são geradas a partir dos top N do usuário.
 * - "Porque você leu X" pega o último livro lido com 4-5★ e mostra outros do mesmo
 *   autor/gênero ainda não lidos (na biblioteca).
 *
 * Tudo client-side, memoizado. Nunca retorna prateleira vazia.
 */
export function useSmartShelves(items: UserBook[]): SmartShelf[] {
  return useMemo(() => {
    if (!items.length) return [];
    const shelves: SmartShelf[] = [];

    const reading = items.filter((i) => i.status === "reading");
    const read = items.filter((i) => i.status === "read");
    const wishlist = items.filter((i) => i.status === "wishlist");
    const acquired = items.filter((i) => i.status === "not_read");
    const favorites = items.filter((i) => (i.rating ?? 0) >= 4);

    // --- 1. Continue lendo ---
    if (reading.length) {
      shelves.push({
        id: "continue",
        title: "Continue lendo",
        subtitle: "Volte de onde parou",
        items: reading.slice(0, 20),
        priority: 0,
      });
    }

    // --- 2. Adicionados recentemente ---
    const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
    const recent = items
      .filter((i) => new Date(i.created_at).getTime() > cutoff)
      .slice(0, 20);
    if (recent.length >= 3) {
      shelves.push({
        id: "recent",
        title: "Adicionados recentemente",
        subtitle: "Novos na sua coleção",
        items: recent,
        priority: 1,
      });
    }

    // --- 3. Favoritos (4-5★) ---
    if (favorites.length >= 3) {
      shelves.push({
        id: "favorites",
        title: "Seus favoritos",
        subtitle: "Os que você mais amou",
        items: favorites
          .slice()
          .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
          .slice(0, 20),
        priority: 2,
      });
    }

    // --- 4. Quero ler (fila) ---
    if (wishlist.length >= 3) {
      shelves.push({
        id: "wishlist",
        title: "Na sua fila",
        subtitle: `${wishlist.length} esperando você`,
        items: wishlist.slice(0, 20),
        priority: 3,
      });
    }

    // --- 5. No acervo (físico, ainda não lidos) ---
    if (acquired.length >= 3) {
      shelves.push({
        id: "acquired",
        title: "No seu acervo",
        subtitle: "Esperando uma chance",
        items: acquired.slice(0, 20),
        priority: 4,
      });
    }

    // --- 6. Por gênero (top 3 categorias) ---
    const genreCount = new Map<string, UserBook[]>();
    for (const i of items) {
      const cats = i.book?.categories ?? [];
      for (const c of cats) {
        if (!c) continue;
        const list = genreCount.get(c) ?? [];
        list.push(i);
        genreCount.set(c, list);
      }
    }
    const topGenres = [...genreCount.entries()]
      .filter(([, list]) => list.length >= 3)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 3);
    topGenres.forEach(([genre, list], idx) => {
      shelves.push({
        id: `genre-${genre}`,
        title: genre,
        subtitle: `${list.length} ${list.length === 1 ? "livro" : "livros"} desse gênero`,
        items: list.slice(0, 20),
        priority: 10 + idx,
      });
    });

    // --- 7. Por autor (top 2 autores com >= 2 livros) ---
    const authorCount = new Map<string, UserBook[]>();
    for (const i of items) {
      const a = i.book?.authors?.[0];
      if (!a) continue;
      const list = authorCount.get(a) ?? [];
      list.push(i);
      authorCount.set(a, list);
    }
    const topAuthors = [...authorCount.entries()]
      .filter(([, list]) => list.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 2);
    topAuthors.forEach(([author, list], idx) => {
      shelves.push({
        id: `author-${author}`,
        title: `Mais de ${author}`,
        subtitle: `${list.length} obras na sua biblioteca`,
        items: list.slice(0, 20),
        priority: 20 + idx,
      });
    });

    // --- 8. Porque você leu X (último 4-5★) ---
    const lastFav = read
      .filter((i) => (i.rating ?? 0) >= 4 && i.book)
      .sort((a, b) =>
        new Date(b.finished_at ?? b.updated_at).getTime() -
        new Date(a.finished_at ?? a.updated_at).getTime(),
      )[0];

    if (lastFav?.book) {
      const seedAuthor = lastFav.book.authors?.[0];
      const seedCats = new Set(lastFav.book.categories ?? []);
      const related = items.filter((i) => {
        if (i.id === lastFav.id) return false;
        if (i.status === "read") return false;
        const sameAuthor = !!seedAuthor && i.book?.authors?.includes(seedAuthor);
        const sameGenre = (i.book?.categories ?? []).some((c) => seedCats.has(c));
        return sameAuthor || sameGenre;
      });
      if (related.length >= 3) {
        shelves.push({
          id: `because-${lastFav.id}`,
          title: `Porque você leu ${lastFav.book.title}`,
          subtitle: "Mais como esse na sua biblioteca",
          items: related.slice(0, 20),
          priority: 30,
        });
      }
    }

    return shelves.sort((a, b) => a.priority - b.priority);
  }, [items]);
}
