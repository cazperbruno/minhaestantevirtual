/**
 * Smart cover URL resolution with multi-source fallback.
 * Delegates to the `cover-search` edge function which validates URLs server-side
 * (avoiding CORS issues) and persists the found cover to the books table.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Book } from "@/types/book";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cover-search`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** In-memory cache: avoids re-querying the same book in a session. */
const memo = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

interface CoverInput extends Pick<Book, "cover_url" | "isbn_10" | "isbn_13" | "title" | "authors"> {
  id?: string;
}

export async function resolveCover(book: CoverInput, opts: { persist?: boolean } = {}): Promise<string | null> {
  // 1. Already has a URL — trust it
  if (book.cover_url) return book.cover_url;

  const key = book.id || book.isbn_13 || book.isbn_10 || book.title;
  if (memo.has(key)) return memo.get(key)!;
  if (inflight.has(key)) return inflight.get(key)!;

  const promise = (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(FN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON,
          Authorization: session ? `Bearer ${session.access_token}` : `Bearer ${ANON}`,
        },
        body: JSON.stringify({
          bookId: book.id,
          isbn_13: book.isbn_13,
          isbn_10: book.isbn_10,
          title: book.title,
          authors: book.authors,
          persist: opts.persist ?? !!book.id,
        }),
      });
      if (!r.ok) return null;
      const j = await r.json();
      return (j.cover_url as string | null) ?? null;
    } catch {
      return null;
    }
  })();

  inflight.set(key, promise);
  const result = await promise;
  inflight.delete(key);
  memo.set(key, result);
  return result;
}

/** Clears memo for a specific book — call after manual edit so re-fetch picks up new URL. */
export function invalidateCover(book: CoverInput) {
  const key = book.id || book.isbn_13 || book.isbn_10 || book.title;
  memo.delete(key);
}
