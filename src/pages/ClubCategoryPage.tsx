import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowLeft, Users, Search, Globe2, Lock, BookOpen, Sparkles } from "lucide-react";
import { BookCover } from "@/components/books/BookCover";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { CLUB_CATEGORIES, getCategoryMeta, type ClubCategory } from "@/lib/club-categories";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ClubRow {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  owner_id: string;
  category: ClubCategory;
  current_book?: { id: string; title: string; authors: string[]; cover_url: string | null } | null;
  member_count: number;
  online_count: number;
  i_am_member: boolean;
}

export default function ClubCategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const meta = useMemo(() => getCategoryMeta(slug), [slug]);
  const isValidCategory = useMemo(
    () => CLUB_CATEGORIES.some((c) => c.slug === slug),
    [slug],
  );

  const [clubs, setClubs] = useState<ClubRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 200);

  useEffect(() => {
    if (!isValidCategory) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("book_clubs")
        .select("id,name,description,is_public,owner_id,category,current_book:books(id,title,authors,cover_url)")
        .eq("category", slug as ClubCategory)
        .order("updated_at", { ascending: false })
        .limit(120);
      if (error) {
        toast.error("Erro ao carregar clubes");
        if (!cancelled) setLoading(false);
        return;
      }
      const ids = (data || []).map((c) => c.id);
      const [{ data: members }, { data: mine }] = await Promise.all([
        ids.length
          ? supabase.from("club_members").select("club_id,user_id,last_seen_at").in("club_id", ids)
          : Promise.resolve({ data: [] as { club_id: string; user_id: string; last_seen_at: string }[] }),
        user && ids.length
          ? supabase.from("club_members").select("club_id").eq("user_id", user.id).in("club_id", ids)
          : Promise.resolve({ data: [] as { club_id: string }[] }),
      ]);
      const fiveMinAgo = Date.now() - 5 * 60_000;
      const memberMap: Record<string, { total: number; online: number }> = {};
      (members || []).forEach((m) => {
        const ref = memberMap[m.club_id] || (memberMap[m.club_id] = { total: 0, online: 0 });
        ref.total += 1;
        if (m.last_seen_at && new Date(m.last_seen_at).getTime() > fiveMinAgo) ref.online += 1;
      });
      const mineSet = new Set((mine || []).map((m) => m.club_id));
      if (cancelled) return;
      setClubs(
        (data || []).map((c) => ({
          ...c,
          category: (c.category as ClubCategory) || "geral",
          member_count: memberMap[c.id]?.total || 0,
          online_count: memberMap[c.id]?.online || 0,
          i_am_member: mineSet.has(c.id),
        })) as ClubRow[],
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, isValidCategory, user?.id]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return clubs;
    return clubs.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description || "").toLowerCase().includes(q) ||
        (c.current_book?.title || "").toLowerCase().includes(q),
    );
  }, [clubs, debouncedQuery]);

  const join = async (club: ClubRow) => {
    if (!user) return;
    if (club.is_public) {
      const { error } = await supabase.from("club_members").insert({ club_id: club.id, user_id: user.id });
      if (error) toast.error("Erro ao entrar");
      else {
        toast.success("Você entrou no clube");
        navigate(`/clubes/${club.id}`);
      }
    } else {
      const { error } = await supabase.from("club_join_requests").insert({ club_id: club.id, user_id: user.id });
      if (error) {
        if ((error as { code?: string }).code === "23505") toast.info("Você já solicitou entrada");
        else toast.error("Erro ao solicitar");
      } else toast.success("Solicitação enviada");
    }
  };

  if (!isValidCategory) {
    return (
      <AppShell>
        <div className="px-5 md:px-10 pt-8 pb-16 max-w-5xl mx-auto">
          <EmptyState
            icon={<Sparkles />}
            title="Categoria não encontrada"
            description="Volte e escolha uma das categorias disponíveis."
            action={
              <Link to="/clubes">
                <Button variant="hero">Ver categorias</Button>
              </Link>
            }
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-6 pb-16 max-w-5xl mx-auto">
        <Link to="/clubes" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Todas as categorias
        </Link>

        {/* Hero da categoria */}
        <header
          className={cn(
            "rounded-3xl p-6 md:p-8 mb-6 border border-border/40 relative overflow-hidden",
            "bg-gradient-to-br",
            meta.gradient,
          )}
        >
          <div className="relative z-10 flex items-center gap-4">
            <span className="text-5xl md:text-6xl drop-shadow-lg" aria-hidden>{meta.emoji}</span>
            <div className="min-w-0">
              <h1 className="font-display text-3xl md:text-4xl font-bold leading-tight">{meta.label}</h1>
              <p className={cn("text-sm md:text-base mt-1", meta.accent)}>{meta.description}</p>
            </div>
          </div>
        </header>

        {/* Busca */}
        <div className="mb-5 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Buscar em ${meta.label.toLowerCase()}...`}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
          </div>
        ) : clubs.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="Nenhum clube nesta categoria"
            description="Seja o primeiro a criar um clube aqui."
            action={
              <Link to="/clubes">
                <Button variant="hero">Criar clube</Button>
              </Link>
            }
          />
        ) : filtered.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center">
            <Sparkles className="w-8 h-8 text-primary mx-auto mb-3" />
            <p className="font-semibold">Nada encontrado</p>
            <p className="text-sm text-muted-foreground mt-1">Tente outro termo de busca.</p>
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
              club.is_public ? "bg-muted/50 text-muted-foreground" : "bg-primary/15 text-primary",
            )}
          >
            {club.is_public ? <Globe2 className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
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
              <p className="text-[10px] uppercase tracking-wider text-primary font-semibold">Lendo agora</p>
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
        <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
          <span className="inline-flex items-center gap-1">
            <Users className="w-3 h-3 shrink-0" />
            {club.member_count}
          </span>
          {club.online_count > 0 && (
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {club.online_count} online
            </span>
          )}
        </div>
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
