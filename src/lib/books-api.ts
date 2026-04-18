import { supabase } from "@/integrations/supabase/client";
import type { Book } from "@/types/book";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/search-books`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    apikey: ANON,
    Authorization: session ? `Bearer ${session.access_token}` : `Bearer ${ANON}`,
  };
}

export async function searchBooksGet(query: string): Promise<Book[]> {
  const r = await fetch(`${FN_URL}?action=search&q=${encodeURIComponent(query)}`, {
    headers: await authHeaders(),
  });
  if (!r.ok) throw new Error("Falha na busca");
  const j = await r.json();
  return j.results || [];
}

export async function lookupIsbn(isbn: string): Promise<Book | null> {
  const r = await fetch(`${FN_URL}?action=isbn&isbn=${encodeURIComponent(isbn)}`, {
    headers: await authHeaders(),
  });
  if (!r.ok) throw new Error("Falha na busca por ISBN");
  const j = await r.json();
  return j.book;
}

export async function saveBook(book: Partial<Book>): Promise<Book | null> {
  const r = await fetch(`${FN_URL}?action=save`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(book),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j.book;
}
