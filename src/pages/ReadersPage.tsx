import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { FollowButton } from "@/components/social/FollowButton";
import { Search, Sparkles, Trophy, Users, Loader2 } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { profilePath } from "@/lib/profile-path";

interface Reader {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  level: number | null;
  xp?: number | null;
  shared_books?: number;
  shared_genres?: number;
  i_follow?: boolean;
}

export default function ReadersPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 250);
  const [searchResults, setSearchResults] = useState<Reader[]>([]);
  const [suggestions, setSuggestions] = useState<Reader[]>([]);
  const [topReaders, setTopReaders] = useState<Reader[]>([]);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [loadingInit, setLoadingInit] = useState(true);

  // initial: suggestions (similar) + ranking + my follows
  useEffect(() => {
    (async () => {
      setLoadingInit(true);
      const [{ data: ranking }, { data: myFollows }, simResp] = await Promise.all([
        supabase.from("ranking_view").select("*").limit(12),
        user
          ? supabase.from("follows").select("following_id").eq("follower_id", user.id)
          : Promise.resolve({ data: [] as any[] }),
        user
          ? supabase.rpc("similar_readers", { _user_id: user.id, _limit: 10 })
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const fs = new Set<string>((myFollows || []).map((f: any) => f.following_id));
      setFollowingSet(fs);
      setTopReaders((ranking || []) as Reader[]);
      setSuggestions(((simResp as any).data || []) as Reader[]);
      setLoadingInit(false);
    })();
  }, [user]);

  // search by name/username
  useEffect(() => {
    if (!debounced) {
      setSearchResults([]);
      return;
    }
    (async () => {
      setSearching(true);
      const q = debounced.replace(/^@+/, "");
      const { data } = await supabase
        .from("profiles")
        .select("id,display_name,username,avatar_url,level,xp")
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .limit(30);
      setSearchResults(((data || []) as Reader[]).filter((r) => r.id !== user?.id));
      setSearching(false);
    })();
  }, [debounced, user]);

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
            followingSet={followingSet}
            empty="Nenhum leitor encontrado."
          />
        ) : loadingInit ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-12">
            {suggestions.length > 0 && (
              <Section
                title="Leitores afins"
                subtitle="Pessoas com gostos parecidos com os seus"
                icon={<Sparkles className="w-4 h-4 text-primary" />}
                list={suggestions}
                followingSet={followingSet}
                showAffinity
              />
            )}
            <Section
              title="Top leitores"
              subtitle="Quem mais lê e influencia a comunidade"
              icon={<Trophy className="w-4 h-4 text-primary" />}
              list={topReaders.filter((r) => r.id !== user?.id)}
              followingSet={followingSet}
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
  followingSet,
  showAffinity = false,
  empty,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  list: Reader[];
  followingSet: Set<string>;
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
          {list.map((r) => (
            <li key={r.id} className="glass rounded-2xl p-4 flex items-center gap-3 hover:border-primary/30 transition-colors">
              <Link to={profilePath(r)} className="shrink-0">
                <Avatar className="w-12 h-12 ring-2 ring-transparent hover:ring-primary/40 transition-all">
                  <AvatarImage src={r.avatar_url || undefined} />
                  <AvatarFallback className="bg-gradient-gold text-primary-foreground font-display">
                    {(r.display_name || "?").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Link>
              <div className="flex-1 min-w-0">
                <Link to={profilePath(r)} className="font-semibold text-sm truncate hover:text-primary transition-colors block">
                  {r.display_name || "Leitor"}
                </Link>
                {r.username && <p className="text-xs text-muted-foreground truncate">@{r.username}</p>}
                <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                  <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">N{r.level ?? 1}</span>
                  {showAffinity && (r.shared_books || 0) > 0 && (
                    <span>{r.shared_books} livros em comum</span>
                  )}
                  {showAffinity && (r.shared_genres || 0) > 0 && (
                    <span>· {r.shared_genres} gêneros</span>
                  )}
                </div>
              </div>
              <FollowButton targetUserId={r.id} initiallyFollowing={followingSet.has(r.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
