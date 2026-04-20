import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { BookCover } from "@/components/books/BookCover";
import { Vote, Plus, Crown, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { searchBooksGet } from "@/lib/books-api";

interface Nomination {
  id: string;
  book_id: string;
  nominated_by: string;
  votes_count: number;
  book?: any;
  i_voted?: boolean;
}

interface Props {
  clubId: string;
  isOwner: boolean;
  isMember: boolean;
  onCrown?: (bookId: string) => void;
}

export function ClubBookOfTheMonth({ clubId, isOwner, isMember, onCrown }: Props) {
  const { user } = useAuth();
  const [list, setList] = useState<Nomination[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: noms } = await supabase
      .from("club_book_nominations")
      .select("*, book:books(id,title,authors,cover_url)")
      .eq("club_id", clubId)
      .order("votes_count", { ascending: false });
    const ids = (noms || []).map((n: any) => n.id);
    const { data: myVotes } = user && ids.length
      ? await supabase.from("club_book_votes").select("nomination_id").eq("user_id", user.id).in("nomination_id", ids)
      : { data: [] as any[] };
    const voted = new Set((myVotes || []).map((v: any) => v.nomination_id));
    setList((noms || []).map((n: any) => ({ ...n, i_voted: voted.has(n.id) })));
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, user]);

  const toggleVote = async (n: Nomination) => {
    if (!user || !isMember) return toast.error("Entre no clube para votar");
    const wasVoted = n.i_voted;
    setList((arr) => arr.map((x) => x.id === n.id
      ? { ...x, i_voted: !wasVoted, votes_count: x.votes_count + (wasVoted ? -1 : 1) }
      : x).sort((a, b) => b.votes_count - a.votes_count));
    const { error } = wasVoted
      ? await supabase.from("club_book_votes").delete().eq("nomination_id", n.id).eq("user_id", user.id)
      : await supabase.from("club_book_votes").insert({ nomination_id: n.id, user_id: user.id });
    if (error) {
      toast.error("Erro ao votar");
      load();
    }
  };

  const doSearch = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      const r = await searchBooksGet(query.trim());
      setResults((r || []).slice(0, 8));
    } catch {
      toast.error("Erro na busca");
    }
    setSearching(false);
  };

  const nominate = async (book: any) => {
    if (!user) return;
    setAdding(true);
    // Save book first
    let bookId = book.id;
    if (!bookId || book.id?.startsWith?.("ext-")) {
      const payload = {
        title: book.title,
        authors: book.authors || [],
        subtitle: book.subtitle || null,
        cover_url: book.cover_url || null,
        isbn_13: book.isbn_13 || null,
        isbn_10: book.isbn_10 || null,
        publisher: book.publisher || null,
        published_year: book.published_year || null,
        page_count: book.page_count || null,
        description: book.description || null,
        categories: book.categories || [],
        source: book.source || null,
        source_id: book.source_id || null,
      };
      const { data, error } = await supabase.from("books").insert(payload).select("id").single();
      if (error) {
        setAdding(false);
        toast.error("Erro ao salvar livro");
        return;
      }
      bookId = data.id;
    }
    const { error } = await supabase
      .from("club_book_nominations")
      .insert({ club_id: clubId, book_id: bookId, nominated_by: user.id });
    setAdding(false);
    if (error) {
      if (error.code === "23505") toast.error("Esse livro já foi indicado");
      else toast.error("Erro ao indicar");
      return;
    }
    toast.success("Livro indicado!");
    setOpen(false);
    setQuery("");
    setResults([]);
    load();
  };

  const crownAsCurrent = async (bookId: string) => {
    if (!isOwner) return;
    const { error } = await supabase.from("book_clubs").update({ current_book_id: bookId }).eq("id", clubId);
    if (error) toast.error("Erro ao definir livro do mês");
    else {
      toast.success("Livro do mês definido!");
      onCrown?.(bookId);
    }
  };

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg font-semibold flex items-center gap-2">
          <Vote className="w-4 h-4 text-primary" /> Próximo livro
        </h3>
        {isMember && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Indicar</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Indicar um livro</DialogTitle>
                <DialogDescription>Busque e proponha um livro para o próximo mês.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar título ou autor..."
                    onKeyDown={(e) => e.key === "Enter" && doSearch()}
                  />
                  <Button onClick={doSearch} variant="hero" disabled={searching}>
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buscar"}
                  </Button>
                </div>
                {results.length > 0 && (
                  <ul className="space-y-2 max-h-[400px] overflow-y-auto">
                    {results.map((b, i) => (
                      <li key={b.id || i}>
                        <button
                          onClick={() => nominate(b)}
                          disabled={adding}
                          className="w-full flex gap-3 items-center p-3 rounded-xl hover:bg-muted/50 text-left transition"
                        >
                          <BookCover book={b} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">{b.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{(b.authors || []).join(", ")}</p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground italic text-center py-4">
          Ninguém indicou um livro ainda. Seja a primeira pessoa.
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((n, i) => (
            <li
              key={n.id}
              className={cn(
                "flex items-center gap-3 p-2.5 rounded-xl transition-colors",
                i === 0 && n.votes_count > 0 ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/40",
              )}
            >
              {i === 0 && n.votes_count > 0 && <Crown className="w-4 h-4 text-primary shrink-0" />}
              {n.book && <BookCover book={n.book} size="sm" />}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{n.book?.title}</p>
                <p className="text-xs text-muted-foreground truncate">{(n.book?.authors || []).join(", ")}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <Button
                  size="sm"
                  variant={n.i_voted ? "hero" : "outline"}
                  onClick={() => toggleVote(n)}
                  className="gap-1.5 h-8"
                  disabled={!isMember}
                >
                  <Vote className="w-3 h-3" />
                  <span className="tabular-nums text-xs">{n.votes_count}</span>
                </Button>
                {isOwner && i === 0 && n.votes_count > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => crownAsCurrent(n.book_id)} className="h-6 text-[10px] gap-1">
                    <Check className="w-3 h-3" /> Definir
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
