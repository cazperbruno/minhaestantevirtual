import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Send, Loader2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Quais são os temas principais?",
  "Me dê um resumo sem spoilers",
  "Que livros parecidos eu poderia ler depois?",
  "Qual é o contexto histórico?",
];

export function BookChat({ bookId, bookTitle }: { bookId: string; bookTitle: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);

    let assistantSoFar = "";
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/book-chat`,
        {
          method: "POST",
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ bookId, messages: next }),
        },
      );

      if (resp.status === 429) { toast.error("Limite de IA atingido."); setLoading(false); return; }
      if (resp.status === 402) { toast.error("Créditos AI insuficientes."); setLoading(false); return; }
      if (!resp.ok || !resp.body) { toast.error("Erro na IA"); setLoading(false); return; }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, nl);
          textBuffer = textBuffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsert(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <Button variant="outline" size="lg" onClick={() => setOpen(true)} className="gap-2">
        <Sparkles className="w-4 h-4 text-primary" /> Conversar com IA
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-background/60 backdrop-blur-sm animate-fade-in" onClick={() => setOpen(false)}>
      <div
        className="glass rounded-t-3xl md:rounded-3xl w-full md:max-w-xl h-[85vh] md:h-[600px] flex flex-col border border-primary/20 shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <div>
              <p className="font-display font-semibold text-sm">Chat com IA</p>
              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{bookTitle}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)}><X className="w-4 h-4" /></Button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="text-center py-6">
              <Sparkles className="w-10 h-10 text-primary mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">Pergunte qualquer coisa sobre o livro</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary hover:text-primary transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2 text-sm",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}>
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm prose-invert max-w-none prose-p:my-1.5 prose-headings:my-2">
                      <ReactMarkdown>{m.content || "…"}</ReactMarkdown>
                    </div>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))
          )}
          {loading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex justify-start"><div className="bg-muted rounded-2xl px-4 py-2"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div></div>
          )}
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="p-3 border-t border-border/40 flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte sobre o livro..."
            disabled={loading}
            className="flex-1"
          />
          <Button type="submit" variant="hero" size="icon" disabled={loading || !input.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
