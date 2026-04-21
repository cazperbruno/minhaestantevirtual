/**
 * BuddyReadDetailPage — sessão única: progresso lado a lado + chat realtime.
 */
import { useParams, Link } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import { useBuddyRead, useBuddyMessages, useUpdateBuddyProgress, useSendBuddyMessage } from "@/hooks/useBuddyReads";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Send, BookOpen, Trophy, Edit2 } from "lucide-react";

export default function BuddyReadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data, isLoading } = useBuddyRead(id);
  const { data: messages = [] } = useBuddyMessages(id);
  const sendMsg = useSendBuddyMessage(id!);
  const updateProgress = useUpdateBuddyProgress(id!);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [pageInput, setPageInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  if (isLoading || !data?.buddy) {
    return <div className="container mx-auto px-4 py-12 text-center text-muted-foreground">Carregando…</div>;
  }

  const buddy = data.buddy as any;
  const book = buddy.books;
  const totalPages = book?.page_count ?? 0;
  const me = data.participants.find((p: any) => p.user_id === user?.id) as any;
  const partner = data.participants.find((p: any) => p.user_id !== user?.id) as any;

  const handleProgress = async () => {
    const page = parseInt(pageInput, 10);
    if (isNaN(page) || page < 0) return;
    const percent = totalPages > 0 ? Math.min(100, (page / totalPages) * 100) : Math.min(100, page);
    await updateProgress.mutateAsync({ current_page: page, percent });
    setEditing(false);
    setPageInput("");
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl space-y-4">
      <Link to="/buddy" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>

      {/* Hero */}
      <Card className="p-4 flex gap-4">
        {book?.cover_url ? (
          <img src={book.cover_url} alt={book.title} className="w-20 h-28 object-cover rounded shadow" />
        ) : (
          <div className="w-20 h-28 rounded bg-muted flex items-center justify-center"><BookOpen className="w-6 h-6 text-muted-foreground" /></div>
        )}
        <div className="flex-1 min-w-0">
          <Link to={`/livro/${book?.id}`}><h1 className="font-bold text-lg leading-tight truncate hover:text-primary">{book?.title}</h1></Link>
          <p className="text-xs text-muted-foreground truncate">{(book?.authors ?? []).join(", ")}</p>
          {buddy.status === "completed" && (
            <Badge className="mt-2 bg-gradient-gold text-primary-foreground"><Trophy className="w-3 h-3 mr-1" /> Concluído!</Badge>
          )}
          {buddy.status === "active" && <Badge variant="outline" className="mt-2">Em andamento</Badge>}
        </div>
      </Card>

      {/* Progresso lado a lado */}
      <div className="grid grid-cols-2 gap-3">
        <ProgressCard label="Você" percent={Number(me?.percent ?? 0)} page={me?.current_page ?? 0} total={totalPages} finished={!!me?.finished_at} />
        <ProgressCard
          label={partner?.profiles?.display_name ?? "Parceiro"}
          avatar={partner?.profiles?.avatar_url}
          percent={Number(partner?.percent ?? 0)}
          page={partner?.current_page ?? 0}
          total={totalPages}
          finished={!!partner?.finished_at}
        />
      </div>

      {/* Atualizar progresso */}
      {buddy.status === "active" && (
        <Card className="p-3">
          {editing ? (
            <div className="flex gap-2">
              <Input
                type="number" min={0} max={totalPages || undefined}
                placeholder={totalPages ? `Página atual (de ${totalPages})` : "Página atual"}
                value={pageInput} onChange={(e) => setPageInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleProgress()}
              />
              <Button onClick={handleProgress} disabled={updateProgress.isPending || !pageInput}>Salvar</Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
            </div>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setEditing(true)}>
              <Edit2 className="w-4 h-4 mr-2" /> Atualizar minha página
            </Button>
          )}
        </Card>
      )}

      {/* Chat */}
      <Card className="flex flex-col h-[400px]">
        <div className="px-4 py-2 border-b border-border text-sm font-medium">Chat da leitura</div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
          {messages.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">Nenhuma mensagem ainda. Diga oi!</p>}
          {messages.map((m: any) => {
            const mine = m.user_id === user?.id;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] px-3 py-1.5 rounded-2xl text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {m.content}
                </div>
              </div>
            );
          })}
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); if (text.trim()) { sendMsg.mutate(text); setText(""); } }}
          className="border-t border-border p-2 flex gap-2"
        >
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Mensagem…" maxLength={500} />
          <Button type="submit" size="icon" disabled={!text.trim()}><Send className="w-4 h-4" /></Button>
        </form>
      </Card>
    </div>
  );
}

function ProgressCard({ label, percent, page, total, finished, avatar }: {
  label: string; percent: number; page: number; total: number; finished: boolean; avatar?: string | null;
}) {
  return (
    <Card className={`p-3 space-y-2 ${finished ? "border-primary/50" : ""}`}>
      <div className="flex items-center gap-2">
        {avatar !== undefined && (
          <Avatar className="w-6 h-6"><AvatarImage src={avatar ?? undefined} /><AvatarFallback>{label[0]}</AvatarFallback></Avatar>
        )}
        <span className="text-sm font-medium truncate">{label}</span>
        {finished && <Trophy className="w-3.5 h-3.5 text-primary ml-auto" />}
      </div>
      <Progress value={percent} className="h-2" />
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{total > 0 ? `pág. ${page}/${total}` : `${page} pgs`}</span>
        <span className="font-semibold">{Math.round(percent)}%</span>
      </div>
    </Card>
  );
}
