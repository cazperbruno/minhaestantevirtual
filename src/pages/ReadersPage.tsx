import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { FollowButton } from "@/components/social/FollowButton";
import { Search, Sparkles, Trophy, Users, Loader2 } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { profilePath } from "@/lib/profile-path";
import { useSuggestedReaders } from "@/hooks/useFollow";
import { CACHE, qk } from "@/lib/query-client";

interface Reader {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  level: number | null;
  xp?: number | null;
  shared_books?: number;
  shared_genres?: number;
}

export default function ReadersPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 250);

  // Sugestões "Para seguir" (já exclui usuário atual + quem ele segue)
  const { data: suggestions = [], isLoading: loadingSuggestions } = useSuggestedReaders(20);

  // Top do ranking (cacheado social — 5min)
  const { data: topReaders = [], isLoading: loadingTop } = useQuery<Reader[]>({
    queryKey: qk.ranking(),
    queryFn: async () => {
      const { data } = await supabase.from("ranking_view").select("*").limit(12);
      return ((data as Reader[]) || []).filter((r) => r.id !== user?.id);
    },
    enabled: !!user,
    ...CACHE.SOCIAL,
  });

  // Leitores afins via RPC similar_readers (cacheado social)
  const { data: affins = [] } = useQuery<Reader[]>({
    queryKey: ["affin-readers", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.rpc("similar_readers", { _user_id: user.id, _limit: 10 });
      return (data as Reader[]) || [];
    },
    enabled: !!user,
    ...CACHE.SOCIAL,
  });

  // Busca por nome/username — sem cache pesado, só durante digitação
  const { data: searchResults = [], isFetching: searching } = useQuery<Reader[]>({
    queryKey: ["readers-search", debounced, user?.id],
    queryFn: async () => {
      const q = debounced.replace(/^@+/, "");
      const { data } = await supabase
        .from("profiles")
        .select("id,display_name,username,avatar_url,level,xp")
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .limit(30);
      return ((data as Reader[]) || []).filter((r) => r.id !== user?.id);
    },
    enabled: !!debounced,
    staleTime: 1000 * 30,
  });

  const loadingInit = loadingSuggestions || loadingTop;

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 pb-20 max-w-4xl mx-auto">
        <header className="mb-6 animate-fade-in">
          <p className="text-sm text-primary font-medium mb-2 flex items-center gap-2">
            <Users className="w-4 h-4" /> Comunidade
          </p>
          <h1 className="font-display text-3xl md:text-5xl font-bold leading-tight">
            Encontre <span className="text-gradient-gold italic">leitores</span> incríveis
          </h1>
          <p className="text-muted-foreground mt-2">Siga pessoas, descubra novos gostos, expanda seu mundo.</p>
        </header>

        <div className="relative mb-8 animate-fade-in">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou @usuario"
            className="pl-11 h-12 text-base"
          />
          {searching && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />}
        </div>

        {debounced ? (
          <Section
            title={`Resultados para "${debounced}"`}
            list={searchResults}
            empty="Nenhum leitor encontrado."
          />
        ) : loadingInit ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-12">
            {suggestions.length > 0 && (
              <Section
                title="Para seguir"
                subtitle="Leitores que você ainda não segue"
                icon={<Users className="w-4 h-4 text-primary" />}
                list={suggestions as Reader[]}
              />
            )}
            {affins.length > 0 && (
              <Section
                title="Leitores afins"
                subtitle="Pessoas com gostos parecidos com os seus"
                icon={<Sparkles className="w-4 h-4 text-primary" />}
                list={affins}
                showAffinity
              />
            )}
            <Section
              title="Top leitores"
              subtitle="Quem mais lê e influencia a comunidade"
              icon={<Trophy className="w-4 h-4 text-primary" />}
              list={topReaders}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Section({
  title,
  subtitle,
  icon,
  list,
  showAffinity = false,
  empty,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  list: Reader[];
  showAffinity?: boolean;
  empty?: string;
}) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="font-display text-xl font-semibold flex items-center gap-2">
          {icon}{title}
        </h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-6">{empty || "Nada por aqui ainda."}</p>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-3 animate-stagger">
          {list.map((r) => {
            const affinity = showAffinity
              ? Math.min(99, (r.shared_books || 0) * 12 + (r.shared_genres || 0) * 6)
              : 0;
            return (
              <li
                key={r.id}
                className="glass rounded-2xl p-3 sm:p-4 flex items-center gap-3 hover:border-primary/30 transition-colors min-w-0 overflow-hidden"
              >
                <Link to={profilePath(r)} className="shrink-0">
                  <Avatar className="w-12 h-12 ring-2 ring-transparent hover:ring-primary/40 transition-all">
                    <AvatarImage src={r.avatar_url || undefined} />
                    <AvatarFallback className="bg-gradient-gold text-primary-foreground font-display">
                      {(r.display_name || "?").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Link>
                <div className="flex-1 min-w-0">
                  <Link
                    to={profilePath(r)}
                    className="font-semibold text-sm truncate hover:text-primary transition-colors block"
                  >
                    {r.display_name || "Leitor"}
                  </Link>
                  {r.username && (
                    <p className="text-xs text-muted-foreground truncate">@{r.username}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground flex-wrap">
                    <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold shrink-0">
                      N{r.level ?? 1}
                    </span>
                    {showAffinity && affinity > 0 && (
                      <span className="bg-status-read/15 text-status-read px-1.5 py-0.5 rounded font-semibold shrink-0">
                        {affinity}% afinidade
                      </span>
                    )}
                    {showAffinity && (r.shared_books || 0) > 0 && (
                      <span className="truncate">{r.shared_books} livros</span>
                    )}
                    {showAffinity && (r.shared_genres || 0) > 0 && (
                      <span className="truncate">· {r.shared_genres} gêneros</span>
                    )}
                  </div>
                </div>
                <div className="shrink-0">
                  <FollowButton targetUserId={r.id} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
