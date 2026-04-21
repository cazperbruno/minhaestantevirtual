import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** Conteúdo secundário (ex.: dica curta, link). */
  hint?: ReactNode;
}

/**
 * Estado vazio premium.
 * - Anel sutil de glow para chamar atenção sem ser ruído.
 * - Tipografia display + descrição calma.
 * - Suporta `action` principal e `hint` secundário (link/dica).
 */
export function EmptyState({ icon, title, description, action, hint, className }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "text-center py-16 px-6 max-w-md mx-auto animate-fade-in",
        className,
      )}
    >
      <div className="relative mx-auto mb-5 w-20 h-20">
        <div
          aria-hidden
          className="absolute inset-0 rounded-3xl bg-primary/10 blur-2xl"
        />
        <div className="relative w-20 h-20 rounded-3xl bg-gradient-spine border border-border flex items-center justify-center shadow-book gpu">
          <span className="[&>svg]:w-9 [&>svg]:h-9 text-primary/70">{icon}</span>
        </div>
      </div>
      <h2 className="font-display text-2xl font-semibold mb-2 text-balance">{title}</h2>
      {description && (
        <p className="text-muted-foreground text-sm mb-6 leading-relaxed text-balance">
          {description}
        </p>
      )}
      {action}
      {hint && <div className="mt-4 text-xs text-muted-foreground/80">{hint}</div>}
    </div>
  );
}
