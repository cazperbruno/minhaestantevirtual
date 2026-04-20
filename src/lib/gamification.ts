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

// `awardXp` (em "@/lib/xp") é a única fonte de verdade para concessão de XP.
// O legado `grantXp` foi removido. A função SQL `check_achievements` agora usa
// `add_xp` internamente (com histórico em xp_events).

export function getIcon(name: string): React.ComponentType<{ className?: string }> {
  return (Icons as any)[name] || Icons.Award;
}
