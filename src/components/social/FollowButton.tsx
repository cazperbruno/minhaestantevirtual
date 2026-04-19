import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { UserPlus, UserCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  targetUserId: string;
  initiallyFollowing?: boolean;
  size?: "sm" | "default";
  onChange?: (following: boolean) => void;
}

export function FollowButton({ targetUserId, initiallyFollowing = false, size = "sm", onChange }: Props) {
  const { user } = useAuth();
  const [following, setFollowing] = useState(initiallyFollowing);
  const [loading, setLoading] = useState(false);

  if (!user || user.id === targetUserId) return null;

  const toggle = async () => {
    if (loading) return;
    const wasFollowing = following;
    // optimistic
    setFollowing(!wasFollowing);
    onChange?.(!wasFollowing);
    setLoading(true);
    const { error } = wasFollowing
      ? await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", targetUserId)
      : await supabase.from("follows").insert({ follower_id: user.id, following_id: targetUserId });
    setLoading(false);
    if (error) {
      // rollback
      setFollowing(wasFollowing);
      onChange?.(wasFollowing);
      toast.error(wasFollowing ? "Erro ao deixar de seguir" : "Erro ao seguir");
    } else if (!wasFollowing) {
      toast.success("Seguindo");
    }
  };

  return (
    <Button
      size={size}
      variant={following ? "outline" : "hero"}
      onClick={toggle}
      disabled={loading}
      className={cn("gap-1.5 tap-scale", size === "sm" && "h-8 text-xs")}
    >
      {following ? <UserCheck className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
      {following ? "Seguindo" : "Seguir"}
    </Button>
  );
}
