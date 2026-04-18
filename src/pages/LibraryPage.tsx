import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { UserBook, BookStatus, STATUS_LABEL } from "@/types/book";
import { BookCard } from "@/components/books/BookCard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Library as LibraryIcon } from "lucide-react";

const STATUSES: (BookStatus | "all")[] = ["all", "reading", "read", "not_read", "wishlist"];
const SORTS = [
  { v: "recent", label: "Mais recentes" },
  { v: "rating", label: "Melhor avaliados" },
  { v: "az", label: "A–Z" },
  { v: "last_read", label: "Últimos lidos" },
];

export default function LibraryPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<UserBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<BookStatus | "all">("all");
  const [author, setAuthor] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [sort, setSort] = useState("recent");

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("user_books")
        .select("*, book:books(*)")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      setItems((data as UserBook[]) || []);
      setLoading(false);
    })();
  }, [user]);

  const authors = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => i.book?.authors?.forEach((a) => s.add(a)));
    return Array.from(s).sort();
  }, [items]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => i.book?.categories?.forEach((c) => s.add(c)));
    return Array.from(s).sort();
  }, [items]);

  const filtered = useMemo(() => {
    let r = items;
    if (filterStatus !== "all") r = r.filter((i) => i.status === filterStatus);
    if (author !== "all") r = r.filter((i) => i.book?.authors?.includes(author));
    if (category !== "all") r = r.filter((i) => i.book?.categories?.includes(category));
    switch (sort) {
      case "rating": r = [...r].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)); break;
      case "az": r = [...r].sort((a, b) => (a.book?.title || "").localeCompare(b.book?.title || "")); break;
      case "last_read":
        r = [...r].sort((a, b) => new Date(b.finished_at || b.updated_at).getTime() - new Date(a.finished_at || a.updated_at).getTime()); break;
    }
    return r;
  }, [items, filterStatus, author, category, sort]);

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 pb-16 max-w-7xl mx-auto">
        <header className="mb-6">
          <h1 className="font-display text-3xl md:text-4xl font-bold flex items-center gap-3">
            <LibraryIcon className="w-7 h-7 text-primary" /> Minha biblioteca
          </h1>
          <p className="text-muted-foreground mt-1">{items.length} {items.length === 1 ? "livro" : "livros"} no acervo</p>
        </header>

        <Tabs value={filterStatus} onValueChange={(v) => setFilterStatus(v as BookStatus | "all")}>
          <TabsList className="mb-4 flex-wrap h-auto">
            {STATUSES.map((s) => (
              <TabsTrigger key={s} value={s}>
                {s === "all" ? "Tudo" : STATUS_LABEL[s as BookStatus]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap gap-3 mb-8">
          <Select value={author} onValueChange={setAuthor}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Autor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos autores</SelectItem>
              {authors.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Ordenar" /></SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => <SelectItem key={s.v} value={s.v}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-5 gap-y-8">
            {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="w-28 h-44 mx-auto rounded-md" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-5 gap-y-8">
            {filtered.map((ub) => ub.book && <BookCard key={ub.id} book={ub.book} />)}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-20 max-w-md mx-auto">
      <div className="w-20 h-20 rounded-2xl bg-gradient-spine border border-border mx-auto mb-5 flex items-center justify-center shadow-book">
        <LibraryIcon className="w-9 h-9 text-primary/60" />
      </div>
      <h2 className="font-display text-2xl font-semibold mb-2">Sua biblioteca está vazia</h2>
      <p className="text-muted-foreground">Busque um livro e adicione à sua coleção pessoal.</p>
    </div>
  );
}
