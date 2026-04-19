import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, ArrowRightLeft, CalendarClock, Users, BookOpen, Check } from "lucide-react";
import { toast } from "sonner";
import { Book } from "@/types/book";
import { BookCover } from "@/components/books/BookCover";
import { Link } from "react-router-dom";
import { ListRowSkeleton, StatsRowSkeleton } from "@/components/ui/skeletons";
import { EmptyState } from "@/components/ui/empty-state";

type Loan = {
  id: string;
  book_id: string;
  borrower_name: string;
  lent_at: string;
  due_at: string | null;
  returned_at: string | null;
  status: "lent" | "returned" | "overdue";
  notes: string | null;
  book?: Book;
};

export default function LoansPage() {
  const { user } = useAuth();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [myBooks, setMyBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "lent" | "returned" | "overdue">("all");

  // form
  const [bookId, setBookId] = useState<string>("");
  const [borrower, setBorrower] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("loans")
      .select("*, book:books(*)")
      .eq("user_id", user.id)
      .order("lent_at", { ascending: false });
    // mark overdue
    const today = new Date().toISOString().slice(0, 10);
    const list = (data as Loan[] | null) || [];
    for (const l of list) {
      if (l.status === "lent" && l.due_at && l.due_at < today) {
        l.status = "overdue";
      }
    }
    setLoans(list);
    const { data: ub } = await supabase
      .from("user_books").select("book:books(*)").eq("user_id", user.id);
    setMyBooks((ub || []).map((r: any) => r.book).filter(Boolean));
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !bookId || !borrower.trim()) {
      toast.error("Preencha livro e nome de quem pegou emprestado");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("loans").insert({
      user_id: user.id,
      book_id: bookId,
      borrower_name: borrower.trim(),
      due_at: dueAt || null,
      notes: notes.trim() || null,
      status: "lent",
    });
    setSaving(false);
    if (error) { toast.error("Erro ao registrar empréstimo"); return; }
    toast.success("Empréstimo registrado");
    setOpen(false);
    setBookId(""); setBorrower(""); setDueAt(""); setNotes("");
    load();
  };

  const markReturned = async (id: string) => {
    const { error } = await supabase
      .from("loans")
      .update({ status: "returned", returned_at: new Date().toISOString().slice(0, 10) })
      .eq("id", id);
    if (error) { toast.error("Erro"); return; }
    toast.success("Marcado como devolvido");
    load();
  };

  const filtered = loans.filter((l) => filter === "all" ? true : l.status === filter);

  const stats = {
    lent: loans.filter((l) => l.status === "lent").length,
    overdue: loans.filter((l) => l.status === "overdue").length,
    returned: loans.filter((l) => l.status === "returned").length,
  };

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 pb-16 max-w-5xl mx-auto">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4 animate-fade-in">
          <div>
            <p className="text-sm text-primary font-medium mb-2 flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4" /> Empréstimos
            </p>
            <h1 className="font-display text-3xl md:text-5xl font-bold leading-tight">
              Quem está com <span className="text-gradient-gold italic">seus livros?</span>
            </h1>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="hero" size="lg" className="gap-2"><Plus className="w-4 h-4" /> Novo empréstimo</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Registrar empréstimo</DialogTitle></DialogHeader>
              <form onSubmit={create} className="space-y-4">
                <div>
                  <Label className="mb-1.5 block">Livro</Label>
                  <Select value={bookId} onValueChange={setBookId}>
                    <SelectTrigger><SelectValue placeholder="Escolha da sua biblioteca" /></SelectTrigger>
                    <SelectContent>
                      {myBooks.length === 0 && <div className="px-3 py-4 text-sm text-muted-foreground">Adicione livros à biblioteca primeiro.</div>}
                      {myBooks.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1.5 block">Para quem</Label>
                  <Input value={borrower} onChange={(e) => setBorrower(e.target.value)} placeholder="Nome da pessoa" />
                </div>
                <div>
                  <Label className="mb-1.5 block">Devolver até (opcional)</Label>
                  <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1.5 block">Notas</Label>
                  <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Algo a lembrar..." />
                </div>
                <DialogFooter>
                  <Button type="submit" variant="hero" disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Registrar"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </header>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatCard label="Emprestados" value={stats.lent} icon={<Users className="w-4 h-4" />} />
          <StatCard label="Atrasados" value={stats.overdue} icon={<CalendarClock className="w-4 h-4" />} accent="destructive" />
          <StatCard label="Devolvidos" value={stats.returned} icon={<Check className="w-4 h-4" />} accent="success" />
        </div>

        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          {[
            { v: "all", l: "Todos" },
            { v: "lent", l: "Emprestados" },
            { v: "overdue", l: "Atrasados" },
            { v: "returned", l: "Devolvidos" },
          ].map((f) => (
            <Button key={f.v} variant={filter === f.v ? "hero" : "outline"} size="sm" onClick={() => setFilter(f.v as any)}>{f.l}</Button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center">
            <BookOpen className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhum empréstimo {filter !== "all" ? "neste filtro" : "registrado"}.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((l) => (
              <li key={l.id} className="glass rounded-xl p-4 flex gap-4 items-center animate-fade-in">
                {l.book && (
                  <Link to={`/livro/${l.book.id}`} className="shrink-0">
                    <BookCover book={l.book} size="sm" />
                  </Link>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-display font-semibold truncate">{l.book?.title || "Livro"}</p>
                  <p className="text-sm text-muted-foreground truncate">com <span className="text-foreground">{l.borrower_name}</span></p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Desde {new Date(l.lent_at).toLocaleDateString("pt-BR")}
                    {l.due_at && ` · até ${new Date(l.due_at).toLocaleDateString("pt-BR")}`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusPill status={l.status} />
                  {l.status !== "returned" && (
                    <Button size="sm" variant="outline" onClick={() => markReturned(l.id)}>Devolvido</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

function StatCard({ label, value, icon, accent }: { label: string; value: number; icon: React.ReactNode; accent?: "destructive" | "success" }) {
  const color = accent === "destructive" ? "text-destructive" : accent === "success" ? "text-status-read" : "text-primary";
  return (
    <div className="glass rounded-xl p-4">
      <div className={`flex items-center gap-2 text-xs uppercase tracking-wide ${color}`}>{icon}{label}</div>
      <p className="font-display text-3xl font-bold mt-2">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: Loan["status"] }) {
  const map = {
    lent: { label: "Emprestado", cls: "bg-primary/15 text-primary border-primary/30" },
    returned: { label: "Devolvido", cls: "bg-status-read/15 text-status-read border-status-read/30" },
    overdue: { label: "Atrasado", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  } as const;
  const m = map[status];
  return <Badge variant="outline" className={m.cls}>{m.label}</Badge>;
}
