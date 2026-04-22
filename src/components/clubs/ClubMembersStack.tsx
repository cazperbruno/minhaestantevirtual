import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { MemberLite } from "@/hooks/useClubDiscovery";

interface Props {
  members: MemberLite[];
  total: number;
  /** Quantos avatares mostrar (default 4). */
  max?: number;
  size?: "sm" | "md";
  className?: string;
}

/** Stack de avatares dos membros de um clube com indicador de presença. */
export function ClubMembersStack({ members, total, max = 4, size = "sm", className }: Props) {
  const visible = members.slice(0, max);
  const overflow = Math.max(0, total - visible.length);
  const sizeClass = size === "md" ? "w-8 h-8 text-xs" : "w-6 h-6 text-[10px]";

  if (visible.length === 0 && overflow === 0) {
    return (
      <span className={cn("text-xs text-muted-foreground italic", className)}>Sem membros ainda</span>
    );
  }

  return (
    <div className={cn("flex items-center", className)}>
      <div className="flex -space-x-2">
        {visible.map((m) => (
          <div key={m.user_id} className="relative">
            <Avatar className={cn(sizeClass, "ring-2 ring-background")}>
              <AvatarImage src={m.avatar_url || undefined} alt={m.display_name || "Leitor"} />
              <AvatarFallback>
                {(m.display_name || "?").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {m.is_online && (
              <span
                aria-hidden
                className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-background"
              />
            )}
          </div>
        ))}
        {overflow > 0 && (
          <div
            className={cn(
              sizeClass,
              "rounded-full ring-2 ring-background bg-muted/70 text-muted-foreground inline-flex items-center justify-center font-semibold tabular-nums",
            )}
          >
            +{overflow > 99 ? "99" : overflow}
          </div>
        )}
      </div>
    </div>
  );
}
