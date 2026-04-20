import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sparkles, Globe2, Lock, X, Loader2, Search } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useRecommendBook, useRecipientSuggestions } from "@/hooks/useRecommendations";

interface Props {
  bookId: string;
  bookTitle: string;
  trigger?: React.ReactNode;
}

interface Recipient {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

export function RecommendBookDialog({ bookId, bookTitle, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"public" | "private">("public");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  const [picked, setPicked] = useState<Recipient[]>([]);

  const { data: suggestions = [], isLoading: loadingSuggestions } = useRecipientSuggestions(debouncedSearch);
  const recommend = useRecommendBook(bookId);

  const submit = () => {
    if (tab === "private" && picked.length === 0) return;
    recommend.mutate(
      { isPublic: tab === "public", message, recipientIds: picked.map((p) => p.id) },
      {
        onSuccess: () => {
          setOpen(false);
          setMessage("");
          setPicked([]);
          setSearch("");
        },
      },
    );
  };

  const togglePick = (r: Recipient) => {
    setPicked((cur) =>
      cur.find((p) => p.id === r.id) ? cur.filter((p) => p.id !== r.id) : [...cur, r],
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-2">
            <Sparkles className="w-4 h-4" /> Recomendar
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Recomendar livro</DialogTitle>
          <p className="text-sm text-muted-foreground line-clamp-1">{bookTitle}</p>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mt-2">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="public" className="gap-2">
              <Globe2 className="w-3.5 h-3.5" /> Pública
            </TabsTrigger>
            <TabsTrigger value="private" className="gap-2">
              <Lock className="w-3.5 h-3.5" /> Privada
            </TabsTrigger>
          </TabsList>

          <TabsContent value="public" className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Aparecerá no feed dos seus seguidores. Outros leitores podem curtir e comentar.
            </p>
          </TabsContent>

          <TabsContent value="private" className="mt-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar leitor por nome ou @user"
                className="pl-9"
              />
            </div>

            {picked.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {picked.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => togglePick(p)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 text-primary text-xs px-2.5 py-1 hover:bg-primary/25 transition"
                  >
                    {p.display_name || p.username}
                    <X className="w-3 h-3" />
                  </button>
                ))}
              </div>
            )}

            <div className="max-h-48 overflow-y-auto -mx-1">
              {loadingSuggestions ? (
                <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
              ) : suggestions.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center italic">
                  {debouncedSearch ? "Nenhum leitor encontrado" : "Comece a digitar para buscar"}
                </p>
              ) : (
                <ul>
                  {suggestions.map((s: Recipient) => {
                    const active = !!picked.find((p) => p.id === s.id);
                    return (
                      <li key={s.id}>
                        <button
                          onClick={() => togglePick(s)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/50 transition text-left ${active ? "bg-primary/10" : ""}`}
                        >
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={s.avatar_url || undefined} />
                            <AvatarFallback className="text-xs">
                              {(s.display_name || "?").charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{s.display_name || s.username}</p>
                            {s.username && (
                              <p className="text-xs text-muted-foreground truncate">@{s.username}</p>
                            )}
                          </div>
                          {active && <span className="text-xs text-primary font-semibold">Selecionado</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">Máximo 20 destinatários por recomendação.</p>
          </TabsContent>
        </Tabs>

        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Por que vale a leitura? (opcional)"
          className="resize-none"
        />
        <p className="text-[10px] text-muted-foreground text-right">{message.length}/500</p>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            variant="hero"
            onClick={submit}
            disabled={recommend.isPending || (tab === "private" && picked.length === 0)}
            className="gap-2"
          >
            {recommend.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Recomendar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
