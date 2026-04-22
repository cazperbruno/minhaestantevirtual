import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EyeOff, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  /** Página atual marcada como spoiler. null = sem spoiler. */
  value: number | null;
  /** Callback quando muda. null = remove o marcador. */
  onChange: (value: number | null) => void;
  /** Total de páginas do livro do mês (opcional, para validar). */
  maxPage?: number | null;
  className?: string;
}

/**
 * Botão para marcar a próxima mensagem como contendo spoiler até determinada página.
 * Quando ativo (value != null), aparece como toggle aceso.
 */
export function SpoilerComposeButton({ value, onChange, maxPage, className }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string>(value ? String(value) : "");

  const active = value != null;

  const apply = () => {
    const n = parseInt(draft, 10);
    if (!isFinite(n) || n <= 0) {
      onChange(null);
    } else if (maxPage && n > maxPage) {
      onChange(maxPage);
    } else {
      onChange(n);
    }
    setOpen(false);
  };

  const clear = () => {
    setDraft("");
    onChange(null);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft(value ? String(value) : "");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant={active ? "default" : "outline"}
          className={cn(
            "shrink-0 h-10 w-10 rounded-xl",
            active && "bg-primary text-primary-foreground",
            className,
          )}
          aria-label={active ? `Spoiler até página ${value}` : "Marcar como spoiler"}
          title={active ? `Spoiler até página ${value}` : "Marcar como spoiler"}
        >
          <EyeOff className="w-4 h-4" />
          {active && (
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold rounded-full px-1 min-w-[16px] h-4 inline-flex items-center justify-center border border-background">
              {value}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-2">
        <p className="text-xs font-semibold inline-flex items-center gap-1.5">
          <EyeOff className="w-3.5 h-3.5 text-primary" /> Marcar como spoiler
        </p>
        <p className="text-[11px] text-muted-foreground">
          Quem ainda não chegou nessa página verá um borrão até clicar para revelar.
        </p>
        <div className="flex gap-2">
          <Input
            type="number"
            min={1}
            max={maxPage ?? undefined}
            placeholder="Página (ex: 120)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                apply();
              }
            }}
            className="h-9 text-sm"
            autoFocus
          />
          <Button type="button" size="sm" variant="hero" className="h-9" onClick={apply}>
            OK
          </Button>
        </div>
        {active && (
          <button
            type="button"
            onClick={clear}
            className="text-[11px] text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Remover marcação
          </button>
        )}
        {maxPage && (
          <p className="text-[10px] text-muted-foreground">Livro tem {maxPage} páginas.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
