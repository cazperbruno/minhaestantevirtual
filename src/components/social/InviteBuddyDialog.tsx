/**
 * InviteBuddyDialog — convida um seguidor para ler um livro juntos.
 * Lista pessoas que o usuário segue; clique para convidar.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCreateBuddyRead } from "@/hooks/useBuddyReads";
import { Users, BookOpen } from "lucide-react";

interface Props {
  bookId: string;
  bookTitle: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function InviteBuddyDialog({ bookId, bookTitle, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const create = useCreateBuddyRead();

  const { data: following = [] } = useQuery({
    queryKey: ["following-list", user?.id],
    enabled: open && !!user?.id,
    queryFn: async () => {
      const { data: f } = await supabase.from("follows")
        .select("following_id").eq("follower_id", user!.id).limit(50);
      const ids = (f ?? []).map((x) => x.following_id);
      if (!ids.length) return [];
      const { data: profs } = await supabase.from("profiles")
        .select("id,display_name,username,avatar_url").in("id", ids);
      return profs ?? [];
    },
  });

  const onInvite = async (inviteeId: string) => {
    await create.mutateAsync({ book_id: bookId, invitee_id: inviteeId, message });
    onOpenChange(false);
    setMessage("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" /> Buddy Reading
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 text-sm">
            <BookOpen className="w-3.5 h-3.5" /> {bookTitle}
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Mensagem opcional (ex: 'vamos terminar até sexta?')"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={200}
        />

        <div className="space-y-1 max-h-72 overflow-y-auto">
          {following.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Você precisa seguir alguém antes de convidar.
            </p>
          )}
          {following.map((p: any) => (
            <button
              key={p.id}
              onClick={() => onInvite(p.id)}
              disabled={create.isPending}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent/30 transition text-left disabled:opacity-50"
            >
              <Avatar className="w-9 h-9">
                <AvatarImage src={p.avatar_url ?? undefined} />
                <AvatarFallback>{(p.display_name ?? p.username ?? "?")[0]}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.display_name ?? p.username}</p>
                {p.username && <p className="text-xs text-muted-foreground truncate">@{p.username}</p>}
              </div>
              <Button size="sm" variant="outline">Convidar</Button>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
