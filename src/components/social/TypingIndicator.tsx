import { useEffect, useState } from "react";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { cn } from "@/lib/utils";

/**
 * Pílula que mostra "X está digitando..." com bolinhas animadas.
 * Conecta-se ao broadcast do canal especificado.
 */
export function TypingIndicator({
  channelKey,
  displayName,
  className,
  registerSendTyping,
}: {
  channelKey: string;
  displayName?: string;
  className?: string;
  /** Callback opcional para receber a função sendTyping e usar no input */
  registerSendTyping?: (fn: () => void) => void;
}) {
  const { typingUsers, sendTyping, subscribe } = useTypingIndicator(channelKey, displayName);
  const [, force] = useState(0);

  useEffect(() => {
    const off = subscribe(() => force((n) => n + 1));
    return () => { off(); };
  }, [subscribe]);

  useEffect(() => {
    registerSendTyping?.(sendTyping);
  }, [registerSendTyping, sendTyping]);

  if (typingUsers.length === 0) return null;

  const names = typingUsers.slice(0, 2).map((t) => t.display_name);
  const extra = typingUsers.length - names.length;
  const label =
    typingUsers.length === 1
      ? `${names[0]} está digitando`
      : extra > 0
      ? `${names.join(", ")} +${extra} digitando`
      : `${names.join(" e ")} estão digitando`;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/60 backdrop-blur-sm border border-border/40 animate-fade-in",
        className,
      )}
      aria-live="polite"
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-center gap-0.5">
        <span className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
      </span>
    </div>
  );
}
