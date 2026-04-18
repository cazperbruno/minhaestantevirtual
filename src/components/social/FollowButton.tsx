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
    setLoading(true);
    if (following) {
      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("following_id", targetUserId);
      if (error) toast.error("Erro ao deixar de seguir");
      else {
        setFollowing(false);
        onChange?.(false);
      }
    } else {
      const { error } = await supabase
        .from("follows")
        .insert({ follower_id: user.id, following_id: targetUserId });
      if (error) toast.error("Erro ao seguir");
      else {
        setFollowing(true);
        onChange?.(true);
        toast.success("Seguindo");
      }
    }
    setLoading(false);
  };

  return (
    <Button
      size={size}
      variant={following ? "outline" : "hero"}
      onClick={toggle}
      disabled={loading}
      className={cn("gap-1.5", size === "sm" && "h-8 text-xs")}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
        following ? <UserCheck className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
      {following ? "Seguindo" : "Seguir"}
    </Button>
  );
}
