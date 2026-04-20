import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Loader2, Crown, UserMinus, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { profilePath } from "@/lib/profile-path";
import { toast } from "sonner";

interface Member {
  user_id: string;
  role: string;
  joined_at: string;
  profile?: {
    id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
}

export default function ClubMembersPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [club, setClub] = useState<{ id: string; name: string; owner_id: string } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const isOwner = !!user && club?.owner_id === user.id;

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: c }, { data: ms }] = await Promise.all([
      supabase.from("book_clubs").select("id,name,owner_id").eq("id", id).maybeSingle(),
      supabase
        .from("club_members")
        .select("user_id,role,joined_at")
        .eq("club_id", id)
        .order("joined_at", { ascending: true }),
    ]);
    setClub(c as any);

    const ids = [...new Set((ms || []).map((m: any) => m.user_id))];
    const { data: profs } = ids.length
      ? await supabase
          .from("profiles")
          .select("id,display_name,username,avatar_url")
          .in("id", ids)
      : { data: [] as any[] };
    const profMap = new Map((profs || []).map((p: any) => [p.id, p]));
    setMembers(
      (ms || []).map((m: any) => ({ ...m, profile: profMap.get(m.user_id) || null })),
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const removeMember = async (memberId: string) => {
    if (!id) return;
    setRemovingId(memberId);
    const { error } = await supabase
      .from("club_members")
      .delete()
      .eq("club_id", id)
      .eq("user_id", memberId);
    setRemovingId(null);
    if (error) {
      toast.error("Não foi possível remover");
      return;
    }
    toast.success("Membro removido");
    setMembers((prev) => prev.filter((m) => m.user_id !== memberId));
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  if (!club) {
    return (
      <AppShell>
        <div className="px-6 py-20 text-center">
          <p className="mb-4">Clube não encontrado</p>
          <Link to="/clubes" className="text-primary underline">Voltar</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-6 pb-24 max-w-3xl mx-auto">
        <button
          onClick={() => navigate(`/clubes/${id}`)}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> {club.name}
        </button>

        <header className="glass rounded-2xl p-5 mb-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary inline-flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h1 className="font-display text-2xl font-bold">Membros</h1>
            <p className="text-sm text-muted-foreground">
              {members.length} {members.length === 1 ? "leitor" : "leitores"} no clube
            </p>
          </div>
        </header>

        <ul className="glass rounded-2xl divide-y divide-border/40 overflow-hidden">
          {members.map((m) => {
            const isClubOwner = m.role === "owner" || m.user_id === club.owner_id;
            const name = m.profile?.display_name || m.profile?.username || "Leitor";
            const link = profilePath(m.profile?.username || null, m.user_id);
            const canRemove = isOwner && !isClubOwner && m.user_id !== user?.id;

            return (
              <li
                key={m.user_id}
                className="px-4 py-3 flex items-center gap-3"
              >
                <Link to={link} className="shrink-0">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={m.profile?.avatar_url || undefined} />
                    <AvatarFallback className="bg-gradient-gold text-primary-foreground text-xs">
                      {name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Link>

                <div className="flex-1 min-w-0">
                  <Link
                    to={link}
                    className="font-medium text-sm hover:text-primary transition-colors truncate inline-flex items-center gap-1.5"
                  >
                    {name}
                    {isClubOwner && (
                      <Crown className="w-3.5 h-3.5 text-primary shrink-0" />
                    )}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    Entrou {formatDistanceToNow(new Date(m.joined_at), { addSuffix: true, locale: ptBR })}
                  </p>
                </div>

                <Badge variant={isClubOwner ? "default" : "secondary"} className="shrink-0">
                  {isClubOwner ? "Dono" : "Membro"}
                </Badge>

                {canRemove && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        disabled={removingId === m.user_id}
                        aria-label={`Remover ${name}`}
                      >
                        {removingId === m.user_id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <UserMinus className="w-4 h-4" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover {name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          O leitor perde acesso às mensagens do clube. Ele pode entrar de novo se for um clube público ou solicitar novamente se for privado.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => removeMember(m.user_id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Remover
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </AppShell>
  );
}
