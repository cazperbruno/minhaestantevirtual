import { useEffect, useState } from "react";
import {
  useClubJoinRequests, useApproveRequest, useRejectRequest,
  useClubInvitations, useInviteToClub,
} from "@/hooks/useClubAccess";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Check, X, UserPlus, Loader2, Search, Mail, Inbox, Tag, Users } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useQuery } from "@tanstack/react-query";
import { CLUB_CATEGORIES, type ClubCategory } from "@/lib/club-categories";
import { ClubBooksAdmin } from "@/components/clubs/ClubBooksAdmin";
import { ExportClubReportButton } from "@/components/clubs/ExportClubReportButton";
import { ClubInviteLinkPanel } from "@/components/clubs/ClubInviteLinkPanel";
import { Link } from "react-router-dom";
import { toast } from "sonner";

interface Props {
  clubId: string;
  ownerId: string;
}

export function ClubAdminPanel({ clubId, ownerId }: Props) {
  const requests = useClubJoinRequests(clubId, true);
  const invitations = useClubInvitations(clubId, true);
  const approve = useApproveRequest(clubId);
  const reject = useRejectRequest(clubId);

  const pendingReqs = requests.data || [];
  const sentInvites = (invitations.data || []).filter((i) => i.status === "pending");

  // Categoria atual
  const [category, setCategory] = useState<ClubCategory>("geral");
  const [savingCat, setSavingCat] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("book_clubs").select("category").eq("id", clubId).maybeSingle();
      if (!cancelled && data?.category) setCategory(data.category as ClubCategory);
    })();
    return () => { cancelled = true; };
  }, [clubId]);

  const updateCategory = async (next: ClubCategory) => {
    setSavingCat(true);
    setCategory(next);
    const { error } = await supabase.from("book_clubs").update({ category: next }).eq("id", clubId);
    if (error) toast.error("Erro ao salvar categoria");
    else toast.success("Categoria atualizada");
    setSavingCat(false);
  };

  return (
    <div className="glass rounded-2xl p-5 border border-primary/30 mb-4 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-display text-lg font-bold flex items-center gap-2">
          <Inbox className="w-5 h-5 text-primary" /> Painel do admin
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportClubReportButton clubId={clubId} />
          <Button asChild size="sm" variant="outline" className="gap-1.5 h-8">
            <Link to={`/clubes/${clubId}/membros`}>
              <Users className="w-3.5 h-3.5" /> Membros
            </Link>
          </Button>
          <InviteUserDialog clubId={clubId} invitedBy={ownerId} />
        </div>
      </div>

      {/* GERENCIAR LIVROS */}
      <ClubBooksAdmin clubId={clubId} />

      {/* CATEGORIA */}
      <section>
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 font-semibold flex items-center gap-1.5">
          <Tag className="w-3 h-3" /> Categoria
        </p>
        <Select value={category} onValueChange={(v) => updateCategory(v as ClubCategory)} disabled={savingCat}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CLUB_CATEGORIES.map((c) => (
              <SelectItem key={c.slug} value={c.slug}>
                <span className="mr-2" aria-hidden>{c.emoji}</span>{c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground mt-1.5">
          Aparece na home de clubes e ajuda leitores a encontrarem o seu clube.
        </p>
      </section>

      {/* PEDIDOS PENDENTES */}
      <section>
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 font-semibold">
          Pedidos pendentes ({pendingReqs.length})
        </p>
        {requests.isLoading ? (
          <div className="py-4 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
        ) : pendingReqs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2 italic">Nenhum pedido pendente</p>
        ) : (
          <ul className="space-y-2">
            {pendingReqs.map((r) => (
              <li key={r.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-card/40 border border-border/30">
                <Avatar className="w-9 h-9">
                  <AvatarImage src={r.profile?.avatar_url || undefined} />
                  <AvatarFallback>{(r.profile?.display_name || "?").charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.profile?.display_name || "Leitor"}</p>
                  {r.message && <p className="text-xs text-muted-foreground line-clamp-1 italic">"{r.message}"</p>}
                </div>
                <Button size="sm" variant="hero" disabled={approve.isPending}
                  onClick={() => approve.mutate(r.id)} className="h-8 gap-1">
                  <Check className="w-3.5 h-3.5" /> Aprovar
                </Button>
                <Button size="sm" variant="ghost" disabled={reject.isPending}
                  onClick={() => reject.mutate(r.id)} className="h-8 px-2">
                  <X className="w-3.5 h-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* CONVITES ENVIADOS */}
      {sentInvites.length > 0 && (
        <section>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 font-semibold">
            Convites enviados ({sentInvites.length})
          </p>
          <ul className="space-y-1.5">
            {sentInvites.map((i) => (
              <li key={i.id} className="flex items-center gap-3 p-2 rounded-lg bg-card/30 text-xs">
                <Mail className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-muted-foreground truncate">Aguardando resposta · {new Date(i.created_at).toLocaleDateString("pt-BR")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function InviteUserDialog({ clubId, invitedBy }: { clubId: string; invitedBy: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const debounced = useDebouncedValue(q, 250);
  const invite = useInviteToClub(clubId, invitedBy);

  const search = useQuery({
    queryKey: ["readers-search", debounced],
    enabled: open && debounced.trim().length >= 2,
    queryFn: async () => {
      const term = debounced.trim();
      const { data } = await supabase
        .from("profiles")
        .select("id,display_name,username,avatar_url")
        .or(`display_name.ilike.%${term}%,username.ilike.%${term}%`)
        .neq("id", invitedBy)
        .limit(10);
      return data || [];
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="hero" className="gap-1.5 h-8">
          <UserPlus className="w-3.5 h-3.5" /> Convidar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Convidar leitor</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Buscar por nome ou @username"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="max-h-[300px] overflow-y-auto space-y-1">
            {search.isLoading && (
              <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
            )}
            {!search.isLoading && search.data?.length === 0 && debounced.length >= 2 && (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum leitor encontrado</p>
            )}
            {(search.data || []).map((p: any) => (
              <button
                key={p.id}
                onClick={() => invite.mutate(p.id, { onSuccess: () => setOpen(false) })}
                disabled={invite.isPending}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent/40 transition-colors text-left"
              >
                <Avatar className="w-8 h-8">
                  <AvatarImage src={p.avatar_url || undefined} />
                  <AvatarFallback>{(p.display_name || "?").charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.display_name || "Leitor"}</p>
                  {p.username && <p className="text-xs text-muted-foreground truncate">@{p.username}</p>}
                </div>
                <UserPlus className="w-4 h-4 text-primary shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
