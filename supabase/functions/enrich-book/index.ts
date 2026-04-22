// deno-lint-ignore-file no-explicit-any
// =====================================================================
// enrich-book — Enriquece UM livro com dados faltantes (Google + OL)
// Idempotente. Recebe { book_id }. Retorna { ok, fields_filled, ... }.
// Não substitui campos já bons; apenas preenche lacunas.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface BookRow {
  id: string;
  title: string;
  authors: string[];
  isbn_13: string | null;
  isbn_10: string | null;
  description: string | null;
  cover_url: string | null;
  categories: string[] | null;
  page_count: number | null;
  published_year: number | null;
  publisher: string | null;
  language: string | null;
}

async function fetchJson(url: string, timeoutMs = 5000): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Readify/1.0", Accept: "application/json" },
    });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    clearTimeout(t);
    return null;
  }
}

function pickGoogle(book: BookRow, items: any[]): Partial<BookRow> {
  const item = items?.[0];
  if (!item) return {};
  const v = item.volumeInfo || {};
  const out: Partial<BookRow> = {};
  if (!book.description && v.description) out.description = v.description;
  if ((!book.categories || book.categories.length === 0) && v.categories?.length) out.categories = v.categories.slice(0, 8);
  if (!book.cover_url) {
    const img = v.imageLinks?.extraLarge || v.imageLinks?.large || v.imageLinks?.medium || v.imageLinks?.thumbnail;
    if (img) out.cover_url = img.replace(/^http:/, "https:");
  }
  if (!book.page_count && v.pageCount) out.page_count = v.pageCount;
  if (!book.published_year && v.publishedDate) {
    const y = parseInt(String(v.publishedDate).slice(0, 4), 10);
    if (y > 1000 && y < 3000) out.published_year = y;
  }
  if (!book.publisher && v.publisher) out.publisher = v.publisher;
  if (!book.language && v.language) out.language = v.language;
  return out;
}

function pickOpenLibrary(book: BookRow, work: any): Partial<BookRow> {
  if (!work) return {};
  const out: Partial<BookRow> = {};
  if (!book.description) {
    const d = typeof work.description === "string" ? work.description : work.description?.value;
    if (d && d.length > 30) out.description = d;
  }
  if ((!book.categories || book.categories.length === 0) && work.subjects?.length) {
    out.categories = work.subjects.slice(0, 8);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => ({}));
    const bookId = body?.book_id as string | undefined;
    if (!bookId) {
      return new Response(JSON.stringify({ error: "book_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: book, error } = await sb
      .from("books")
      .select("id,title,authors,isbn_13,isbn_10,description,cover_url,categories,page_count,published_year,publisher,language")
      .eq("id", bookId)
      .maybeSingle();

    if (error || !book) {
      return new Response(JSON.stringify({ error: "book not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const b = book as BookRow;
    const patch: Partial<BookRow> = {};

    // 1) Google Books — prioridade ISBN-13, fallback título+autor
    let googleQ: string | null = null;
    if (b.isbn_13) googleQ = `isbn:${b.isbn_13}`;
    else if (b.isbn_10) googleQ = `isbn:${b.isbn_10}`;
    else if (b.title) googleQ = `intitle:${b.title}${b.authors?.[0] ? `+inauthor:${b.authors[0]}` : ""}`;

    if (googleQ) {
      const j = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(googleQ)}&maxResults=1`);
      if (j?.items) Object.assign(patch, pickGoogle(b, j.items));
    }

    // 2) OpenLibrary — só se ainda faltar descrição/categorias
    if ((!b.description || b.description.length < 80 || !b.categories?.length) && (b.isbn_13 || b.isbn_10)) {
      const isbn = b.isbn_13 || b.isbn_10;
      const j = await fetchJson(`https://openlibrary.org/isbn/${isbn}.json`);
      if (j?.works?.[0]?.key) {
        const work = await fetchJson(`https://openlibrary.org${j.works[0].key}.json`);
        Object.assign(patch, pickOpenLibrary(b, work));
      }
    }

    const filled: string[] = Object.keys(patch);
    // Sempre marca tentativa para pular esse livro pelas próximas semanas
    // (evita reprocessar o que já está bom)
    const finalPatch: Record<string, any> = { ...patch, last_enriched_at: new Date().toISOString() };

    const { error: upErr } = await sb.from("books").update(finalPatch).eq("id", bookId);
    if (upErr) {
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, fields_filled: filled, patch }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
