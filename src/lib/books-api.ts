import { supabase } from "@/integrations/supabase/client";
import type { Book } from "@/types/book";

export async function searchBooks(query: string): Promise<Book[]> {
  const { data, error } = await supabase.functions.invoke("search-books", {
    body: {},
    method: "GET",
    // @ts-expect-error supabase-js doesn't support qs natively, use direct URL
  });
  // Use direct fetch with query params instead
  if (error) console.warn(error);
  return (data?.results || []) as Book[];
}

export async function searchBooksGet(query: string): Promise<Book[]> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/search-books?action=search&q=${encodeURIComponent(query)}`;
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(url, {
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: session ? `Bearer ${session.access_token}` : `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
  });
  if (!r.ok) throw new Error("Falha na busca");
  const j = await r.json();
  return j.results || [];
}

export async function lookupIsbn(isbn: string): Promise<Book | null> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/search-books?action=isbn&isbn=${encodeURIComponent(isbn)}`;
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(url, {
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: session ? `Bearer ${session.access_token}` : `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
  });
  if (!r.ok) throw new Error("Falha na busca por ISBN");
  const j = await r.json();
  return j.book;
}

export async function saveBook(book: Partial<Book>): Promise<Book | null> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/search-books?action=save`;
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: session ? `Bearer ${session.access_token}` : `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(book),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j.book;
}
