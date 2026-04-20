import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Trash2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { profilePath } from "@/lib/profile-path";
import { awardXp } from "@/lib/xp";

interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  profile?: { display_name: string | null; username: string | null; avatar_url: string | null };
}

type Target = "review" | "recommendation";

interface Props {
  /** Compat: id da resenha (modo legado). Use `targetId` + `target` para outros tipos. */
  reviewId?: string;
  targetId?: string;
  target?: Target;
  initialCount?: number;
}

export function CommentsThread({ reviewId, targetId, target = "review", initialCount = 0 }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [count, setCount] = useState(initialCount);

  const id = (targetId ?? reviewId) as string;
  const tableName = target === "recommendation" ? "recommendation_comments" : "review_comments";
  const fkColumn = target === "recommendation" ? "recommendation_id" : "review_id";

  const load = async () => {
    setLoading(true);
    const { data: cs } = await (supabase as any)
      .from(tableName)
      .select("*")
      .eq(fkColumn, id)
      .order("created_at", { ascending: true })
      .limit(200);
    const ids = [...new Set(((cs || []) as any[]).map((c: any) => c.user_id as string))];
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id,display_name,username,avatar_url").in("id", ids)
      : { data: [] as any[] };
    const m = new Map((profs || []).map((p: any) => [p.id, p]));
    setList((cs || []).map((c: any) => ({ ...c, profile: m.get(c.user_id) })));
    setLoading(false);
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id]);

  const send = async () => {
    if (!user) return toast.error("Entre para comentar");
    const content = text.trim();
    if (content.length < 1) return;
    setSending(true);
    const payload: any = { user_id: user.id, content };
    payload[fkColumn] = id;
    const { data, error } = await (supabase as any)
      .from(tableName)
      .insert(payload)
      .select()
      .single();
    setSending(false);
    if (error) {
      toast.error("Erro ao comentar");
      return;
    }
    const { data: prof } = await supabase
      .from("profiles").select("display_name,username,avatar_url").eq("id", user.id).maybeSingle();
    setList((prev) => [...prev, { ...(data as any), profile: prof }]);
    setCount((c) => c + 1);
    setText("");
    if (target === "review") void awardXp(user.id, "comment_review", { silent: true });
  };

  const remove = async (cid: string) => {
    const prev = list;
    setList((arr) => arr.filter((c) => c.id !== cid));
    setCount((c) => Math.max(0, c - 1));
    const { error } = await (supabase as any).from(tableName).delete().eq("id", cid);
    if (error) {
      setList(prev);
      setCount((c) => c + 1);
      toast.error("Erro ao remover");
    }
  };

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        className="gap-2 text-muted-foreground hover:text-primary"
      >
        <MessageSquare className="w-4 h-4" />
        <span className="tabular-nums">{count}</span>
      </Button>

      {open && (
        <div className="mt-3 pl-2 border-l-2 border-primary/20 space-y-3 animate-fade-in">
          {loading ? (
            <div className="py-3 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
          ) : list.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 italic">Seja a primeira pessoa a comentar.</p>
          ) : (
            <ul className="space-y-3">
              {list.map((c) => (
                <li key={c.id} className="flex gap-2.5 items-start group">
                  <Link to={profilePath({ id: c.user_id, username: c.profile?.username })}>
                    <Avatar className="w-7 h-7">
                      <AvatarImage src={c.profile?.avatar_url || undefined} />
                      <AvatarFallback className="bg-gradient-gold text-primary-foreground text-[10px]">
                        {(c.profile?.display_name || "?").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="bg-muted/40 rounded-2xl px-3 py-2">
                      <p className="text-xs font-semibold leading-tight">
                        {c.profile?.display_name || "Leitor"}
                      </p>
                      <p className="text-sm leading-snug mt-0.5 whitespace-pre-line break-words">{c.content}</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 ml-2">
                      {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>
                  {user?.id === c.user_id && (
                    <button
                      onClick={() => remove(c.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition p-1"
                      aria-label="Remover comentário"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {user && (
            <div className="flex gap-2 items-end pt-1">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Adicione um comentário..."
                rows={1}
                maxLength={1000}
                className="resize-none min-h-[38px] py-2 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <Button
                size="icon"
                variant="hero"
                onClick={send}
                disabled={sending || !text.trim()}
                className="shrink-0 h-9 w-9"
                aria-label="Enviar comentário"
              >
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Send className="w-3.5 h-3.5" aria-hidden="true" />}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
