import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: Props) {
  return (
    <div className={cn("text-center py-16 px-6 max-w-md mx-auto animate-fade-in", className)}>
      <div className="w-20 h-20 rounded-3xl bg-gradient-spine border border-border mx-auto mb-5 flex items-center justify-center shadow-book gpu">
        <span className="[&>svg]:w-9 [&>svg]:h-9 text-primary/60">{icon}</span>
      </div>
      <h2 className="font-display text-2xl font-semibold mb-2">{title}</h2>
      {description && <p className="text-muted-foreground text-sm mb-6">{description}</p>}
      {action}
    </div>
  );
}
