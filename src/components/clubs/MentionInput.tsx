import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export interface MentionMember {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onTyping?: () => void;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  members: MentionMember[];
  className?: string;
}

/**
 * Input com autocomplete de @menções. Mostra um popover de membros do clube
 * filtrado pelo termo após o `@`. Setas/Enter/Tab para selecionar, Esc fecha.
 */
export const MentionInput = forwardRef<HTMLInputElement, Props>(function MentionInput(
  { value, onChange, onTyping, placeholder, disabled, maxLength, members, className },
  ref,
) {
  const localRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => localRef.current as HTMLInputElement, []);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [anchorStart, setAnchorStart] = useState<number | null>(null);

  // Detecta se o cursor está em uma menção em andamento
  const detectMention = (text: string, caret: number) => {
    // procura o último @ antes do caret que esteja no início ou após espaço
    let i = caret - 1;
    while (i >= 0) {
      const ch = text[i];
      if (ch === "@") {
        const prev = i > 0 ? text[i - 1] : " ";
        if (i === 0 || /\s/.test(prev)) {
          const term = text.slice(i + 1, caret);
          if (/^[A-Za-z0-9_\.]{0,30}$/.test(term)) {
            return { start: i, term };
          }
        }
        return null;
      }
      if (/\s/.test(ch)) return null;
      i--;
    }
    return null;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    onChange(next);
    onTyping?.();
    const caret = e.target.selectionStart ?? next.length;
    const m = detectMention(next, caret);
    if (m) {
      setAnchorStart(m.start);
      setQuery(m.term.toLowerCase());
      setActive(0);
      setOpen(true);
    } else {
      setOpen(false);
      setAnchorStart(null);
    }
  };

  const filtered = useMemo(() => {
    if (!open) return [] as MentionMember[];
    const q = query.trim();
    const score = (m: MentionMember) => {
      const u = (m.username || "").toLowerCase();
      const d = (m.display_name || "").toLowerCase();
      if (!q) return 1;
      if (u.startsWith(q)) return 3;
      if (d.startsWith(q)) return 2;
      if (u.includes(q) || d.includes(q)) return 1;
      return 0;
    };
    return members
      .map((m) => ({ m, s: score(m) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 6)
      .map((x) => x.m);
  }, [open, query, members]);

  const insertMention = (m: MentionMember) => {
    if (anchorStart == null) return;
    const username = m.username || (m.display_name || "leitor").toLowerCase().replace(/\s+/g, "");
    const before = value.slice(0, anchorStart);
    const afterCaret = localRef.current?.selectionStart ?? value.length;
    const after = value.slice(afterCaret);
    const insert = `@${username} `;
    const next = `${before}${insert}${after}`;
    onChange(next);
    setOpen(false);
    setAnchorStart(null);
    requestAnimationFrame(() => {
      const pos = (before + insert).length;
      localRef.current?.focus();
      localRef.current?.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(filtered[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  useEffect(() => {
    if (active >= filtered.length) setActive(0);
  }, [filtered.length, active]);

  return (
    <div className="relative flex-1">
      <Input
        ref={localRef}
        value={value}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        className={className}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div
          role="listbox"
          aria-label="Sugestões de menção"
          className="absolute bottom-full left-0 mb-1 z-50 w-64 max-w-[90vw] rounded-xl border border-border bg-popover shadow-lg overflow-hidden animate-fade-in"
        >
          {filtered.map((m, i) => {
            const username = m.username || (m.display_name || "leitor").toLowerCase().replace(/\s+/g, "");
            return (
              <button
                key={m.user_id}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(m);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                  i === active ? "bg-primary/10" : "hover:bg-muted/40",
                )}
              >
                <Avatar className="w-7 h-7 shrink-0">
                  <AvatarImage src={m.avatar_url || undefined} />
                  <AvatarFallback className="text-[10px] bg-gradient-gold text-primary-foreground">
                    {(m.display_name || "?").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{m.display_name || username}</p>
                  <p className="text-[11px] text-muted-foreground truncate">@{username}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
