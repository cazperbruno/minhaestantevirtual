/**
 * Cliente para AniList (mangás) via edge function anilist-search.
 *
 * Usado como fonte adicional na busca quando o usuário curte mangás.
 * Sem API key — função pública que faz proxy para o GraphQL gratuito.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Book } from "@/types/book";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/anilist-search`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    apikey: ANON,
    Authorization: session ? `Bearer ${session.access_token}` : `Bearer ${ANON}`,
  };
}

export interface AnilistManga extends Book {
  content_type: "manga";
  _series?: {
    total_volumes: number | null;
    total_chapters: number | null;
    status: string | null;
    banner_url: string | null;
    score: number | null;
  };
}

export async function searchManga(query: string): Promise<AnilistManga[]> {
  if (!query || query.trim().length < 2) return [];
  try {
    const r = await fetch(`${FN_URL}?q=${encodeURIComponent(query)}`, {
      headers: await authHeaders(),
    });
    if (!r.ok) return [];
    const j = await r.json();
    return j.results || [];
  } catch {
    return [];
  }
}
