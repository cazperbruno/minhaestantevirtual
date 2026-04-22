import { useEffect, useMemo, useState } from "react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, Plus, Loader2, Lock, Globe2, Mail, Check, X, Search, Sparkles, BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { BookCover } from "@/components/books/BookCover";
import { useMyInvitations, useAcceptInvitation, useDeclineInvitation } from "@/hooks/useClubAccess";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";

type Filter = "all" | "mine" | "public";

interface ClubRow {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  owner_id: string;
  current_book?: { id: string; title: string; authors: string[]; cover_url: string | null } | null;
  member_count: number;
  i_am_member: boolean;
}

export default function ClubsPage() {
  const { user } = useAuth();
  const [clubs, setClubs] = useState<ClubRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 200);

  const myInvites = useMyInvitations(user?.id);
  const acceptInv = useAcceptInvitation(user?.id);
  const declineInv = useDeclineInvitation(user?.id);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("book_clubs")
      .select("id,name,description,is_public,owner_id,current_book:books(id,title,authors,cover_url)")
      .order("updated_at", { ascending: false })
      .limit(60);

    const ids = (data || []).map((c) => c.id);
    const [{ data: counts }, { data: mine }] = await Promise.all([
      ids.length
        ? supabase.from("club_members").select("club_id").in("club_id", ids)
        : Promise.resolve({ data: [] as { club_id: string }[] }),
      user && ids.length
        ? supabase.from("club_members").select("club_id").eq("user_id", user.id).in("club_id", ids)
        : Promise.resolve({ data: [] as { club_id: string }[] }),
    ]);
    const countMap: Record<string, number> = {};
    (counts || []).forEach((c) => {
      countMap[c.club_id] = (countMap[c.club_id] || 0) + 1;
    });
    const mineSet = new Set((mine || []).map((m) => m.club_id));

    setClubs(
      (data || []).map((c) => ({
        ...c,
        member_count: countMap[c.id] || 0,
        i_am_member: mineSet.has(c.id),
      })) as ClubRow[],
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Realtime: novo clube criado → recarrega lista
  useEffect(() => {
    const ch = supabase
      .channel("clubs-list")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "book_clubs" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return clubs.filter((c) => {
      if (filter === "mine" && !c.i_am_member) return false;
      if (filter === "public" && !c.is_public) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.description || "").toLowerCase().includes(q) ||
        (c.current_book?.title || "").toLowerCase().includes(q)
      );
    });
  }, [clubs, filter, debouncedQuery]);

  const stats = useMemo(() => {
    const mine = clubs.filter((c) => c.i_am_member).length;
    const publicC = clubs.filter((c) => c.is_public).length;
    return { total: clubs.length, mine, publicC };
  }, [clubs]);

  const create = async () => {
    if (!user || name.trim().length < 2) return;
    setCreating(true);
    const { error } = await supabase
      .from("book_clubs")
      .insert({
        owner_id: user.id,
        name: name.trim(),
        description: desc.trim() || null,
        is_public: isPublic,
      })
      .select()
      .single();
    if (error) toast.error("Erro ao criar clube");
    else {
      toast.success(
        isPublic ? "Clube público criado!" : "Clube privado criado! Convide leitores manualmente.",
      );
      setOpen(false);
      setName("");
      setDesc("");
      setIsPublic(true);
      load();
    }
    setCreating(false);
  };

  const join = async (club: ClubRow) => {
    if (!user) return;
    if (club.is_public) {
      const { error } = await supabase
        .from("club_members")
        .insert({ club_id: club.id, user_id: user.id });
      if (error) toast.error("Erro ao entrar");
      else {
        toast.success("Você entrou no clube");
        load();
      }
    } else {
      const { error } = await supabase
        .from("club_join_requests")
        .insert({ club_id: club.id, user_id: user.id });
      if (error) {
        if ((error as { code?: string }).code === "23505")
          toast.info("Você já solicitou entrada nesse clube");
        else toast.error("Erro ao solicitar");
      } else
        toast.success("Solicitação enviada", {
          description: "O administrador será notificado.",
        });
    }
  };

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 pb-16 max-w-5xl mx-auto">
        {/* Hero */}
        <header className="mb-6 animate-fade-in">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h1 className="font-display text-3xl md:text-4xl font-bold text-gradient-gold flex items-center gap-3">
                <Users className="w-7 h-7 md:w-8 md:h-8 text-primary" /> Clubes
              </h1>
              <p className="text-muted-foreground mt-1 text-sm md:text-base">
                Encontre leitores e leia em grupo
              </p>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button variant="hero" className="gap-2 shrink-0">
                  <Plus className="w-4 h-4" /> Criar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Novo clube</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="name">Nome</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={80}
                      placeholder="Ex: Clube de fantasia"
                    />
                  </div>
                  <div>
                    <Label htmlFor="desc">Descrição</Label>
                    <Textarea
                      id="desc"
                      value={desc}
                      onChange={(e) => setDesc(e.target.value)}
                      rows={3}
                      placeholder="Conte um pouco sobre o que o clube discute..."
                      maxLength={500}
                    />
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-card/40 border border-border/40">
                    <div className="mt-0.5">
                      {isPublic ? (
                        <Globe2 className="w-5 h-5 text-primary" />
                      ) : (
                        <Lock className="w-5 h-5 text-primary" />
                      )}
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
                  <Button
                    variant="hero"
                    onClick={create}
                    disabled={creating || name.trim().length < 2}
                    className="w-full"
                  >
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar clube"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Stats compactas — só quando há clubes */}
          {!loading && clubs.length > 0 && (
            <div className="mt-4 flex gap-2 text-xs">
              <Stat label="Total" value={stats.total} />
              <Stat label="Meus" value={stats.mine} />
              <Stat label="Públicos" value={stats.publicC} />
            </div>
          )}
        </header>

        {/* CONVITES PENDENTES */}
        {(myInvites.data || []).length > 0 && (
          <section className="mb-6 glass rounded-2xl p-5 border border-primary/40 animate-fade-in">
            <h2 className="font-display text-lg font-bold flex items-center gap-2 mb-3">
              <Mail className="w-4 h-4 text-primary" /> Convites pendentes
            </h2>
            <ul className="space-y-2">
              {(myInvites.data || []).map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-card/40 border border-border/30"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{inv.club?.name || "Clube"}</p>
                    <p className="text-xs text-muted-foreground">Convite recebido</p>
                  </div>
                  <Button
                    size="sm"
                    variant="hero"
                    disabled={acceptInv.isPending}
                    onClick={() => acceptInv.mutate(inv.id, { onSuccess: () => load() })}
                    className="h-8 gap-1"
                  >
                    <Check className="w-3.5 h-3.5" /> Aceitar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={declineInv.isPending}
                    onClick={() => declineInv.mutate(inv.id)}
                    className="h-8 px-2"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Filtros + busca */}
        {(!loading && clubs.length > 0) && (
          <div className="mb-5 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar clubes ou livros do mês..."
                className="pl-9"
              />
            </div>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <TabsList className="grid grid-cols-3 w-full sm:w-auto">
                <TabsTrigger value="all" className="text-xs sm:text-sm">Todos</TabsTrigger>
                <TabsTrigger value="mine" className="text-xs sm:text-sm gap-1">
                  Meus {stats.mine > 0 && <span className="text-primary">({stats.mine})</span>}
                </TabsTrigger>
                <TabsTrigger value="public" className="text-xs sm:text-sm">Públicos</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}

        {/* Conteúdo */}
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        ) : clubs.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="Nenhum clube ainda"
            description="Crie o primeiro clube e convide pessoas para ler junto."
            action={
              <Button variant="hero" size="lg" className="gap-2" onClick={() => setOpen(true)}>
                <Plus className="w-4 h-4" /> Criar clube
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center">
            <Sparkles className="w-8 h-8 text-primary mx-auto mb-3" />
            <p className="font-semibold">Nada encontrado</p>
            <p className="text-sm text-muted-foreground mt-1">
              Ajuste a busca ou troque o filtro acima.
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((c) => (
              <ClubCard key={c.id} club={c} onJoin={() => join(c)} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-2.5 py-1 rounded-full bg-muted/40 border border-border/40 text-muted-foreground">
      <span className="font-semibold text-foreground tabular-nums">{value}</span>{" "}
      <span className="text-[11px] uppercase tracking-wider">{label}</span>
    </div>
  );
}

function ClubCard({ club, onJoin }: { club: ClubRow; onJoin: () => void }) {
  return (
    <article
      className={cn(
        "glass rounded-2xl p-5 flex flex-col transition-all hover:border-primary/40",
        club.i_am_member && "border-primary/30 ring-1 ring-primary/10",
      )}
    >
      <Link to={`/clubes/${club.id}`} className="flex-1 group">
        <div className="flex items-start gap-2 justify-between">
          <h2 className="font-display text-lg font-semibold leading-tight group-hover:text-primary transition-colors line-clamp-2">
            {club.name}
          </h2>
          <span
            className={cn(
              "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0",
              club.is_public
                ? "bg-muted/50 text-muted-foreground"
                : "bg-primary/15 text-primary",
            )}
          >
            {club.is_public ? (
              <Globe2 className="w-3 h-3" />
            ) : (
              <Lock className="w-3 h-3" />
            )}
            {club.is_public ? "Público" : "Privado"}
          </span>
        </div>
        {club.description && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{club.description}</p>
        )}
        {club.current_book ? (
          <div className="flex gap-2 mt-3 items-center">
            <BookCover book={club.current_book} size="sm" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-primary font-semibold">
                Lendo agora
              </p>
              <p className="text-sm font-medium truncate">{club.current_book.title}</p>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 mt-3 items-center text-muted-foreground">
            <BookOpen className="w-4 h-4" />
            <p className="text-xs italic">Sem livro do mês ainda</p>
          </div>
        )}
      </Link>
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/40 gap-2">
        <span className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
          <Users className="w-3 h-3 shrink-0" />
          <span className="truncate">
            {club.member_count} {club.member_count === 1 ? "membro" : "membros"}
          </span>
        </span>
        {club.i_am_member ? (
          <Link to={`/clubes/${club.id}`}>
            <Button size="sm" variant="outline">Abrir</Button>
          </Link>
        ) : (
          <Button size="sm" variant="hero" onClick={onJoin}>
            {club.is_public ? "Entrar" : "Solicitar"}
          </Button>
        )}
      </div>
    </article>
  );
}
