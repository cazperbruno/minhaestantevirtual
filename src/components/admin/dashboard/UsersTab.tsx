import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAdminCsrfToken } from "@/hooks/useAdminCsrfToken";
import { invokeAdmin } from "@/lib/admin-invoke";
import { toast } from "sonner";
import {
  Crown, Search, ShieldOff, ShieldPlus, Trophy, Users as UsersIcon,
} from "lucide-react";

interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  level: number;
  xp: number;
  created_at: string;
  is_admin: boolean;
}

const PAGE_SIZE = 25;

/**
 * Aba Usuários — lista com busca, paginação, distribuição por nível e
 * ações de promover/remover admin (com CSRF e audit no backend).
 */
export function UsersTab() {
  const csrf = useAdminCsrfToken();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [acting, setActing] = useState<string | null>(null);

  const load = async (resetPage = false) => {
    setLoading(true);
    try {
      const from = (resetPage ? 0 : page) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, level, xp, created_at", { count: "exact" })
        .order("xp", { ascending: false })
        .range(from, to);
      if (search.trim()) {
        const s = search.trim();
        q = q.or(`username.ilike.%${s}%,display_name.ilike.%${s}%`);
      }
      const [{ data, count, error }, rolesR] = await Promise.all([
        q,
        supabase.from("user_roles").select("user_id").eq("role", "admin"),
      ]);
      if (error) throw error;
      const admins = new Set<string>(((rolesR.data as any[]) || []).map((r) => r.user_id));
      setAdminIds(admins);
      setProfiles(((data as any[]) || []).map((p) => ({ ...p, is_admin: admins.has(p.id) })));
      setTotal(count ?? 0);
      if (resetPage) setPage(0);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao carregar usuários");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void load(true);
  };

  const toggleAdmin = async (p: Profile) => {
    const next = !p.is_admin;
    const verb = next ? "promover a admin" : "remover admin";
    if (!confirm(`Tem certeza que deseja ${verb}: ${p.display_name ?? p.id}?`)) return;
    setActing(p.id);
    try {
      const csrfToken = await csrf.ensureToken();
      if (!csrfToken) throw new Error("Token CSRF ausente");
      const { error } = await invokeAdmin("admin-user-action", {
        csrfToken,
        body: { action: next ? "promote_admin" : "demote_admin", user_id: p.id },
      });
      if (error) throw error;
      toast.success(next ? "Promovido a admin" : "Admin removido");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao alterar role");
    } finally {
      setActing(null);
    }
  };

  // Distribuição por nível (a partir da página visível — leve)
  const levelBuckets = useMemo(() => {
    const b = { "1-2": 0, "3-5": 0, "6-10": 0, "11+": 0 };
    profiles.forEach((p) => {
      if (p.level <= 2) b["1-2"]++;
      else if (p.level <= 5) b["3-5"]++;
      else if (p.level <= 10) b["6-10"]++;
      else b["11+"]++;
    });
    return b;
  }, [profiles]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="font-display text-2xl font-bold flex items-center gap-2">
          <UsersIcon className="w-5 h-5 text-primary" />
          Usuários
        </h2>
        <Badge variant="outline">{total.toLocaleString("pt-BR")} no total</Badge>
        <Badge variant="outline" className="text-primary border-primary/40 gap-1">
          <Crown className="w-3 h-3" /> {adminIds.size} admin{adminIds.size !== 1 ? "s" : ""}
        </Badge>
      </div>

      <Card className="p-4 space-y-3">
        <form onSubmit={onSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por username ou nome…"
              className="pl-8"
            />
          </div>
          <Button type="submit">Buscar</Button>
        </form>

        {/* Distribuição por nível na página atual */}
        <div className="grid grid-cols-4 gap-2 text-xs">
          {Object.entries(levelBuckets).map(([k, v]) => (
            <div key={k} className="rounded-lg bg-muted/20 border border-border/40 p-2">
              <div className="text-muted-foreground">Nível {k}</div>
              <div className="font-display text-lg font-bold">{v}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : profiles.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">Nenhum usuário encontrado.</div>
        ) : (
          <ul className="divide-y divide-border/40">
            {profiles.map((p) => (
              <li key={p.id} className="flex items-center gap-3 p-3 hover:bg-muted/20 transition-colors">
                <Avatar className="h-10 w-10 shrink-0">
                  {p.avatar_url && <AvatarImage src={p.avatar_url} />}
                  <AvatarFallback className="text-xs">
                    {(p.display_name ?? "?").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{p.display_name ?? "Sem nome"}</span>
                    {p.is_admin && (
                      <Badge variant="outline" className="text-primary border-primary/40 text-[10px] gap-0.5">
                        <Crown className="w-2.5 h-2.5" /> admin
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                    {p.username && <span>@{p.username}</span>}
                    <span className="flex items-center gap-0.5">
                      <Trophy className="w-2.5 h-2.5" /> Nível {p.level} · {p.xp} XP
                    </span>
                    <span>· entrou {new Date(p.created_at).toLocaleDateString("pt-BR")}</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={p.is_admin ? "outline" : "ghost"}
                  className="gap-1.5 shrink-0"
                  onClick={() => void toggleAdmin(p)}
                  disabled={acting === p.id}
                >
                  {p.is_admin ? (
                    <><ShieldOff className="w-3.5 h-3.5" /> Remover</>
                  ) : (
                    <><ShieldPlus className="w-3.5 h-3.5" /> Tornar admin</>
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {/* Paginação */}
        {!loading && total > PAGE_SIZE && (
          <div className="flex items-center justify-between p-3 border-t border-border/40 text-xs">
            <span className="text-muted-foreground">
              Página {page + 1} de {totalPages}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Próxima
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
