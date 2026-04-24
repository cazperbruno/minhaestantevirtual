import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BookCover } from "@/components/books/BookCover";
import { Badge } from "@/components/ui/badge";
import { ArrowRightLeft, Check, X, Loader2, Send, Inbox, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { profilePath } from "@/lib/profile-path";
import { TradeMatchDialog } from "@/components/social/TradeMatchDialog";

interface Trade {
  id: string;
  proposer_id: string;
  receiver_id: string;
  proposer_book_id: string;
  receiver_book_id: string;
  message: string | null;
  status: "pending" | "accepted" | "declined" | "completed" | "cancelled";
  created_at: string;
  proposer_book?: any;
  receiver_book?: any;
  proposer?: any;
  receiver?: any;
}

interface TradeMatch {
  id: string;
  book_id: string;
  offerer_id: string;
  wisher_id: string;
  status: string;
  detected_at: string;
  book?: any;
  other?: any;
  iAmWisher?: boolean;
}

export default function TradesPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<"matches" | "incoming" | "outgoing" | "history">("matches");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [matches, setMatches] = useState<TradeMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);

  // Abre o dialog de match cinemático quando vem com ?match=
  useEffect(() => {
    const m = searchParams.get("match");
    if (m) {
      setActiveMatchId(m);
      setTab("matches");
    }
  }, [searchParams]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: tradesData }, { data: matchesData }] = await Promise.all([
      supabase
        .from("trades")
        .select("*, proposer_book:proposer_book_id(id,title,authors,cover_url), receiver_book:receiver_book_id(id,title,authors,cover_url)")
        .or(`proposer_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("trade_matches")
        .select("*")
        .or(`offerer_id.eq.${user.id},wisher_id.eq.${user.id}`)
        .eq("status", "pending")
        .order("detected_at", { ascending: false })
        .limit(50),
    ]);
    const list = (tradesData || []) as Trade[];
    const matchList = (matchesData || []) as any[];
    const userIds = [
      ...new Set([
        ...list.flatMap((t) => [t.proposer_id, t.receiver_id]),
        ...matchList.flatMap((m: any) => [m.offerer_id, m.wisher_id]),
      ]),
    ];
    const bookIds = [...new Set(matchList.map((m: any) => m.book_id))];
    const [{ data: profs }, { data: books }] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("id,display_name,username,avatar_url").in("id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      bookIds.length
        ? supabase.from("books").select("id,title,authors,cover_url").in("id", bookIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const m = new Map((profs || []).map((p: any) => [p.id, p]));
    const bm = new Map((books || []).map((b: any) => [b.id, b]));
    setTrades(
      list.map((t) => ({
        ...t,
        proposer: m.get(t.proposer_id),
        receiver: m.get(t.receiver_id),
      })),
    );
    setMatches(
      matchList.map((mm: any) => {
        const iAmWisher = mm.wisher_id === user.id;
        return {
          ...mm,
          book: bm.get(mm.book_id),
          other: m.get(iAmWisher ? mm.offerer_id : mm.wisher_id),
          iAmWisher,
        };
      }),
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel(`trades:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "trades" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "trade_matches" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel(`trades:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "trades" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const update = async (id: string, status: Trade["status"]) => {
    const prev = trades;
    setPendingId(id);
    setTrades((arr) => arr.map((t) => (t.id === id ? { ...t, status } : t)));
    const { error } = await supabase.from("trades").update({ status }).eq("id", id);
    setPendingId(null);
    if (error) {
      setTrades(prev);
      toast.error("Erro ao atualizar proposta");
      return;
    }
    const labels: Record<string, string> = {
      accepted: "Proposta aceita",
      declined: "Proposta recusada",
      completed: "Troca concluída!",
      cancelled: "Proposta cancelada",
    };
    toast.success(labels[status] || "Atualizado");
  };

  const incoming = trades.filter((t) => t.receiver_id === user?.id && t.status === "pending");
  const outgoing = trades.filter((t) => t.proposer_id === user?.id && t.status === "pending");
  const active = trades.filter((t) => t.status === "accepted");
  const history = trades.filter((t) => ["completed", "declined", "cancelled"].includes(t.status));

  const visible =
    tab === "incoming" ? [...incoming, ...active]
    : tab === "outgoing" ? [...outgoing, ...active]
    : tab === "history" ? history
    : [];

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-8 pb-20 max-w-4xl mx-auto">
        <header className="mb-6 animate-fade-in">
          <p className="text-sm text-primary font-medium mb-2 flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4" /> Trocas de livros
          </p>
          <h1 className="font-display text-3xl md:text-5xl font-bold leading-tight">
            Suas <span className="text-gradient-gold italic">trocas</span>
          </h1>
        </header>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mb-6">
          <TabsList className="grid grid-cols-4 max-w-xl">
            <TabsTrigger value="matches" className="gap-1.5">
              <Zap className="w-3.5 h-3.5" /> Matches
              {matches.length > 0 && <Badge variant="default" className="h-4 px-1.5 ml-1">{matches.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="incoming" className="gap-1.5">
              <Inbox className="w-3.5 h-3.5" /> Recebidas
              {incoming.length > 0 && <Badge variant="default" className="h-4 px-1.5 ml-1">{incoming.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="outgoing" className="gap-1.5">
              <Send className="w-3.5 h-3.5" /> Enviadas
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">Histórico</TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === "matches" ? (
          loading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : matches.length === 0 ? (
            <div className="glass rounded-2xl p-10 text-center animate-fade-in">
              <Zap className="w-10 h-10 text-primary/40 mx-auto mb-3" />
              <h2 className="font-display text-xl mb-1">Nenhum match ainda</h2>
              <p className="text-sm text-muted-foreground mb-5">
                Marque livros como "disponível pra troca" e adicione livros à lista de desejos. Quando houver complementaridade com outro leitor, avisamos por aqui.
              </p>
              <Link to="/biblioteca">
                <Button variant="hero">Ir para Biblioteca</Button>
              </Link>
            </div>
          ) : (
            <ul className="space-y-3 animate-stagger">
              {matches.map((mm) => (
                <li key={mm.id}>
                  <button
                    onClick={() => { setActiveMatchId(mm.id); setSearchParams({ match: mm.id }); }}
                    className="w-full glass rounded-2xl p-4 hover:border-primary/40 transition-all flex items-center gap-4 text-left"
                  >
                    <div className="relative shrink-0">
                      {mm.book && <BookCover book={mm.book} size="sm" />}
                      <Zap className="absolute -top-1 -right-1 w-5 h-5 text-primary bg-background rounded-full p-0.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] uppercase tracking-widest text-primary font-bold">Match!</p>
                      <p className="font-display font-semibold line-clamp-1">{mm.book?.title || "Livro"}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {mm.iAmWisher
                          ? <><strong>{mm.other?.display_name || "Alguém"}</strong> tem pra troca</>
                          : <><strong>{mm.other?.display_name || "Alguém"}</strong> quer este livro</>}
                      </p>
                    </div>
                    <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {tab !== "matches" && (
          <>
        {loading ? (

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : visible.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center animate-fade-in">
            <Sparkles className="w-10 h-10 text-primary/40 mx-auto mb-3" />
            <h2 className="font-display text-xl mb-1">Nenhuma troca por aqui</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Marque livros como "disponível para troca" na sua biblioteca e veja propostas chegando.
            </p>
            <Link to="/biblioteca">
              <Button variant="hero">Ir para Biblioteca</Button>
            </Link>
          </div>
        ) : (
          <ul className="space-y-4 animate-stagger">
            {visible.map((t) => {
              const iAmReceiver = t.receiver_id === user?.id;
              const other = iAmReceiver ? t.proposer : t.receiver;
              const myBook = iAmReceiver ? t.receiver_book : t.proposer_book;
              const theirBook = iAmReceiver ? t.proposer_book : t.receiver_book;
              return (
                <li key={t.id} className="glass rounded-2xl p-5 hover:border-primary/30 transition-all">
                  <div className="flex items-center gap-3 mb-4">
                    <Link to={profilePath(other)}>
                      <Avatar className="w-9 h-9">
                        <AvatarImage src={other?.avatar_url} />
                        <AvatarFallback className="bg-gradient-gold text-primary-foreground text-xs">
                          {(other?.display_name || "?").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </Link>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">
                        {iAmReceiver ? "Proposta de" : "Para"}{" "}
                        <Link to={profilePath(other)} className="hover:text-primary transition-colors">
                          {other?.display_name || "Leitor"}
                        </Link>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(t.created_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 font-semibold">
                        {iAmReceiver ? "Você dá" : "Você dá"}
                      </p>
                      {myBook && (
                        <Link to={`/livro/${myBook.id}`} className="block group">
                          <BookCover book={myBook} size="sm" className="mx-auto" />
                          <p className="text-xs font-medium mt-2 line-clamp-2 group-hover:text-primary transition-colors">{myBook.title}</p>
                        </Link>
                      )}
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] uppercase tracking-wider text-primary mb-1.5 font-semibold flex items-center justify-center gap-1">
                        <ArrowRightLeft className="w-3 h-3" /> Você recebe
                      </p>
                      {theirBook && (
                        <Link to={`/livro/${theirBook.id}`} className="block group">
                          <BookCover book={theirBook} size="sm" className="mx-auto" />
                          <p className="text-xs font-medium mt-2 line-clamp-2 group-hover:text-primary transition-colors">{theirBook.title}</p>
                        </Link>
                      )}
                    </div>
                  </div>

                  {t.message && (
                    <p className="text-sm italic mt-4 px-3 py-2 bg-muted/30 rounded-lg text-foreground/80">
                      "{t.message}"
                    </p>
                  )}

                  <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border/40">
                    {t.status === "pending" && iAmReceiver && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => update(t.id, "declined")} disabled={pendingId === t.id} className="gap-1.5">
                          {pendingId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />} Recusar
                        </Button>
                        <Button size="sm" variant="hero" onClick={() => update(t.id, "accepted")} disabled={pendingId === t.id} className="gap-1.5">
                          {pendingId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Aceitar
                        </Button>
                      </>
                    )}
                    {t.status === "pending" && !iAmReceiver && (
                      <Button size="sm" variant="outline" onClick={() => update(t.id, "cancelled")} disabled={pendingId === t.id}>
                        {pendingId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Cancelar"}
                      </Button>
                    )}
                    {t.status === "accepted" && (
                      <Button size="sm" variant="hero" onClick={() => update(t.id, "completed")} disabled={pendingId === t.id} className="gap-1.5">
                        {pendingId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Marcar como concluída
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

function StatusBadge({ status }: { status: Trade["status"] }) {
  const map = {
    pending: { label: "Pendente", cls: "bg-status-reading/15 text-status-reading border-status-reading/30" },
    accepted: { label: "Aceita", cls: "bg-primary/15 text-primary border-primary/30" },
    declined: { label: "Recusada", cls: "bg-destructive/15 text-destructive border-destructive/30" },
    completed: { label: "Concluída", cls: "bg-status-read/15 text-status-read border-status-read/30" },
    cancelled: { label: "Cancelada", cls: "bg-muted text-muted-foreground border-border" },
  } as const;
  const m = map[status];
  return <Badge variant="outline" className={m.cls}>{m.label}</Badge>;
}
