import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { UserBook } from "@/types/book";
import { BookCover } from "./BookCover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Home as HomeIcon, ArrowDownAZ, BookOpen, Tag, User } from "lucide-react";
import { localizeCategory } from "@/lib/category-i18n";

type Group = "author" | "category" | "status" | "az";
type ReadFilter = "all" | "read" | "unread";

const GROUP_LABEL: Record<Group, string> = {
  author: "Por autor",
  category: "Por categoria",
  status: "Por status",
  az: "Alfabético",
};

const STATUS_LABEL: Record<string, string> = {
  reading: "Lendo agora",
  read: "Lidos",
  wishlist: "Quero ler",
  not_read: "No acervo",
};

interface Props {
  items: UserBook[];
}

/**
 * MODO CASA — visual simples tipo prateleira física.
 * Sem IA, sem recomendações, sem trilha sonora. Só sua coleção.
 *
 * - Agrupamento: autor, categoria, status, A–Z
 * - Filtros mínimos: autor, gênero, lidos/não lidos
 * - Cada "prateleira" tem fundo de madeira e linha inferior (estilo estante)
 */
export function HomeMode({ items }: Props) {
  const [group, setGroup] = useState<Group>("author");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [author, setAuthor] = useState<string>("all");
  const [genre, setGenre] = useState<string>("all");

  const authors = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => i.book?.authors?.forEach((a) => a && s.add(a)));
    return Array.from(s).sort();
  }, [items]);

  const genres = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => i.book?.categories?.forEach((c) => c && s.add(c)));
    return Array.from(s).sort();
  }, [items]);

  const filtered = useMemo(() => {
    let r = items;
    if (readFilter === "read") r = r.filter((i) => i.status === "read");
    else if (readFilter === "unread") r = r.filter((i) => i.status !== "read");
    if (author !== "all") r = r.filter((i) => i.book?.authors?.includes(author));
    if (genre !== "all") r = r.filter((i) => i.book?.categories?.includes(genre));
    return r;
  }, [items, readFilter, author, genre]);

  const shelves = useMemo(() => {
    const map = new Map<string, UserBook[]>();
    const push = (key: string, ub: UserBook) => {
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ub);
    };

    if (group === "author") {
      filtered.forEach((ub) => {
        const a = ub.book?.authors?.[0] || "Sem autor";
        push(a, ub);
      });
    } else if (group === "category") {
      filtered.forEach((ub) => {
        const cats = ub.book?.categories ?? [];
        if (cats.length === 0) push("Sem categoria", ub);
        else cats.slice(0, 1).forEach((c) => push(c || "Sem categoria", ub));
      });
    } else if (group === "status") {
      filtered.forEach((ub) => push(STATUS_LABEL[ub.status] || ub.status, ub));
    } else {
      // A–Z: bucketiza por inicial
      filtered.forEach((ub) => {
        const t = (ub.book?.title || "?").trim();
        const ch = t[0]?.toUpperCase();
        const key = ch && /[A-Z]/.test(ch) ? ch : "#";
        push(key, ub);
      });
    }

    // Ordena livros dentro de cada prateleira pelo título
    map.forEach((list) =>
      list.sort((a, b) => (a.book?.title || "").localeCompare(b.book?.title || "")),
    );
    // Ordena prateleiras alfabeticamente
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, group]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Controles minimalistas */}
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl bg-card/40 border border-border/40">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider font-medium">
          <HomeIcon className="w-3.5 h-3.5" /> Modo Casa
        </div>
        <div className="flex-1" />
        <Tabs value={readFilter} onValueChange={(v) => setReadFilter(v as ReadFilter)}>
          <TabsList className="h-8">
            <TabsTrigger value="all" className="text-xs h-6">Todos</TabsTrigger>
            <TabsTrigger value="read" className="text-xs h-6">Lidos</TabsTrigger>
            <TabsTrigger value="unread" className="text-xs h-6">Não lidos</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={author} onValueChange={setAuthor}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <User className="w-3 h-3 mr-1" />
            <SelectValue placeholder="Autor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos autores</SelectItem>
            {authors.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={genre} onValueChange={setGenre}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <Tag className="w-3 h-3 mr-1" />
            <SelectValue placeholder="Gênero" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos gêneros</SelectItem>
            {genres.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={group} onValueChange={(v) => setGroup(v as Group)}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <ArrowDownAZ className="w-3 h-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(GROUP_LABEL) as Group[]).map((g) => (
              <SelectItem key={g} value={g}>{GROUP_LABEL[g]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Estante */}
      {shelves.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">Nenhum livro com esses filtros.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {shelves.map(([label, books]) => (
            <PhysicalShelf key={label} label={label} group={group} books={books} />
          ))}
        </div>
      )}
    </div>
  );
}

function PhysicalShelf({ label, group, books }: { label: string; group: Group; books: UserBook[] }) {
  const shelfId = `home:${group}:${label}`;
  const bookIds = books.map((ub) => ub.book?.id).filter(Boolean) as string[];
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2 px-1">
        <h3 className="font-display text-lg font-semibold">{label}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {books.length} {books.length === 1 ? "livro" : "livros"}
        </span>
      </div>
      <div className="relative">
        {/* Livros enfileirados */}
        <div className="flex flex-wrap gap-3 md:gap-4 px-2 pt-2 pb-4">
          {books.map((ub) =>
            ub.book ? (
              <Link
                key={ub.id}
                to={`/livro/${ub.book.id}`}
                state={{ shelfId, shelfTitle: label, bookIds }}
                className="group/book block w-[88px] md:w-[104px] hover:z-10"
                title={ub.book.title}
              >
                <BookCover
                  book={ub.book}
                  size="sm"
                  className="!w-full !h-[132px] md:!h-[156px] transition-transform duration-200 group-hover/book:-translate-y-1.5 group-hover/book:shadow-elevated"
                />
                <p className="mt-1.5 text-[11px] leading-tight line-clamp-2 text-center text-muted-foreground group-hover/book:text-foreground transition-colors">
                  {ub.book.title}
                </p>
              </Link>
            ) : null,
          )}
        </div>
        {/* Linha de madeira (prateleira física) */}
        <div
          className="h-2 rounded-b-md"
          style={{ background: "var(--shelf-wood)", boxShadow: "var(--shadow-shelf)" }}
        />
      </div>
    </section>
  );
}
