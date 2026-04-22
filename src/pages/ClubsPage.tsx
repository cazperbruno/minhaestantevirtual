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
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Users, Plus, Loader2, Lock, Globe2, Mail, Check, X, Sparkles, BookOpen, Search, Flame, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { BookCover } from "@/components/books/BookCover";
import { useMyInvitations, useAcceptInvitation, useDeclineInvitation } from "@/hooks/useClubAccess";
import { useClubCategoriesSummary } from "@/hooks/useClubCategories";
import { useFeaturedClub, useRecommendedClubs, useClubsMembers, type RecommendedClub } from "@/hooks/useClubDiscovery";
import { ClubMembersStack } from "@/components/clubs/ClubMembersStack";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { CLUB_CATEGORIES, getCategoryMeta, type ClubCategory } from "@/lib/club-categories";
import { cn } from "@/lib/utils";

interface MineRow {
  id: string;
  name: string;
  category: ClubCategory;
  is_public: boolean;
  current_book?: { id: string; title: string; authors: string[]; cover_url: string | null } | null;
}

export default function ClubsPage() {
  const { user } = useAuth();
  const summary = useClubCategoriesSummary();
  const [mine, setMine] = useState<MineRow[]>([]);
  const [loadingMine, setLoadingMine] = useState(true);

  // Create
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [category, setCategory] = useState<ClubCategory>("geral");
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);

  // Search across categories
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const [searchResults, setSearchResults] = useState<MineRow[]>([]);
  const [searching, setSearching] = useState(false);

  const myInvites = useMyInvitations(user?.id);
  const acceptInv = useAcceptInvitation(user?.id);
  const declineInv = useDeclineInvitation(user?.id);

  // Carrega "Meus clubes"
  useEffect(() => {
    if (!user) {
      setMine([]);
      setLoadingMine(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingMine(true);
      const { data: rows } = await supabase
        .from("club_members")
        .select("club_id")
        .eq("user_id", user.id);
      const ids = (rows || []).map((r) => r.club_id);
      if (ids.length === 0) {
        if (!cancelled) {
          setMine([]);
          setLoadingMine(false);
        }
        return;
      }
      const { data: clubs } = await supabase
        .from("book_clubs")
        .select("id,name,category,is_public,current_book:books(id,title,authors,cover_url)")
        .in("id", ids)
        .order("updated_at", { ascending: false })
        .limit(20);
      if (!cancelled) {
        setMine((clubs || []).map((c) => ({ ...c, category: (c.category as ClubCategory) || "geral" })) as MineRow[]);
        setLoadingMine(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Busca global por nome (cross-categoria)
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setSearching(true);
      const { data } = await supabase
        .from("book_clubs")
        .select("id,name,category,is_public,current_book:books(id,title,authors,cover_url)")
        .ilike("name", `%${q}%`)
        .limit(15);
      if (!cancelled) {
        setSearchResults((data || []).map((c) => ({ ...c, category: (c.category as ClubCategory) || "geral" })) as MineRow[]);
        setSearching(false);
      }
    })();
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  const summaryByCategory = useMemo(() => {
    const map: Record<string, { clubs: number; members: number; online: number }> = {};
    (summary.data || []).forEach((s) => {
      map[s.category] = { clubs: s.clubs_count, members: s.members_count, online: s.online_count };
    });
    return map;
  }, [summary.data]);

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
        category,
      })
      .select()
      .single();
    if (error) toast.error("Erro ao criar clube");
    else {
      toast.success(isPublic ? "Clube público criado!" : "Clube privado criado!");
      setOpen(false);
      setName(""); setDesc(""); setIsPublic(true); setCategory("geral");
      summary.refetch();
    }
    setCreating(false);
  };

  const isSearching = debouncedQuery.trim().length >= 2;

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
                Escolha uma vibe e encontre sua comunidade
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
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ex: Clube de fantasia épica" />
                  </div>
                  <div>
                    <Label htmlFor="desc">Descrição</Label>
                    <Textarea id="desc" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} maxLength={500} placeholder="Sobre o que vocês discutem?" />
                  </div>
                  <div>
                    <Label htmlFor="cat">Categoria</Label>
                    <Select value={category} onValueChange={(v) => setCategory(v as ClubCategory)}>
                      <SelectTrigger id="cat"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CLUB_CATEGORIES.map((c) => (
                          <SelectItem key={c.slug} value={c.slug}>
                            <span className="mr-2" aria-hidden>{c.emoji}</span>{c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                        {isPublic ? "Qualquer leitor pode encontrar e entrar." : "Acesso só por convite ou aprovação."}
                      </p>
                    </div>
                  </div>
                  <Button variant="hero" onClick={create} disabled={creating || name.trim().length < 2} className="w-full">
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar clube"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
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
                  <Button size="sm" variant="hero" disabled={acceptInv.isPending} onClick={() => acceptInv.mutate(inv.id)} className="h-8 gap-1">
                    <Check className="w-3.5 h-3.5" /> Aceitar
                  </Button>
                  <Button size="sm" variant="ghost" disabled={declineInv.isPending} onClick={() => declineInv.mutate(inv.id)} className="h-8 px-2">
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Busca global */}
        <div className="mb-6 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar clube por nome..."
            className="pl-9"
          />
        </div>

        {/* Resultados de busca (sobrepõe categorias) */}
        {isSearching ? (
          <section className="mb-6">
            <h2 className="font-display text-xl font-bold mb-3">Resultados</h2>
            {searching ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
              </div>
            ) : searchResults.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Nada encontrado para "{debouncedQuery}".</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {searchResults.map((c) => <CompactClubCard key={c.id} club={c} />)}
              </div>
            )}
          </section>
        ) : (
          <>
            {/* MEUS CLUBES — atalho rápido */}
            {!loadingMine && mine.length > 0 && (
              <section className="mb-8">
                <h2 className="font-display text-xl font-bold mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" /> Continue no clube
                </h2>
                <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-5 md:-mx-10 px-5 md:px-10 pb-2">
                  {mine.map((c) => (
                    <Link key={c.id} to={`/clubes/${c.id}`} className="snap-start shrink-0 w-64 glass rounded-2xl p-4 hover:border-primary/40 transition-colors">
                      <div className="flex items-start gap-3">
                        {c.current_book ? (
                          <BookCover book={c.current_book} size="sm" />
                        ) : (
                          <div className="w-12 h-16 rounded-md bg-muted/40 flex items-center justify-center">
                            <BookOpen className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs uppercase tracking-wider text-primary font-semibold">
                            {CLUB_CATEGORIES.find((x) => x.slug === c.category)?.emoji} {CLUB_CATEGORIES.find((x) => x.slug === c.category)?.label}
                          </p>
                          <p className="font-semibold text-sm leading-tight line-clamp-2 mt-0.5">{c.name}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* CATEGORIAS */}
            <section>
              <h2 className="font-display text-xl font-bold mb-3">Explorar por categoria</h2>
              {summary.isLoading ? (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {CLUB_CATEGORIES.map((cat) => {
                    const stats = summaryByCategory[cat.slug] || { clubs: 0, members: 0, online: 0 };
                    return <CategoryCard key={cat.slug} cat={cat} stats={stats} />;
                  })}
                </div>
              )}
              {!summary.isLoading && Object.keys(summaryByCategory).length === 0 && (
                <div className="mt-6">
                  <EmptyState
                    icon={<Users />}
                    title="Nenhum clube ainda"
                    description="Crie o primeiro e convide leitores para a categoria que você ama."
                    action={
                      <Button variant="hero" size="lg" className="gap-2" onClick={() => setOpen(true)}>
                        <Plus className="w-4 h-4" /> Criar clube
                      </Button>
                    }
                  />
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function CategoryCard({
  cat,
  stats,
}: {
  cat: typeof CLUB_CATEGORIES[number];
  stats: { clubs: number; members: number; online: number };
}) {
  const empty = stats.clubs === 0;
  return (
    <Link
      to={`/clubes/categoria/${cat.slug}`}
      className={cn(
        "group relative rounded-2xl p-4 md:p-5 border border-border/40 transition-all overflow-hidden",
        "bg-gradient-to-br hover:scale-[1.02] hover:border-primary/40 hover:shadow-lg active:scale-[0.99]",
        cat.gradient,
        empty && "opacity-70",
      )}
    >
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-3xl md:text-4xl drop-shadow" aria-hidden>{cat.emoji}</span>
          {stats.online > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {stats.online}
            </span>
          )}
        </div>
        <h3 className="font-display text-base md:text-lg font-bold leading-tight">{cat.label}</h3>
        <p className={cn("text-[11px] md:text-xs mt-0.5 line-clamp-1", cat.accent)}>{cat.description}</p>
        <div className="mt-3 flex items-center gap-3 text-[11px] text-foreground/80 tabular-nums">
          <span className="inline-flex items-center gap-1">
            <Users className="w-3 h-3" /> {stats.clubs} {stats.clubs === 1 ? "clube" : "clubes"}
          </span>
          {stats.members > 0 && <span className="opacity-80">· {stats.members} {stats.members === 1 ? "leitor" : "leitores"}</span>}
        </div>
      </div>
    </Link>
  );
}

function CompactClubCard({ club }: { club: MineRow }) {
  const meta = CLUB_CATEGORIES.find((c) => c.slug === club.category);
  return (
    <Link
      to={`/clubes/${club.id}`}
      className="glass rounded-2xl p-4 flex items-start gap-3 hover:border-primary/40 transition-colors"
    >
      {club.current_book ? (
        <BookCover book={club.current_book} size="sm" />
      ) : (
        <div className="w-12 h-16 rounded-md bg-muted/40 flex items-center justify-center shrink-0">
          <BookOpen className="w-5 h-5 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-primary font-semibold">
          {meta?.emoji} {meta?.label}
        </p>
        <p className="font-semibold text-sm leading-tight line-clamp-2 mt-0.5">{club.name}</p>
        <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
          {club.is_public ? <Globe2 className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
          {club.is_public ? "Público" : "Privado"}
        </p>
      </div>
    </Link>
  );
}
