import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Users, Plus, Loader2, Lock, Globe2, Mail, Check, X } from "lucide-react";
import { toast } from "sonner";
import { BookCover } from "@/components/books/BookCover";
import { useMyInvitations, useAcceptInvitation, useDeclineInvitation } from "@/hooks/useClubAccess";

export default function ClubsPage() {
  const { user } = useAuth();
  const [clubs, setClubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);

  const myInvites = useMyInvitations(user?.id);
  const acceptInv = useAcceptInvitation(user?.id);
  const declineInv = useDeclineInvitation(user?.id);

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
    const { error } = await supabase
      .from("book_clubs")
      .insert({ owner_id: user.id, name: name.trim(), description: desc.trim() || null, is_public: isPublic })
      .select().single();
    if (error) toast.error("Erro ao criar clube");
    else {
      toast.success(isPublic ? "Clube público criado!" : "Clube privado criado! Convide leitores manualmente.");
      setOpen(false);
      setName(""); setDesc(""); setIsPublic(true);
      load();
    }
    setCreating(false);
  };

  const join = async (club: any) => {
    if (!user) return;
    if (club.is_public) {
      const { error } = await supabase.from("club_members").insert({ club_id: club.id, user_id: user.id });
      if (error) toast.error("Erro ao entrar");
      else { toast.success("Você entrou no clube"); load(); }
    } else {
      // Privado: enviar pedido
      const { error } = await supabase
        .from("club_join_requests")
        .insert({ club_id: club.id, user_id: user.id });
      if (error) {
        if ((error as any).code === "23505") toast.info("Você já solicitou entrada nesse clube");
        else toast.error("Erro ao solicitar");
      } else toast.success("Solicitação enviada", { description: "O administrador será notificado." });
    }
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
                <div className="flex items-start gap-3 p-3 rounded-xl bg-card/40 border border-border/40">
                  <div className="mt-0.5">
                    {isPublic ? <Globe2 className="w-5 h-5 text-primary" /> : <Lock className="w-5 h-5 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="is_public" className="font-semibold cursor-pointer">
                        {isPublic ? "Público" : "Privado"}
                      </Label>
                      <Switch id="is_public" checked={isPublic} onCheckedChange={setIsPublic} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {isPublic
                        ? "Qualquer leitor pode encontrar e entrar."
                        : "Acesso só por convite ou aprovação do administrador."}
                    </p>
                  </div>
                </div>
                <Button variant="hero" onClick={create} disabled={creating || name.trim().length < 2} className="w-full">
                  Criar clube
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </header>

        {/* CONVITES PENDENTES */}
        {(myInvites.data || []).length > 0 && (
          <section className="mb-6 glass rounded-2xl p-5 border border-primary/40 animate-fade-in">
            <h2 className="font-display text-lg font-bold flex items-center gap-2 mb-3">
              <Mail className="w-4 h-4 text-primary" /> Convites pendentes
            </h2>
            <ul className="space-y-2">
              {(myInvites.data || []).map((inv) => (
                <li key={inv.id} className="flex items-center gap-3 p-3 rounded-xl bg-card/40 border border-border/30">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{inv.club?.name || "Clube"}</p>
                    <p className="text-xs text-muted-foreground">Convite recebido</p>
                  </div>
                  <Button size="sm" variant="hero" disabled={acceptInv.isPending}
                    onClick={() => acceptInv.mutate(inv.id, { onSuccess: () => load() })}
                    className="h-8 gap-1">
                    <Check className="w-3.5 h-3.5" /> Aceitar
                  </Button>
                  <Button size="sm" variant="ghost" disabled={declineInv.isPending}
                    onClick={() => declineInv.mutate(inv.id)} className="h-8 px-2">
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

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
