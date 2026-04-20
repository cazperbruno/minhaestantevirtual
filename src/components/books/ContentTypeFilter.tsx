/**
 * Filtro global de tipo de conteúdo.
 *
 * - Mostra APENAS os tipos que o usuário marcou no onboarding.
 * - Se só marcou 1 tipo, esconde (sem ruído).
 * - Estado é per-sessão (sessionStorage), não persiste entre sessões — o
 *   default é "todos os tipos do usuário".
 */
import { useEffect, useState } from "react";
import { useContentPrefs } from "@/hooks/useContentPrefs";
import { CONTENT_TYPE_LABEL, CONTENT_TYPE_ICON, type ContentType } from "@/types/book";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "content-filter-active";

export function useContentFilter() {
  const { data: prefs } = useContentPrefs();
  const [active, setActive] = useState<ContentType[] | null>(null);

  useEffect(() => {
    if (!prefs) return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ContentType[];
        // Mantém só os que ainda estão nas prefs do usuário
        const filtered = parsed.filter((t) => prefs.includes(t));
        setActive(filtered.length > 0 ? filtered : prefs);
        return;
      }
    } catch {
      /* ignore */
    }
    setActive(prefs);
  }, [prefs]);

  const update = (next: ContentType[]) => {
    const safe = next.length > 0 ? next : prefs || ["book"];
    setActive(safe);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    } catch {
      /* ignore */
    }
  };

  return { active: active || prefs || ["book"], available: prefs || ["book"], setActive: update };
}

interface Props {
  className?: string;
}

export function ContentTypeFilter({ className }: Props) {
  const { active, available, setActive } = useContentFilter();

  // Se usuário só curte 1 tipo, não mostra filtro (zero ruído)
  if (available.length <= 1) return null;

  const toggle = (t: ContentType) => {
    const next = active.includes(t)
      ? active.filter((x) => x !== t)
      : [...active, t];
    setActive(next);
  };

  return (
    <div
      role="group"
      aria-label="Filtrar por tipo de conteúdo"
      className={cn("flex flex-wrap gap-1.5", className)}
    >
      {available.map((t) => {
        const on = active.includes(t);
        return (
          <button
            key={t}
            type="button"
            onClick={() => toggle(t)}
            aria-pressed={on}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
              on
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card/60 text-muted-foreground border-border hover:border-primary/40 hover:text-foreground",
            )}
          >
            <span aria-hidden>{CONTENT_TYPE_ICON[t]}</span>
            {CONTENT_TYPE_LABEL[t]}
          </button>
        );
      })}
    </div>
  );
}
