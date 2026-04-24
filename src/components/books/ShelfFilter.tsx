import { useMemo } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UserBook } from "@/types/book";
import type { SmartShelf } from "@/hooks/useSmartShelves";
import { localizeCategory } from "@/lib/category-i18n";

export type ShelfFilterValue =
  | { kind: "none" }
  | { kind: "genre"; value: string }
  | { kind: "author"; value: string }
  | { kind: "category"; value: string };

interface Props {
  items: UserBook[];
  value: ShelfFilterValue;
  onChange: (v: ShelfFilterValue) => void;
}

const KIND_LABEL: Record<Exclude<ShelfFilterValue["kind"], "none">, string> = {
  genre: "Gênero",
  author: "Autor",
  category: "Categoria",
};

/**
 * Filtra prateleiras dinâmicas por gênero, autor ou categoria.
 * Atualização instantânea — sem reload, sem rede.
 *
 * `genre` e `category` ambos lêem `book.categories` (no schema atual,
 * categorias e gêneros são o mesmo campo). Mantemos rótulos separados
 * para clareza de UX.
 */
export function ShelfFilter({ items, value, onChange }: Props) {
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

  const setKind = (k: ShelfFilterValue["kind"]) => {
    if (k === "none") onChange({ kind: "none" });
    else onChange({ kind: k as any, value: "" });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mb-5 p-3 rounded-xl bg-card/40 border border-border/40 animate-fade-in">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider font-medium text-muted-foreground">
        <Filter className="w-3.5 h-3.5" /> Filtrar prateleiras
      </div>

      <Select value={value.kind} onValueChange={(v) => setKind(v as any)}>
        <SelectTrigger className="h-8 w-[140px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Tudo</SelectItem>
          <SelectItem value="genre">Por gênero</SelectItem>
          <SelectItem value="author">Por autor</SelectItem>
          <SelectItem value="category">Por categoria</SelectItem>
        </SelectContent>
      </Select>

      {value.kind === "author" && (
        <Select value={value.value || ""} onValueChange={(v) => onChange({ kind: "author", value: v })}>
          <SelectTrigger className="h-8 w-[200px] text-xs">
            <SelectValue placeholder="Escolher autor…" />
          </SelectTrigger>
          <SelectContent>
            {authors.length === 0 && <SelectItem value="__none" disabled>Nenhum autor</SelectItem>}
            {authors.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {(value.kind === "genre" || value.kind === "category") && (
        <Select
          value={value.value || ""}
          onValueChange={(v) => onChange({ kind: value.kind, value: v } as any)}
        >
          <SelectTrigger className="h-8 w-[200px] text-xs">
            <SelectValue placeholder={`Escolher ${KIND_LABEL[value.kind].toLowerCase()}…`} />
          </SelectTrigger>
          <SelectContent>
            {genres.length === 0 && <SelectItem value="__none" disabled>Nenhum gênero</SelectItem>}
            {genres.map((g) => <SelectItem key={g} value={g}>{localizeCategory(g)}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {value.kind !== "none" && value.value && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ kind: "none" })}
          className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="w-3 h-3" /> Limpar
        </Button>
      )}
    </div>
  );
}

/**
 * Aplica o filtro às prateleiras geradas pelo `useSmartShelves`.
 * - genre/category: mantém prateleiras cujos itens contenham a categoria
 * - author:         mantém prateleiras cujos itens contenham o autor
 * - none:           devolve as prateleiras como vieram
 *
 * Os itens dentro de cada prateleira também são filtrados — assim você vê
 * "Continue lendo (de Drama)" só com livros de Drama.
 */
export function applyShelfFilter(shelves: SmartShelf[], f: ShelfFilterValue): SmartShelf[] {
  if (f.kind === "none" || !f.value) return shelves;
  return shelves
    .map((s) => {
      const items = s.items.filter((ub) => {
        const b = ub.book;
        if (!b) return false;
        if (f.kind === "author") return b.authors?.includes(f.value);
        return (b.categories ?? []).includes(f.value);
      });
      return { ...s, items };
    })
    .filter((s) => s.items.length > 0);
}
