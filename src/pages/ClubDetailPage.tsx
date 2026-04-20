import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BookCover } from "@/components/books/BookCover";
import { ArrowLeft, Send, Loader2, Users, LogOut } from "lucide-react";
import { ClubBookOfTheMonth } from "@/components/clubs/ClubBookOfTheMonth";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { awardXp } from "@/lib/xp";

export default function ClubDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [club, setClub] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: c }, { data: ms }, { data: msgs }] = await Promise.all([
      supabase.from("book_clubs").select("*, current_book:books(*)").eq("id", id).maybeSingle(),
      supabase.from("club_members").select("user_id,role").eq("club_id", id),
      supabase.from("club_messages").select("*").eq("club_id", id).order("created_at", { ascending: true }).limit(200),
    ]);
    setClub(c);
    const userIds = [...new Set([...(ms || []).map((m: any) => m.user_id), ...(msgs || []).map((m: any) => m.user_id)])];
    const { data: profs } = userIds.length
      ? await supabase.from("profiles").select("id,display_name,username,avatar_url").in("id", userIds)
      : { data: [] as any[] };
    const profMap = new Map((profs || []).map((p: any) => [p.id, p]));
    setMembers((ms || []).map((m: any) => ({ ...m, profile: profMap.get(m.user_id) })));
    setMessages((msgs || []).map((m: any) => ({ ...m, profile: profMap.get(m.user_id) })));
    setLoading(false);
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 100);
  };

  useEffect(() => {
    load();
    if (!id) return;
    const ch = supabase
      .channel(`club:${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "club_messages", filter: `club_id=eq.${id}` },
        async (payload) => {
          const msg = payload.new as any;
          const { data: p } = await supabase.from("profiles").select("id,display_name,avatar_url").eq("id", msg.user_id).maybeSingle();
          setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, { ...msg, profile: p }]);
          setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 50);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  const isMember = !!user && members.some((m) => m.user_id === user.id);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !input.trim() || !id) return;
    setSending(true);
    const text = input.trim();
    setInput("");
    const { error } = await supabase.from("club_messages").insert({ club_id: id, user_id: user.id, content: text });
    if (error) { toast.error("Erro ao enviar"); setInput(text); }
    else { void awardXp(user.id, "club_message", { silent: true }); }
    setSending(false);
  };

  const leave = async () => {
    if (!user || !id) return;
    const { error } = await supabase.from("club_members").delete().eq("club_id", id).eq("user_id", user.id);
    if (error) toast.error("Erro ao sair");
    else { toast.success("Saiu do clube"); load(); }
  };

  const join = async () => {
    if (!user || !id) return;
    const { error } = await supabase.from("club_members").insert({ club_id: id, user_id: user.id });
    if (error) toast.error("Erro ao entrar");
    else { toast.success("Bem-vindo!"); load(); }
  };

  if (loading) return <AppShell><div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div></AppShell>;
  if (!club) return <AppShell><div className="px-6 py-20 text-center"><p>Clube não encontrado</p><Link to="/clubes" className="text-primary underline">Voltar</Link></div></AppShell>;

  return (
    <AppShell>
      <div className="px-5 md:px-10 pt-6 pb-6 max-w-4xl mx-auto">
        <Link to="/clubes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-4">
          <ArrowLeft className="w-4 h-4" /> Clubes
        </Link>
        <div className="glass rounded-2xl p-5 flex flex-col md:flex-row gap-4 items-start mb-4">
          <div className="flex-1">
            <h1 className="font-display text-2xl font-bold">{club.name}</h1>
            {club.description && <p className="text-sm text-muted-foreground mt-1">{club.description}</p>}
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1"><Users className="w-3 h-3" /> {members.length} {members.length === 1 ? "membro" : "membros"}</p>
          </div>
          {club.current_book && (
            <Link to={`/livro/${club.current_book.id}`} className="flex gap-3 items-center group">
              <BookCover book={club.current_book} size="sm" />
              <div>
                <p className="text-xs text-muted-foreground">Lendo agora</p>
                <p className="font-semibold text-sm group-hover:text-primary transition-colors">{club.current_book.title}</p>
              </div>
            </Link>
          )}
          {isMember && club.owner_id !== user?.id && (
            <Button variant="ghost" size="sm" onClick={leave} className="gap-1.5"><LogOut className="w-3.5 h-3.5" /> Sair</Button>
          )}
        </div>

        <div className="mb-4">
          <ClubBookOfTheMonth
            clubId={id!}
            isOwner={club.owner_id === user?.id}
            isMember={isMember}
            onCrown={() => load()}
          />
        </div>
      </div>

      <div className="px-5 md:px-10 max-w-4xl mx-auto pb-24">
        {!isMember ? (
          <div className="glass rounded-2xl p-8 text-center">
            <Users className="w-10 h-10 text-primary mx-auto mb-3" />
            <p className="mb-4">Entre no clube para ver e enviar mensagens</p>
            <Button variant="hero" onClick={join}>Entrar no clube</Button>
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="glass rounded-2xl p-4 h-[55vh] overflow-y-auto space-y-3 mb-3">
              {messages.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-10">Nenhuma mensagem ainda. Comece a conversa!</p>
              ) : (
                messages.map((m) => {
                  const mine = m.user_id === user?.id;
                  return (
                    <div key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                      <Avatar className="w-8 h-8 shrink-0">
                        <AvatarImage src={m.profile?.avatar_url} />
                        <AvatarFallback className="text-xs bg-gradient-gold text-primary-foreground">
                          {(m.profile?.display_name || "?").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className={`max-w-[75%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                        <p className="text-xs text-muted-foreground mb-0.5">
                          {m.profile?.display_name || "Leitor"} · {formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: ptBR })}
                        </p>
                        <div className={`rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                          {m.content}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <form onSubmit={send} className="flex gap-2">
              <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Mensagem..." disabled={sending} maxLength={2000} />
              <Button type="submit" variant="hero" size="icon" disabled={sending || !input.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </>
        )}
      </div>
    </AppShell>
  );
}
