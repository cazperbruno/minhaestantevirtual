import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as Icons from "lucide-react";

export async function checkAchievements(userId: string) {
  const { data, error } = await supabase.rpc("check_achievements", { _user_id: userId });
  if (error) {
    console.error("check_achievements error", error);
    return [];
  }
  const unlocked = data || [];
  unlocked.forEach((a: any) => {
    toast.success(`🏆 Conquista desbloqueada: ${a.title}`, {
      description: `+${a.xp_reward} XP`,
    });
  });
  return unlocked;
}

// grantXp removido — use awardXp de "@/lib/xp" para todas as concessões de XP.

export function getIcon(name: string): React.ComponentType<{ className?: string }> {
  return (Icons as any)[name] || Icons.Award;
}
