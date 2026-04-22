import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BookCover } from "@/components/books/BookCover";
import { BookOpen, Crown, Loader2, Trash2, X, Settings2 } from "lucide-react";
import { toast } from "sonner";

interface Nomination {
  id: string;
  book_id: string;
  votes_count: number;
  book?: { id: string; title: string; authors: string[]; cover_url: string | null };
}

interface CurrentBook {
  id: string;
  title: string;
  authors: string[];
  cover_url: string | null;
}

interface Props {
  clubId: string;
}

/** Painel de gestão de livros — visível só para o admin dentro do AdminPanel. */
export function ClubBooksAdmin({ clubId }: Props) {
  const [current, setCurrent] = useState<CurrentBook | null>(null);
  const [list, setList] = useState<Nomination[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: club }, { data: noms }] = await Promise.all([
      supabase
        .from("book_clubs")
        .select("current_book_id, current_book:books(id,title,authors,cover_url)")
        .eq("id", clubId)
        .maybeSingle(),
      supabase
        .from("club_book_nominations")
        .select("id,book_id,votes_count, book:books(id,title,authors,cover_url)")
        .eq("club_id", clubId)
        .order("votes_count", { ascending: false }),
    ]);
    setCurrent((club as any)?.current_book ?? null);
    setList((noms || []) as any);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  const setAsCurrent = async (bookId: string) => {
    setSaving(true);
    const { error } = await supabase
      .from("book_clubs")
      .update({ current_book_id: bookId })
      .eq("id", clubId);
    setSaving(false);
    if (error) {
      toast.error("Erro ao definir livro do mês");
      return;
    }
    toast.success("Livro do mês atualizado");
    load();
  };

  const clearCurrent = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("book_clubs")
      .update({ current_book_id: null })
      .eq("id", clubId);
    setSaving(false);
    if (error) {
      toast.error("Erro ao remover");
      return;
    }
    toast.success("Livro do mês removido");
    setCurrent(null);
  };

  const removeNomination = async (id: string) => {
    const prev = list;
    setList((arr) => arr.filter((n) => n.id !== id));
    const { error } = await supabase.from("club_book_nominations").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao remover indicação");
      setList(prev);
    } else {
      toast.success("Indicação removida");
    }
  };

  return (
    <section className="space-y-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
        <Settings2 className="w-3 h-3" /> Gerenciar livros
      </p>

      {/* Livro do mês atual */}
      {loading ? (
        <div className="py-4 flex justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
        </div>
      ) : current ? (
        <div className="rounded-xl bg-primary/10 border border-primary/30 p-3 flex items-center gap-3">
          <BookCover book={current} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-primary font-bold flex items-center gap-1">
              <Crown className="w-3 h-3" /> Livro do mês
            </p>
            <Link
              to={`/livro/${current.id}`}
              className="text-sm font-semibold truncate hover:text-primary transition-colors block"
            >
              {current.title}
            </Link>
            {current.authors?.length > 0 && (
              <p className="text-[11px] text-muted-foreground truncate">
                {current.authors.join(", ")}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearCurrent}
            disabled={saving}
            className="text-destructive hover:bg-destructive/10 h-8"
            aria-label="Remover livro do mês"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          Nenhum livro do mês definido. Promova uma indicação abaixo.
        </p>
      )}

      {/* Indicações */}
      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
          Indicações ({list.length})
        </p>
        {list.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">
            Nenhuma indicação ainda.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {list.map((n) => {
              const isCurrent = current?.id === n.book_id;
              return (
                <li
                  key={n.id}
                  className="flex items-center gap-2 p-2 rounded-lg bg-card/40 border border-border/30"
                >
                  {n.book && <BookCover book={n.book} size="sm" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{n.book?.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {n.votes_count} {n.votes_count === 1 ? "voto" : "votos"}
                    </p>
                  </div>
                  {!isCurrent && (
                    <Button
                      size="sm"
                      variant="hero"
                      className="h-7 text-xs gap-1"
                      onClick={() => setAsCurrent(n.book_id)}
                      disabled={saving}
                    >
                      <BookOpen className="w-3 h-3" /> Definir
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                    onClick={() => removeNomination(n.id)}
                    aria-label="Remover indicação"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
