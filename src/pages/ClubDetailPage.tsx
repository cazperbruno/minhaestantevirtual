import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BookCover } from "@/components/books/BookCover";
import {
  ArrowLeft, Send, Loader2, Users, LogOut, Lock, Globe2, Clock, Crown, X, Reply,
  MessageSquare, BookOpen, Activity, Quote,
} from "lucide-react";
import { ClubBookOfTheMonth } from "@/components/clubs/ClubBookOfTheMonth";
import { ClubAdminPanel } from "@/components/clubs/ClubAdminPanel";
import { ClubActivityPanel } from "@/components/clubs/ClubActivityPanel";
import { ClubBookProgress } from "@/components/clubs/ClubBookProgress";
import { MessageReactions } from "@/components/clubs/MessageReactions";
import { QuoteAttachDialog, QuoteBlock, type BookQuotePayload } from "@/components/clubs/QuoteAttachDialog";
import { useMyJoinRequest, useRequestJoin } from "@/hooks/useClubAccess";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { awardXp } from "@/lib/xp";
import { TypingIndicator } from "@/components/social/TypingIndicator";
import { profilePath } from "@/lib/profile-path";
import { cn } from "@/lib/utils";
import { useClubPresence } from "@/hooks/useClubPresence";
import { useClubChatPresence } from "@/hooks/useClubChatPresence";
import { useClubReactions } from "@/hooks/useClubReactions";
import { ClubLeaderboard } from "@/components/clubs/ClubLeaderboard";
import { MentionInput } from "@/components/clubs/MentionInput";
import { MessageContent } from "@/components/clubs/MessageContent";
import { ReadingSprintPanel } from "@/components/clubs/ReadingSprintPanel";
import { SpoilerWrapper } from "@/components/clubs/SpoilerWrapper";
import { SpoilerComposeButton } from "@/components/clubs/SpoilerComposeButton";

interface Profile {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

interface Message {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  parent_id?: string | null;
  book_quote?: BookQuotePayload | null;
  spoiler_page?: number | null;
  profile?: Profile;
}

interface Member {
  user_id: string;
  role: string;
  profile?: Profile;
}

interface Club {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  owner_id: string;
  current_book?: { id: string; title: string; authors: string[]; cover_url: string | null } | null;
}

export default function ClubDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [club, setClub] = useState<Club | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [pendingQuote, setPendingQuote] = useState<BookQuotePayload | null>(null);
  const [tab, setTab] = useState<string>("chat");
  const [pendingSpoilerPage, setPendingSpoilerPage] = useState<number | null>(null);
  const [myCurrentPage, setMyCurrentPage] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sendTypingRef = useRef<(() => void) | null>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: c }, { data: ms }, { data: msgs }] = await Promise.all([
      supabase.from("book_clubs").select("*, current_book:books(*)").eq("id", id).maybeSingle(),
      supabase.from("club_members").select("user_id,role").eq("club_id", id),
      supabase
        .from("club_messages")
        .select("*")
        .eq("club_id", id)
        .order("created_at", { ascending: true })
        .limit(200),
    ]);
    setClub(c as Club);
    const userIds = [
      ...new Set([
        ...(ms || []).map((m) => m.user_id),
        ...(msgs || []).map((m) => m.user_id),
      ]),
    ];
    const { data: profs } = userIds.length
      ? await supabase
          .from("profiles")
          .select("id,display_name,username,avatar_url")
          .in("id", userIds)
      : { data: [] as Profile[] };
    const profMap = new Map((profs || []).map((p) => [p.id, p as Profile]));
    setMembers((ms || []).map((m) => ({ ...m, profile: profMap.get(m.user_id) })));
    setMessages(
      ((msgs || []) as any[]).map((m) => ({
        ...m,
        book_quote: (m.book_quote as BookQuotePayload | null) ?? null,
        profile: profMap.get(m.user_id),
      })) as Message[],
    );
    setLoading(false);
    setTimeout(
      () => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }),
      100,
    );
  };

  useEffect(() => {
    load();
    if (!id) return;
    const ch = supabase
      .channel(`club:${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "club_messages", filter: `club_id=eq.${id}` },
        async (payload) => {
          const raw = payload.new as any;
          const msg: Message = {
            ...raw,
            book_quote: (raw.book_quote as BookQuotePayload | null) ?? null,
          };
          const { data: p } = await supabase
            .from("profiles")
            .select("id,display_name,username,avatar_url")
            .eq("id", msg.user_id)
            .maybeSingle();
          setMessages((prev) =>
            prev.some((m) => m.id === msg.id)
              ? prev
              : [...prev, { ...msg, profile: p as Profile }],
          );
          setTimeout(
            () =>
              scrollRef.current?.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: "smooth",
              }),
            50,
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "club_messages", filter: `club_id=eq.${id}` },
        (payload) => {
          const old = payload.old as { id: string };
          setMessages((prev) => prev.filter((m) => m.id !== old.id));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "club_members", filter: `club_id=eq.${id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const isMember = !!user && members.some((m) => m.user_id === user.id);
  const isOwner = !!user && club?.owner_id === user.id;
  const { data: myRequest } = useMyJoinRequest(user?.id, id);
  const requestJoin = useRequestJoin(id || "", user?.id);

  // Página atual do leitor no livro do mês — usado para esconder spoilers além disso
  useEffect(() => {
    const bookId = club?.current_book?.id;
    if (!user?.id || !bookId) {
      setMyCurrentPage(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_books")
        .select("current_page")
        .eq("user_id", user.id)
        .eq("book_id", bookId)
        .maybeSingle();
      if (!cancelled) setMyCurrentPage((data as { current_page: number | null } | null)?.current_page ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, club?.current_book?.id]);

  // Heartbeat de presença para "online agora" na categoria
  useClubPresence(id, isMember);

  // Realtime presence: quem está vendo o clube agora
  const onlineNow = useClubChatPresence(
    isMember ? id : undefined,
    user
      ? {
          id: user.id,
          display_name:
            user.user_metadata?.display_name || user.email?.split("@")[0] || "Leitor",
          avatar_url: user.user_metadata?.avatar_url ?? null,
        }
      : null,
  );

  // Map id -> mensagem para resolver parent (thread snippet)
  const messageMap = new Map(messages.map((m) => [m.id, m]));

  // Reactions em tempo real
  const messageIds = messages.map((m) => m.id);
  const { reactions, toggle: toggleReaction } = useClubReactions(
    isMember ? id : undefined,
    messageIds,
  );

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !input.trim() || !id) return;
    setSending(true);
    const text = input.trim();
    const quoteToSend = pendingQuote;
    const parentToSend = replyTo;
    const spoilerToSend = pendingSpoilerPage;
    setInput("");
    setReplyTo(null);
    setPendingQuote(null);
    setPendingSpoilerPage(null);
    const { error } = await supabase.from("club_messages").insert({
      club_id: id,
      user_id: user.id,
      content: text,
      parent_id: parentToSend?.id ?? null,
      book_quote: (quoteToSend as any) ?? null,
      spoiler_page: spoilerToSend ?? null,
    } as any);
    if (error) {
      toast.error("Mensagem não enviada", { description: "Verifique sua conexão." });
      setInput(text);
      setReplyTo(parentToSend);
      setPendingQuote(quoteToSend);
      setPendingSpoilerPage(spoilerToSend);
    } else {
      void awardXp(user.id, "club_message", { silent: true });
    }
    setSending(false);
  };

  const deleteMessage = async (msg: Message) => {
    if (!user || msg.user_id !== user.id) return;
    const { error } = await supabase.from("club_messages").delete().eq("id", msg.id);
    if (error) toast.error("Não consegui apagar");
  };

  const startReply = (msg: Message) => {
    setReplyTo(msg);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const leave = async () => {
    if (!user || !id) return;
    const { error } = await supabase
      .from("club_members")
      .delete()
      .eq("club_id", id)
      .eq("user_id", user.id);
    if (error) toast.error("Não conseguimos sair do clube agora");
    else {
      toast.success("Você saiu do clube");
      load();
    }
  };

  const join = async () => {
    if (!user || !id || !club) return;
    if (club.is_public) {
      const { error } = await supabase
        .from("club_members")
        .insert({ club_id: id, user_id: user.id });
      if (error) toast.error("Não conseguimos entrar no clube agora");
      else {
        toast.success("Bem-vindo ao clube!");
        load();
      }
    }
  };

  if (loading)
    return (
      <AppShell>
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  if (!club)
    return (
      <AppShell>
        <div className="px-6 py-20 text-center">
          <p>Clube não encontrado</p>
          <Link to="/clubes" className="text-primary underline">
            Voltar
          </Link>
        </div>
      </AppShell>
    );

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-6 max-w-4xl mx-auto">
        <Link
          to="/clubes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Clubes
        </Link>

        {/* HEADER compacto */}
        <div className="glass rounded-2xl p-5 mb-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="font-display text-2xl font-bold leading-tight">{club.name}</h1>
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full inline-flex items-center gap-1",
                    club.is_public
                      ? "bg-muted/50 text-muted-foreground"
                      : "bg-primary/15 text-primary",
                  )}
                >
                  {club.is_public ? <Globe2 className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                  {club.is_public ? "Público" : "Privado"}
                </span>
              </div>
              {club.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{club.description}</p>
              )}
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <Link
                  to={`/clubes/${id}/membros`}
                  className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 transition-colors"
                >
                  <Users className="w-3 h-3" /> {members.length}{" "}
                  {members.length === 1 ? "membro" : "membros"}
                </Link>
                {isMember && onlineNow.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-500">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    {onlineNow.length} {onlineNow.length === 1 ? "online" : "online"}
                  </span>
                )}
              </div>
            </div>

            {isMember && club.owner_id !== user?.id && (
              <Button variant="ghost" size="sm" onClick={leave} className="gap-1.5 shrink-0">
                <LogOut className="w-3.5 h-3.5" /> Sair
              </Button>
            )}
          </div>

          {/* Avatares dos primeiros membros (com destaque para online) */}
          {members.length > 0 && (
            <div className="mt-4 flex items-center gap-2">
              <div className="flex -space-x-2">
                {members.slice(0, 6).map((m) => {
                  const isOnline = onlineNow.some((p) => p.user_id === m.user_id);
                  return (
                    <Link
                      key={m.user_id}
                      to={profilePath({
                        username: m.profile?.username,
                        id: m.user_id,
                      })}
                      title={`${m.profile?.display_name || "Leitor"}${isOnline ? " · online" : ""}`}
                      className="relative"
                    >
                      <Avatar className="w-7 h-7 border-2 border-background hover:scale-110 transition-transform">
                        <AvatarImage src={m.profile?.avatar_url || undefined} />
                        <AvatarFallback className="text-[10px] bg-gradient-gold text-primary-foreground">
                          {(m.profile?.display_name || "?").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {isOnline && (
                        <span
                          aria-hidden
                          className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-background"
                        />
                      )}
                    </Link>
                  );
                })}
              </div>
              {members.length > 6 && (
                <Link
                  to={`/clubes/${id}/membros`}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  +{members.length - 6}
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* CONTEÚDO: tabs ou estado de não-membro */}
      <div className="px-5 md:px-10 max-w-4xl mx-auto pb-24">
        {!isMember ? (
          <div className="glass rounded-2xl p-8 text-center">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-3">
              {club.is_public ? (
                <>
                  <Globe2 className="w-3.5 h-3.5" /> Clube público
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" /> Clube privado
                </>
              )}
            </div>
            <Users className="w-10 h-10 text-primary mx-auto mb-3" />
            {club.is_public ? (
              <>
                <p className="mb-4">Entre no clube para ver e enviar mensagens</p>
                <Button variant="hero" onClick={join}>
                  Entrar no clube
                </Button>
              </>
            ) : myRequest?.status === "pending" ? (
              <>
                <p className="mb-2 font-semibold">Solicitação enviada</p>
                <p className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Aguardando aprovação do administrador
                </p>
              </>
            ) : myRequest?.status === "rejected" ? (
              <p className="text-sm text-muted-foreground">
                Sua solicitação anterior foi recusada.
              </p>
            ) : (
              <>
                <p className="mb-4">
                  Esse clube é privado. Solicite entrada para participar das discussões.
                </p>
                <Button
                  variant="hero"
                  disabled={requestJoin.isPending || !user}
                  onClick={() => requestJoin.mutate(null)}
                >
                  {requestJoin.isPending ? "Enviando…" : "Solicitar entrada"}
                </Button>
              </>
            )}
          </div>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="grid grid-cols-3 w-full h-11 bg-muted/40">
              <TabsTrigger value="chat" className="gap-1.5 data-[state=active]:bg-background">
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Chat</span>
              </TabsTrigger>
              <TabsTrigger value="book" className="gap-1.5 data-[state=active]:bg-background">
                <BookOpen className="w-3.5 h-3.5" />
                <span>Livro</span>
              </TabsTrigger>
              <TabsTrigger value="members" className="gap-1.5 data-[state=active]:bg-background">
                <Activity className="w-3.5 h-3.5" />
                <span>Atividade</span>
              </TabsTrigger>
            </TabsList>

            {/* TAB: CHAT */}
            <TabsContent value="chat" className="mt-4 space-y-3">
              {/* Sprint de leitura */}
              {id && (
                <ReadingSprintPanel
                  clubId={id}
                  currentUserId={user?.id ?? null}
                  isOwner={isOwner}
                />
              )}

              {/* Mini-progresso do livro do mês */}
              {club.current_book && id && (
                <ClubBookProgress clubId={id} compact bookTitle={club.current_book.title} />
              )}

              <div
                ref={scrollRef}
                className="glass rounded-2xl p-4 h-[55vh] overflow-y-auto space-y-3"
              >
                {messages.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-10">
                    Nenhuma mensagem ainda. Comece a conversa!
                  </p>
                ) : (
                  messages.map((m) => {
                    const mine = m.user_id === user?.id;
                    const isOwnerMsg = m.user_id === club.owner_id;
                    const isOnline = onlineNow.some((p) => p.user_id === m.user_id);
                    const link = profilePath({
                      username: m.profile?.username,
                      id: m.user_id,
                    });
                    return (
                      <div
                        key={m.id}
                        className={cn("flex gap-2 group/msg", mine ? "flex-row-reverse" : "")}
                      >
                        <Link to={link} className="shrink-0 relative">
                          <Avatar className="w-8 h-8 hover:ring-2 hover:ring-primary/40 transition-all">
                            <AvatarImage src={m.profile?.avatar_url || undefined} />
                            <AvatarFallback className="text-xs bg-gradient-gold text-primary-foreground">
                              {(m.profile?.display_name || "?").charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          {isOnline && (
                            <span
                              aria-hidden
                              className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-background"
                            />
                          )}
                        </Link>
                        <div
                          className={cn(
                            "max-w-[75%] flex flex-col",
                            mine ? "items-end" : "items-start",
                          )}
                        >
                          <p className="text-xs text-muted-foreground mb-0.5 inline-flex items-center gap-1">
                            <Link
                              to={link}
                              className="hover:text-primary transition-colors truncate max-w-[140px]"
                            >
                              {m.profile?.display_name || "Leitor"}
                            </Link>
                            {isOwnerMsg && (
                              <Crown className="w-3 h-3 text-primary shrink-0" aria-label="Dono do clube" />
                            )}
                            <span>·</span>
                            <span>
                              {formatDistanceToNow(new Date(m.created_at), {
                                addSuffix: true,
                                locale: ptBR,
                              })}
                            </span>
                          </p>
                          {/* Snippet do parent (thread) */}
                          {m.parent_id &&
                            (() => {
                              const parent = messageMap.get(m.parent_id!);
                              if (!parent) {
                                return (
                                  <div className="text-[10px] text-muted-foreground italic mb-1 inline-flex items-center gap-1">
                                    <Reply className="w-2.5 h-2.5" /> mensagem original removida
                                  </div>
                                );
                              }
                              return (
                                <div className="mb-1 max-w-full rounded-lg border-l-2 border-primary/40 bg-muted/30 pl-2 pr-2 py-1 text-[11px] text-muted-foreground">
                                  <span className="font-semibold text-foreground/80">
                                    {parent.profile?.display_name || "Leitor"}
                                  </span>
                                  <span className="ml-1 line-clamp-1">
                                    <MessageContent
                                      text={parent.content.slice(0, 80) + (parent.content.length > 80 ? "…" : "")}
                                      members={members.map((mb) => ({
                                        user_id: mb.user_id,
                                        username: mb.profile?.username ?? null,
                                        display_name: mb.profile?.display_name ?? null,
                                      }))}
                                    />
                                  </span>
                                </div>
                              );
                            })()}

                          <SpoilerWrapper
                            spoilerPage={m.spoiler_page ?? null}
                            readerPage={mine ? Number.MAX_SAFE_INTEGER : myCurrentPage}
                          >
                            <div
                              className={cn(
                                "rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words",
                                mine ? "bg-primary text-primary-foreground" : "bg-muted",
                              )}
                            >
                              {m.book_quote && <QuoteBlock quote={m.book_quote} />}
                              <MessageContent
                                text={m.content}
                                members={members.map((mb) => ({
                                  user_id: mb.user_id,
                                  username: mb.profile?.username ?? null,
                                  display_name: mb.profile?.display_name ?? null,
                                }))}
                                highlightClassName={mine ? "text-primary-foreground" : "text-primary"}
                              />
                            </div>
                          </SpoilerWrapper>

                          <MessageReactions
                            messageId={m.id}
                            reactions={reactions.filter((r) => r.message_id === m.id)}
                            currentUserId={user?.id ?? null}
                            onToggle={toggleReaction}
                            align={mine ? "end" : "start"}
                          />

                          <div className="opacity-0 group-hover/msg:opacity-100 sm:opacity-0 sm:group-hover/msg:opacity-100 transition-opacity flex gap-1 mt-1">
                            <button
                              onClick={() => startReply(m)}
                              className="text-[10px] text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                              aria-label="Responder mensagem"
                            >
                              <Reply className="w-3 h-3" /> Responder
                            </button>
                            {mine && (
                              <button
                                onClick={() => deleteMessage(m)}
                                className="text-[10px] text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
                                aria-label="Apagar mensagem"
                              >
                                <X className="w-3 h-3" /> Apagar
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="min-h-[28px]">
                <TypingIndicator
                  channelKey={`club-${id}`}
                  displayName={user?.user_metadata?.display_name || user?.email?.split("@")[0]}
                  registerSendTyping={(fn) => {
                    sendTypingRef.current = fn;
                  }}
                />
              </div>

              {replyTo && (
                <div className="flex items-center gap-2 rounded-xl bg-muted/50 border border-border/40 px-3 py-2 text-xs">
                  <Reply className="w-3 h-3 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-muted-foreground">Respondendo </span>
                    <span className="font-semibold">
                      {replyTo.profile?.display_name || "leitor"}:
                    </span>{" "}
                    <span className="text-muted-foreground truncate">
                      {replyTo.content.slice(0, 60)}
                      {replyTo.content.length > 60 ? "…" : ""}
                    </span>
                  </div>
                  <button
                    onClick={() => setReplyTo(null)}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    aria-label="Cancelar resposta"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {pendingQuote && (
                <div className="rounded-xl bg-primary/5 border border-primary/30 px-3 py-2 text-xs">
                  <div className="flex items-start gap-2">
                    <Quote className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-primary mb-0.5">
                        Citação anexada
                        {pendingQuote.book_title && ` · ${pendingQuote.book_title}`}
                        {pendingQuote.page && ` (p. ${pendingQuote.page})`}
                      </p>
                      <p className="italic text-muted-foreground line-clamp-2">
                        "{pendingQuote.text}"
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingQuote(null)}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                      aria-label="Remover citação"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={send} className="flex gap-2">
                <QuoteAttachDialog
                  currentBook={club.current_book ? { id: club.current_book.id, title: club.current_book.title } : null}
                  onAttach={(q) => setPendingQuote(q)}
                />
                <MentionInput
                  ref={inputRef}
                  value={input}
                  onChange={setInput}
                  onTyping={() => sendTypingRef.current?.()}
                  placeholder={replyTo ? "Sua resposta... (use @ para mencionar)" : pendingQuote ? "Comente a citação..." : "Mensagem... use @ para mencionar"}
                  disabled={sending}
                  maxLength={2000}
                  members={members
                    .filter((m) => m.user_id !== user?.id)
                    .map((m) => ({
                      user_id: m.user_id,
                      display_name: m.profile?.display_name ?? null,
                      username: m.profile?.username ?? null,
                      avatar_url: m.profile?.avatar_url ?? null,
                    }))}
                />
                <Button
                  type="submit"
                  variant="hero"
                  size="icon"
                  disabled={sending || !input.trim()}
                  aria-label="Enviar mensagem"
                >
                  <Send className="w-4 h-4" aria-hidden="true" />
                </Button>
              </form>
            </TabsContent>

            {/* TAB: LIVRO */}
            <TabsContent value="book" className="mt-4 space-y-4">
              {club.current_book && (
                <Link
                  to={`/livro/${club.current_book.id}`}
                  className="flex gap-3 items-center group rounded-2xl glass p-4 hover:border-primary/40 transition-all"
                >
                  <BookCover book={club.current_book} size="md" />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-primary font-semibold">
                      Lendo agora
                    </p>
                    <p className="font-semibold text-base group-hover:text-primary transition-colors line-clamp-2">
                      {club.current_book.title}
                    </p>
                    {club.current_book.authors?.[0] && (
                      <p className="text-xs text-muted-foreground truncate">
                        {club.current_book.authors.join(", ")}
                      </p>
                    )}
                  </div>
                </Link>
              )}

              {club.current_book && id && <ClubBookProgress clubId={id} />}

              <ClubBookOfTheMonth
                clubId={id!}
                isOwner={isOwner}
                isMember={isMember}
                onCrown={() => load()}
              />

              {isOwner && <ClubAdminPanel clubId={id!} ownerId={user!.id} />}
            </TabsContent>

            {/* TAB: ATIVIDADE / MEMBROS */}
            <TabsContent value="members" className="mt-4 space-y-4">
              {id && (
                <ClubLeaderboard
                  clubId={id}
                  isMember={isMember}
                  currentUserId={user?.id ?? null}
                />
              )}
              {id && <ClubActivityPanel clubId={id} isMember={isMember} />}

              <div className="glass rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display text-lg font-semibold inline-flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" /> Membros ({members.length})
                  </h3>
                  <Link
                    to={`/clubes/${id}/membros`}
                    className="text-xs text-primary hover:underline"
                  >
                    Ver todos
                  </Link>
                </div>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {members.slice(0, 12).map((m) => {
                    const isOnline = onlineNow.some((p) => p.user_id === m.user_id);
                    const link = profilePath({
                      username: m.profile?.username,
                      id: m.user_id,
                    });
                    return (
                      <li key={m.user_id}>
                        <Link
                          to={link}
                          className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/40 transition-colors"
                        >
                          <div className="relative shrink-0">
                            <Avatar className="w-9 h-9">
                              <AvatarImage src={m.profile?.avatar_url || undefined} />
                              <AvatarFallback className="text-xs bg-gradient-gold text-primary-foreground">
                                {(m.profile?.display_name || "?").charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            {isOnline && (
                              <span
                                aria-hidden
                                className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-background"
                              />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold truncate inline-flex items-center gap-1">
                              {m.profile?.display_name || "Leitor"}
                              {m.user_id === club.owner_id && (
                                <Crown className="w-3 h-3 text-primary shrink-0" />
                              )}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {isOnline ? "Online agora" : m.role === "owner" ? "Dono" : "Membro"}
                            </p>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppShell>
  );
}
