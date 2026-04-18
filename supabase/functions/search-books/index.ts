// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type NormalizedBook = {
  isbn_13?: string | null;
  isbn_10?: string | null;
  title: string;
  subtitle?: string | null;
  authors: string[];
  publisher?: string | null;
  published_year?: number | null;
  description?: string | null;
  cover_url?: string | null;
  page_count?: number | null;
  language?: string | null;
  categories?: string[];
  source: string;
  source_id?: string | null;
  raw?: any;
};

const cleanIsbn = (s: string) => s.replace(/[^0-9Xx]/g, "");

function normalizeOpenLibraryDoc(doc: any): NormalizedBook {
  const isbnList: string[] = doc.isbn || [];
  const isbn13 = isbnList.find((i) => i.length === 13) || null;
  const isbn10 = isbnList.find((i) => i.length === 10) || null;
  const coverId = doc.cover_i;
  return {
    isbn_13: isbn13,
    isbn_10: isbn10,
    title: doc.title || "Sem título",
    subtitle: doc.subtitle || null,
    authors: doc.author_name || [],
    publisher: (doc.publisher && doc.publisher[0]) || null,
    published_year: doc.first_publish_year || null,
    description: null,
    cover_url: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null,
    page_count: doc.number_of_pages_median || null,
    language: (doc.language && doc.language[0]) || null,
    categories: doc.subject ? doc.subject.slice(0, 8) : [],
    source: "openlibrary",
    source_id: doc.key || null,
    raw: doc,
  };
}

function normalizeOpenLibraryWork(work: any, isbn?: string): NormalizedBook {
  const ids = work.identifiers || {};
  const isbn13 = (work.isbn_13 && work.isbn_13[0]) || (isbn && isbn.length === 13 ? isbn : null);
  const isbn10 = (work.isbn_10 && work.isbn_10[0]) || (isbn && isbn.length === 10 ? isbn : null);
  return {
    isbn_13: isbn13,
    isbn_10: isbn10,
    title: work.title || "Sem título",
    subtitle: work.subtitle || null,
    authors: (work.authors || []).map((a: any) => a.name).filter(Boolean),
    publisher: (work.publishers && work.publishers[0]?.name) || null,
    published_year: work.publish_date ? parseInt(String(work.publish_date).slice(-4)) || null : null,
    description: typeof work.notes === "string" ? work.notes : work.notes?.value || null,
    cover_url: work.cover?.large || work.cover?.medium || null,
    page_count: work.number_of_pages || null,
    language: null,
    categories: (work.subjects || []).map((s: any) => s.name).slice(0, 8),
    source: "openlibrary",
    source_id: work.key || null,
    raw: work,
  };
}

function normalizeGoogleBook(item: any): NormalizedBook {
  const v = item.volumeInfo || {};
  const ids: any[] = v.industryIdentifiers || [];
  const isbn13 = ids.find((i) => i.type === "ISBN_13")?.identifier || null;
  const isbn10 = ids.find((i) => i.type === "ISBN_10")?.identifier || null;
  return {
    isbn_13: isbn13,
    isbn_10: isbn10,
    title: v.title || "Sem título",
    subtitle: v.subtitle || null,
    authors: v.authors || [],
    publisher: v.publisher || null,
    published_year: v.publishedDate ? parseInt(String(v.publishedDate).slice(0, 4)) || null : null,
    description: v.description || null,
    cover_url:
      v.imageLinks?.extraLarge ||
      v.imageLinks?.large ||
      v.imageLinks?.thumbnail?.replace("http://", "https://") ||
      null,
    page_count: v.pageCount || null,
    language: v.language || null,
    categories: v.categories || [],
    source: "google",
    source_id: item.id || null,
    raw: item,
  };
}

async function searchOpenLibrary(query: string, lang = "por"): Promise<NormalizedBook[]> {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&language=${lang}&limit=20`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const j = await r.json();
  return (j.docs || []).map(normalizeOpenLibraryDoc);
}

async function searchGoogleBooks(query: string, lang = "pt"): Promise<NormalizedBook[]> {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&langRestrict=${lang}&maxResults=20`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const j = await r.json();
  return (j.items || []).map(normalizeGoogleBook);
}

async function lookupIsbn(isbn: string): Promise<NormalizedBook | null> {
  // Open Library books API
  try {
    const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
    const r = await fetch(url);
    if (r.ok) {
      const j = await r.json();
      const k = `ISBN:${isbn}`;
      if (j[k]) return normalizeOpenLibraryWork(j[k], isbn);
    }
  } catch (_) { /* ignore */ }
  // Google fallback
  try {
    const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    if (r.ok) {
      const j = await r.json();
      if (j.items?.[0]) return normalizeGoogleBook(j.items[0]);
    }
  } catch (_) { /* ignore */ }
  return null;
}

async function persistBook(supabase: any, book: NormalizedBook) {
  // Try find by isbn_13, then isbn_10
  if (book.isbn_13) {
    const { data } = await supabase.from("books").select("*").eq("isbn_13", book.isbn_13).maybeSingle();
    if (data) return data;
  }
  if (book.isbn_10) {
    const { data } = await supabase.from("books").select("*").eq("isbn_10", book.isbn_10).maybeSingle();
    if (data) return data;
  }
  const { data, error } = await supabase
    .from("books")
    .insert({
      isbn_13: book.isbn_13,
      isbn_10: book.isbn_10,
      title: book.title,
      subtitle: book.subtitle,
      authors: book.authors,
      publisher: book.publisher,
      published_year: book.published_year,
      description: book.description,
      cover_url: book.cover_url,
      page_count: book.page_count,
      language: book.language,
      categories: book.categories || [],
      source: book.source,
      source_id: book.source_id,
      raw: book.raw,
    })
    .select()
    .single();
  if (error) {
    console.error("persistBook error", error);
    return null;
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "search";
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(supaUrl, supaKey, {
      global: { headers: { Authorization: authHeader } },
    });

    if (action === "isbn") {
      const isbnRaw = url.searchParams.get("isbn") || "";
      const isbn = cleanIsbn(isbnRaw);
      if (!isbn) {
        return new Response(JSON.stringify({ error: "ISBN obrigatório" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Check cache first
      const col = isbn.length === 13 ? "isbn_13" : "isbn_10";
      const { data: cached } = await supabase.from("books").select("*").eq(col, isbn).maybeSingle();
      if (cached) {
        return new Response(JSON.stringify({ book: cached, cached: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const found = await lookupIsbn(isbn);
      if (!found) {
        return new Response(JSON.stringify({ book: null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const saved = await persistBook(supabase, found);
      return new Response(JSON.stringify({ book: saved, cached: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "search") {
      const q = url.searchParams.get("q") || "";
      if (!q.trim()) {
        return new Response(JSON.stringify({ results: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // If query is an ISBN, treat as ISBN
      const onlyDigits = cleanIsbn(q);
      if (onlyDigits.length === 10 || onlyDigits.length === 13) {
        const found = await lookupIsbn(onlyDigits);
        if (found) {
          const saved = await persistBook(supabase, found);
          return new Response(JSON.stringify({ results: saved ? [saved] : [] }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      // Open Library priority, fallback Google Books
      let results = await searchOpenLibrary(q, "por");
      if (results.length < 5) {
        const g = await searchGoogleBooks(q, "pt");
        results = [...results, ...g];
      }
      // Dedup by title+first author
      const seen = new Set<string>();
      const dedup: NormalizedBook[] = [];
      for (const r of results) {
        const key = `${r.title.toLowerCase()}|${(r.authors[0] || "").toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          dedup.push(r);
        }
      }
      return new Response(JSON.stringify({ results: dedup.slice(0, 30) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "save") {
      const body = await req.json();
      const saved = await persistBook(supabase, body);
      return new Response(JSON.stringify({ book: saved }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("search-books error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
