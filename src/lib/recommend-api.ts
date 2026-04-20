import { supabase } from "@/integrations/supabase/client";
import type { Book } from "@/types/book";

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recommend-feed`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    apikey: ANON,
    Authorization: session ? `Bearer ${session.access_token}` : `Bearer ${ANON}`,
  };
}

export interface Shelf {
  id: string;
  title: string;
  reason?: string;
  books: (Book & { _reason?: string })[];
}

export async function fetchShelves(): Promise<Shelf[]> {
  const r = await fetch(`${FN}?mode=shelves`, { headers: await authHeaders() });
  if (!r.ok) return [];
  const j = await r.json();
  return j.shelves || [];
}

export interface FeedPage {
  books: (Book & { _reason?: string })[];
  nextCursor: number;
  hasMore: boolean;
}

export async function fetchFeed(cursor: number, limit = 12): Promise<FeedPage> {
  const r = await fetch(`${FN}?mode=feed&cursor=${cursor}&limit=${limit}`, {
    headers: await authHeaders(),
  });
  if (!r.ok) return { books: [], nextCursor: cursor, hasMore: false };
  return r.json();
}
