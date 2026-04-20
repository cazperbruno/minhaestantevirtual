import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { UserPlus, UserCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFollowState, useToggleFollow } from "@/hooks/useFollow";

interface Props {
  targetUserId: string;
  /** Mantido por compat — o estado real vem do React Query. */
  initiallyFollowing?: boolean;
  size?: "sm" | "default";
  onChange?: (following: boolean) => void;
}

export function FollowButton({ targetUserId, size = "sm", onChange }: Props) {
  const { user } = useAuth();
  const { data: following = false, isLoading } = useFollowState(targetUserId);
  const toggle = useToggleFollow(targetUserId);

  if (!user || user.id === targetUserId) return null;

  const handleClick = () => {
    if (toggle.isPending) return;
    toggle.mutate(following, {
      onSuccess: (now) => onChange?.(now),
    });
  };

  const showSpinner = isLoading || toggle.isPending;

  return (
    <Button
      size={size}
      variant={following ? "outline" : "hero"}
      onClick={handleClick}
      disabled={toggle.isPending}
      className={cn("gap-1.5 tap-scale", size === "sm" && "h-8 text-xs")}
    >
      {showSpinner ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : following ? (
        <UserCheck className="w-3.5 h-3.5" />
      ) : (
        <UserPlus className="w-3.5 h-3.5" />
      )}
      {following ? "Seguindo" : "Seguir"}
    </Button>
  );
}
