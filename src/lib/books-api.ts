import { supabase } from "@/integrations/supabase/client";
import type { Book } from "@/types/book";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/search-books`;
const COVER_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recognize-cover`;
const PAGE_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recognize-page`;
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
  const j: any = await r.json().catch(() => ({}));
  if (r.status === 404 || j?.notFound || j?.book === null) return null;
  if (r.status === 400) throw new Error(j.error || "ISBN inválido");
  if (!r.ok) throw new Error(j.error || "Falha na busca por ISBN");
  return j.book ?? null;
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

export interface SearchSuggestion {
  id: string | null;
  title: string;
  subtitle?: string | null;
  authors: string[];
  cover_url: string | null;
  published_year?: number | null;
  source: "cache" | "openlibrary";
  isbn?: string | null;
}

export async function suggestBooks(query: string, signal?: AbortSignal): Promise<SearchSuggestion[]> {
  if (!query || query.trim().length < 2) return [];
  try {
    const r = await fetch(`${FN_URL}?action=suggest&q=${encodeURIComponent(query)}`, {
      headers: await authHeaders(),
      signal,
    });
    if (!r.ok) return [];
    const j = await r.json();
    return j.suggestions || [];
  } catch {
    return [];
  }
}

export async function recognizeCover(imageBase64: string): Promise<{ query: string; title?: string; author?: string; confidence: number }> {
  const r = await fetch(COVER_FN, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ imageBase64 }),
  });
  if (r.status === 429) throw new Error("Muitas requisições. Tente em instantes.");
  if (r.status === 402) throw new Error("Créditos AI insuficientes.");
  if (!r.ok) throw new Error("Falha ao reconhecer capa");
  return r.json();
}

export interface PageCandidate {
  title: string;
  authors: string[];
  cover_url: string | null;
  description?: string | null;
  isbn?: string | null;
  source: "openlibrary" | "google";
}

export interface PageRecognition {
  excerpt: string;
  guess: { title: string | null; author: string | null };
  confidence: number;
  language: string | null;
  usedQuery: string;
  candidates: PageCandidate[];
}

export async function recognizePage(imageBase64: string): Promise<PageRecognition> {
  const r = await fetch(PAGE_FN, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ imageBase64 }),
  });
  if (r.status === 429) throw new Error("Muitas requisições. Tente em instantes.");
  if (r.status === 402) throw new Error("Créditos AI insuficientes.");
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error || "Falha ao analisar página");
  }
  return r.json();
}
