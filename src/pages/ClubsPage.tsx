import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Users, Plus, Loader2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { BookCover } from "@/components/books/BookCover";

export default function ClubsPage() {
  const { user } = useAuth();
  const [clubs, setClubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("book_clubs")
      .select("*, current_book:books(id,title,authors,cover_url)")
      .order("updated_at", { ascending: false })
      .limit(50);

    const ids = (data || []).map((c: any) => c.id);
    const [{ data: counts }, { data: mine }] = await Promise.all([
      ids.length ? supabase.from("club_members").select("club_id").in("club_id", ids) : Promise.resolve({ data: [] as any[] }),
      user && ids.length ? supabase.from("club_members").select("club_id").eq("user_id", user.id).in("club_id", ids) : Promise.resolve({ data: [] as any[] }),
    ]);
    const countMap: Record<string, number> = {};
    (counts || []).forEach((c: any) => { countMap[c.club_id] = (countMap[c.club_id] || 0) + 1; });
    const mineSet = new Set((mine || []).map((m: any) => m.club_id));

    setClubs((data || []).map((c: any) => ({ ...c, member_count: countMap[c.id] || 0, i_am_member: mineSet.has(c.id) })));
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const create = async () => {
    if (!user || name.trim().length < 2) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("book_clubs")
      .insert({ owner_id: user.id, name: name.trim(), description: desc.trim() || null })
      .select().single();
    if (error) toast.error("Erro ao criar clube");
    else {
      toast.success("Clube criado!");
      setOpen(false);
      setName(""); setDesc("");
      load();
    }
    setCreating(false);
  };

  const join = async (clubId: string) => {
    if (!user) return;
    const { error } = await supabase.from("club_members").insert({ club_id: clubId, user_id: user.id });
    if (error) toast.error("Erro ao entrar");
    else { toast.success("Você entrou no clube"); load(); }
  };

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 pb-16 max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-8 animate-fade-in">
          <div>
            <h1 className="font-display text-4xl font-bold text-gradient-gold flex items-center gap-3">
              <Users className="w-8 h-8 text-primary" /> Clubes
            </h1>
            <p className="text-muted-foreground mt-1">Encontre e crie clubes de leitura</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="hero" className="gap-2"><Plus className="w-4 h-4" /> Criar</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo clube</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="name">Nome</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
                </div>
                <div>
                  <Label htmlFor="desc">Descrição</Label>
                  <Textarea id="desc" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
                </div>
                <Button variant="hero" onClick={create} disabled={creating || name.trim().length < 2} className="w-full">
                  Criar clube
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </header>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : clubs.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhum clube ainda. Crie o primeiro!</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {clubs.map((c) => (
              <article key={c.id} className="glass rounded-2xl p-5 flex flex-col">
                <Link to={`/clubes/${c.id}`} className="flex-1">
                  <h2 className="font-display text-lg font-semibold leading-tight hover:text-primary transition-colors">{c.name}</h2>
                  {c.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{c.description}</p>}
                  {c.current_book && (
                    <div className="flex gap-2 mt-3 items-center">
                      <BookCover book={c.current_book} size="sm" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Lendo</p>
                        <p className="text-sm font-medium truncate">{c.current_book.title}</p>
                      </div>
                    </div>
                  )}
                </Link>
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/40">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" /> {c.member_count} {c.member_count === 1 ? "membro" : "membros"}
                  </span>
                  {c.i_am_member ? (
                    <Link to={`/clubes/${c.id}`}>
                      <Button size="sm" variant="outline">Abrir</Button>
                    </Link>
                  ) : (
                    <Button size="sm" variant="hero" onClick={() => join(c.id)}>Entrar</Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
