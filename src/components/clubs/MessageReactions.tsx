import { useState } from "react";
import { Smile } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Reaction } from "@/hooks/useClubReactions";

const QUICK_EMOJIS = ["❤️", "🔥", "😂", "😮", "👏", "📚", "💡", "👀"];

interface Props {
  messageId: string;
  reactions: Reaction[]; // já filtradas para esta mensagem
  currentUserId: string | null;
  onToggle: (messageId: string, emoji: string, userId: string) => void;
  align?: "start" | "end";
}

/**
 * Stack agregada de reações + botão "+" para adicionar emoji.
 * Cada chip mostra o emoji e a contagem; clicar nele toggla a sua reação.
 */
export function MessageReactions({
  messageId,
  reactions,
  currentUserId,
  onToggle,
  align = "start",
}: Props) {
  const [open, setOpen] = useState(false);

  // Agrega: { emoji: { count, mine } }
  const grouped = reactions.reduce<Record<string, { count: number; mine: boolean }>>((acc, r) => {
    const cur = acc[r.emoji] || { count: 0, mine: false };
    cur.count += 1;
    if (currentUserId && r.user_id === currentUserId) cur.mine = true;
    acc[r.emoji] = cur;
    return acc;
  }, {});

  const entries = Object.entries(grouped);
  if (entries.length === 0 && !currentUserId) return null;

  return (
    <div className={cn("flex items-center gap-1 flex-wrap mt-1", align === "end" && "justify-end")}>
      {entries.map(([emoji, { count, mine }]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => currentUserId && onToggle(messageId, emoji, currentUserId)}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border transition-all",
            mine
              ? "bg-primary/15 border-primary/40 text-primary"
              : "bg-muted/40 border-border/40 hover:border-primary/30",
          )}
          aria-label={`Reagir com ${emoji}`}
        >
          <span className="leading-none">{emoji}</span>
          <span className="tabular-nums font-medium">{count}</span>
        </button>
      ))}

      {currentUserId && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full w-6 h-6 text-muted-foreground hover:text-primary hover:bg-muted/40 transition-colors opacity-0 group-hover/msg:opacity-100"
              aria-label="Adicionar reação"
            >
              <Smile className="w-3.5 h-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="p-2 w-auto" align={align === "end" ? "end" : "start"}>
            <div className="flex gap-1">
              {QUICK_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    onToggle(messageId, e, currentUserId);
                    setOpen(false);
                  }}
                  className="text-lg hover:scale-125 transition-transform p-1"
                  aria-label={`Reagir com ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
