import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CACHE } from "@/lib/query-client";
import { CinematicShelf, ShelfItem } from "./CinematicShelf";
import { BookCover } from "./BookCover";
import { dedupeByIsbn, bookDedupeKey } from "@/lib/dedupe";
import type { Book } from "@/types/book";

interface Props {
  book: Book;
}

/**
 * Sugestões no fim da página do livro:
 *  - Mais do mesmo autor
 *  - Mesma série / continuação
 *  - Livros similares (mesma categoria)
 *
 * Consulta o banco interno (tabela `books` + `series`). Sem chamadas a APIs
 * externas — leve, em cache CATALOG. Cada prateleira deduplica por ISBN e
 * exclui o próprio livro atual.
 */
export function BookSuggestions({ book }: Props) {
  const { data: sameAuthor = [] } = useSameAuthor(book);
  const { data: sameSeries = [] } = useSameSeries(book);
  const { data: similar = [] } = useSimilarByCategory(book);

  const exclude = new Set([bookDedupeKey(book)].filter(Boolean) as string[]);
  const filterOut = (list: Book[]) =>
    dedupeByIsbn(list, (b) => b).filter((b) => {
      const k = bookDedupeKey(b);
      return !k || !exclude.has(k);
    });

  const seriesShelf = filterOut(sameSeries);
  const authorShelf = filterOut(sameAuthor).slice(0, 18);
  const similarShelf = filterOut(similar).slice(0, 18);

  if (seriesShelf.length === 0 && authorShelf.length === 0 && similarShelf.length === 0) {
    return null;
  }

  return (
    <div className="mt-10 space-y-2">
      {seriesShelf.length > 0 && (
        <CinematicShelf
          title={book.series_id ? "Outros volumes da série" : "Continuação / mesma série"}
          subtitle="Encontre o próximo capítulo"
        >
          {seriesShelf.map((b) => (
            <ShelfItem key={`ser-${b.id}`} width="wide">
              <SuggestionCard book={b} />
            </ShelfItem>
          ))}
        </CinematicShelf>
      )}

      {authorShelf.length > 0 && (
        <CinematicShelf
          title={`Mais de ${book.authors?.[0] ?? "este autor"}`}
          subtitle="Outros livros pelo mesmo autor"
        >
          {authorShelf.map((b) => (
            <ShelfItem key={`au-${b.id}`} width="wide">
              <SuggestionCard book={b} />
            </ShelfItem>
          ))}
        </CinematicShelf>
      )}

      {similarShelf.length > 0 && (
        <CinematicShelf
          title="Livros similares"
          subtitle="Quem leu este também curte"
        >
          {similarShelf.map((b) => (
            <ShelfItem key={`sim-${b.id}`} width="wide">
              <SuggestionCard book={b} />
            </ShelfItem>
          ))}
        </CinematicShelf>
      )}
    </div>
  );
}

function SuggestionCard({ book }: { book: Book }) {
  return (
    <Link
      to={`/livro/${book.id}`}
      className="group/sug block animate-fade-in"
      aria-label={book.title}
    >
      <BookCover
        book={book}
        size="lg"
        interactive={false}
        className="w-full h-auto aspect-[2/3] group-hover/sug:shadow-elevated transition-all duration-300 group-hover/sug:scale-[1.03]"
      />
      <div className="mt-2 px-0.5">
        <p className="font-display text-sm font-semibold leading-tight line-clamp-2 group-hover/sug:text-primary transition-colors">
          {book.title}
        </p>
        {book.authors?.[0] && (
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
            {book.authors[0]}
          </p>
        )}
      </div>
    </Link>
  );
}

/* -------------------- queries -------------------- */

function useSameAuthor(book: Book) {
  const author = book.authors?.[0];
  return useQuery<Book[]>({
    queryKey: ["sug", "author", author ?? "_", book.id],
    enabled: !!author,
    ...CACHE.CATALOG,
    queryFn: async () => {
      if (!author) return [];
      const { data } = await supabase
        .from("books")
        .select("*")
        .contains("authors", [author])
        .neq("id", book.id)
        .limit(30);
      return (data as Book[]) || [];
    },
  });
}

function useSameSeries(book: Book) {
  return useQuery<Book[]>({
    queryKey: ["sug", "series", book.series_id ?? "_", book.id],
    enabled: !!book.series_id,
    ...CACHE.CATALOG,
    queryFn: async () => {
      if (!book.series_id) return [];
      const { data } = await supabase
        .from("books")
        .select("*")
        .eq("series_id", book.series_id)
        .neq("id", book.id)
        .order("volume_number", { ascending: true, nullsFirst: false })
        .limit(30);
      return (data as Book[]) || [];
    },
  });
}

function useSimilarByCategory(book: Book) {
  const cats = (book.categories || []).filter(Boolean).slice(0, 3);
  return useQuery<Book[]>({
    queryKey: ["sug", "cats", cats.join("|"), book.id],
    enabled: cats.length > 0,
    ...CACHE.CATALOG,
    queryFn: async () => {
      if (cats.length === 0) return [];
      const { data } = await supabase
        .from("books")
        .select("*")
        .overlaps("categories", cats)
        .neq("id", book.id)
        .limit(40);
      return (data as Book[]) || [];
    },
  });
}
