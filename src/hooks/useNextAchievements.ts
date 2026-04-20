/**
 * Calcula o progresso do usuário em conquistas multi-formato (manga/comic/magazine)
 * para mostrar as N mais próximas do desbloqueio no Discover.
 *
 * Estratégia:
 *  - Carrega achievements das categorias de formato + achievements já desbloqueados.
 *  - Conta os user_books do usuário por content_type.
 *  - Para conquistas baseadas em "ler N volumes/edições" usa status IN (read, reading).
 *  - Filtra apenas as ainda não desbloqueadas, com progresso > 0 OU threshold pequeno.
 *  - Ordena por % de progresso desc e retorna no máximo `limit`.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CACHE } from "@/lib/query-client";
import type { ContentType } from "@/types/book";

export interface NextAchievement {
  code: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  threshold: number;
  xp_reward: number;
  progress: number;
  pct: number;
  /** Tipo de conteúdo associado (para colorir o card). */
  content_type: ContentType | null;
}

const CATEGORY_TO_TYPE: Record<string, ContentType | null> = {
  manga: "manga",
  comic: "comic",
  magazine: "magazine",
};

/** Para conquistas tipo "_5" (adicionou 5) usamos contagem total no acervo;
 *  para "_25"/"_100" usamos status read/reading (volumes lidos). */
function isReadingMetric(code: string): boolean {
  return /(_2[0-9]|_[3-9][0-9]|_1\d{2,})$/.test(code);
}

async function fetchNext(userId: string, limit: number): Promise<NextAchievement[]> {
  const [{ data: achievements }, { data: unlocked }, { data: ubs }] = await Promise.all([
    supabase
      .from("achievements")
      .select("code,title,description,icon,category,threshold,xp_reward")
      .in("category", ["manga", "comic", "magazine"]),
    supabase.from("user_achievements").select("achievement_code").eq("user_id", userId),
    supabase
      .from("user_books")
      .select("status, book:books!inner(content_type)")
      .eq("user_id", userId),
  ]);

  if (!achievements) return [];
  const unlockedSet = new Set((unlocked || []).map((u) => u.achievement_code));

  // Conta por tipo: total no acervo e total "lidos" (read+reading).
  const owned: Record<string, number> = { manga: 0, comic: 0, magazine: 0 };
  const consumed: Record<string, number> = { manga: 0, comic: 0, magazine: 0 };
  for (const row of (ubs || []) as any[]) {
    const ct = row.book?.content_type;
    if (!ct || !(ct in owned)) continue;
    owned[ct] += 1;
    if (row.status === "read" || row.status === "reading") consumed[ct] += 1;
  }

  const candidates: NextAchievement[] = [];
  for (const a of achievements as any[]) {
    if (unlockedSet.has(a.code)) continue;
    const threshold = a.threshold ?? 0;
    if (threshold <= 0) continue;
    const ct = a.category as keyof typeof owned;
    const progress = isReadingMetric(a.code) ? consumed[ct] : owned[ct];
    const pct = Math.min(100, Math.round((progress / threshold) * 100));
    candidates.push({
      code: a.code,
      title: a.title,
      description: a.description,
      icon: a.icon,
      category: a.category,
      threshold,
      xp_reward: a.xp_reward,
      progress,
      pct,
      content_type: CATEGORY_TO_TYPE[a.category] ?? null,
    });
  }

  // Mostra primeiro as mais próximas (maior pct), com pct > 0 ou threshold baixo (5).
  return candidates
    .filter((c) => c.pct > 0 || c.threshold <= 5)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, limit);
}

export function useNextAchievements(limit = 2) {
  const { user } = useAuth();
  return useQuery<NextAchievement[]>({
    queryKey: ["nextAchievements", user?.id || "anon", limit],
    queryFn: () => fetchNext(user!.id, limit),
    enabled: !!user,
    ...CACHE.PERSONAL,
  });
}
