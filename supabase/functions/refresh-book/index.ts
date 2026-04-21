// deno-lint-ignore-file no-explicit-any
// =====================================================================
// refresh-book — Reprocessa um livro existente usando a MESMA cascade
// pública que search-books (BrasilAPI, OpenLibrary múltiplos, LoC,
// Worldcat, Google Books) e mescla dados melhores no registro do banco.
//
// Princípio: o banco interno é a fonte de verdade. Esta função só
// COMPLEMENTA campos vazios/curtos e SUBSTITUI capa quebrada.
// Retorna { ok, fields_filled[], patch, sourcesTried[] }.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------- ISBN helpers (mesmos de search-books, simplificados) ----------
const cleanIsbn = (s: string) => (s || "").replace(/[^0-9Xx]/g, "").toUpperCase();
function isValidIsbn10(i: string) {
  if (!/^\d{9}[\dX]$/.test(i)) return false;
  let s = 0; for (let n = 0; n < 9; n++) s += (n + 1) * parseInt(i[n], 10);
  s += 10 * (i[9] === "X" ? 10 : parseInt(i[9], 10));
  return s % 11 === 0;
}
function isValidIsbn13(i: string) {
  if (!/^\d{13}$/.test(i)) return false;
  let s = 0; for (let n = 0; n < 13; n++) { const d = parseInt(i[n], 10); s += n % 2 === 0 ? d : d * 3; }
  return s % 10 === 0;
}
function isbn10To13(i: string) {
  if (!/^\d{9}[\dX]$/.test(i)) return null;
  const c = "978" + i.slice(0, 9); let s = 0;
  for (let n = 0; n < 12; n++) { const d = parseInt(c[n], 10); s += n % 2 === 0 ? d : d * 3; }
  return c + ((10 - (s % 10)) % 10);
}
function isbn13To10(i: string) {
  if (!/^\d{13}$/.test(i) || !i.startsWith("978")) return null;
  const c = i.slice(3, 12); let s = 0;
  for (let n = 0; n < 9; n++) s += (n + 1) * parseInt(c[n], 10);
  const k = s % 11; return c + (k === 10 ? "X" : String(k));
}
function variantsFor(isbn?: string | null): { isbn13: string | null; isbn10: string | null } | null {
  if (!isbn) return null;
  const c = cleanIsbn(isbn);
  if (c.length === 10 && isValidIsbn10(c)) return { isbn10: c, isbn13: isbn10To13(c) };
  if (c.length === 13 && isValidIsbn13(c)) return { isbn13: c, isbn10: isbn13To10(c) };
  return null;
}

// ---------- fetch util ----------
async function fetchJson(url: string, timeoutMs = 6000): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "PaginaApp/1.0", Accept: "application/json" },
    });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.json();
  } catch { clearTimeout(t); return null; }
}
async function fetchText(url: string, timeoutMs = 6000): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "PaginaApp/1.0" } });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.text();
  } catch { clearTimeout(t); return null; }
}

// ---------- Source candidates ----------
interface Candidate {
  title?: string | null;
  subtitle?: string | null;
  authors?: string[] | null;
  publisher?: string | null;
  published_year?: number | null;
  description?: string | null;
  cover_url?: string | null;
  page_count?: number | null;
  language?: string | null;
  categories?: string[] | null;
  source: string;
}

async function srcBrasilApi(isbn: string): Promise<Candidate | null> {
  const j = await fetchJson(`https://brasilapi.com.br/api/isbn/v1/${isbn}`, 7000);
  if (!j?.title) return null;
  const yr = j.year ?? j.publish_date ?? null;
  return {
    title: j.title, subtitle: j.subtitle || null,
    authors: Array.isArray(j.authors) ? j.authors : (j.authors ? [j.authors] : []),
    publisher: j.publisher || null,
    published_year: yr ? parseInt(String(yr).slice(0, 4)) || null : null,
    description: j.synopsis || null,
    cover_url: j.cover_url || null,
    page_count: j.page_count || null,
    language: j.language || null,
    categories: Array.isArray(j.subjects) ? j.subjects.slice(0, 8) : [],
    source: `brasilapi:${j.provider || "agg"}`,
  };
}

async function srcOpenLibraryBibkeys(isbn: string): Promise<Candidate | null> {
  const j = await fetchJson(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
  const w = j?.[`ISBN:${isbn}`];
  if (!w?.title) return null;
  return {
    title: w.title, subtitle: w.subtitle || null,
    authors: (w.authors || []).map((a: any) => a.name).filter(Boolean),
    publisher: (w.publishers && (w.publishers[0]?.name || w.publishers[0])) || null,
    published_year: w.publish_date ? parseInt(String(w.publish_date).slice(-4)) || null : null,
    description: typeof w.notes === "string" ? w.notes : w.notes?.value || null,
    cover_url: w.cover?.large || w.cover?.medium || null,
    page_count: w.number_of_pages || null,
    language: null,
    categories: (w.subjects || []).map((s: any) => s.name || s).slice(0, 8),
    source: "openlibrary-bibkeys",
  };
}

async function srcOpenLibraryWork(isbn: string): Promise<Candidate | null> {
  const j = await fetchJson(`https://openlibrary.org/isbn/${isbn}.json`);
  if (!j?.title) return null;
  let description: string | null = null;
  if (typeof j.description === "string") description = j.description;
  else if (j.description?.value) description = j.description.value;
  // Fetch the work for richer description/subjects
  if ((!description || description.length < 80) && j.works?.[0]?.key) {
    const w = await fetchJson(`https://openlibrary.org${j.works[0].key}.json`);
    if (w) {
      if (!description) description = typeof w.description === "string" ? w.description : w.description?.value || null;
      if (!j.subjects?.length && w.subjects?.length) j.subjects = w.subjects;
    }
  }
  return {
    title: j.title, subtitle: j.subtitle || null,
    authors: [],
    publisher: Array.isArray(j.publishers) ? j.publishers[0] : j.publishers || null,
    published_year: j.publish_date ? parseInt(String(j.publish_date).slice(-4)) || null : null,
    description,
    cover_url: null,
    page_count: j.number_of_pages || null,
    language: null,
    categories: (j.subjects || []).slice(0, 8),
    source: "openlibrary-isbn",
  };
}

async function srcGoogleBooks(isbn: string): Promise<Candidate | null> {
  const j = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
  const v = j?.items?.[0]?.volumeInfo;
  if (!v?.title) return null;
  return {
    title: v.title, subtitle: v.subtitle || null,
    authors: v.authors || [],
    publisher: v.publisher || null,
    published_year: v.publishedDate ? parseInt(String(v.publishedDate).slice(0, 4)) || null : null,
    description: v.description || null,
    cover_url: v.imageLinks?.extraLarge || v.imageLinks?.large || v.imageLinks?.thumbnail?.replace("http://", "https://") || null,
    page_count: v.pageCount || null,
    language: v.language || null,
    categories: v.categories || [],
    source: "google-books",
  };
}

async function srcLoC(isbn: string): Promise<Candidate | null> {
  const xml = await fetchText(`https://lx2.loc.gov/sru/?version=1.1&operation=searchRetrieve&query=bath.isbn=${isbn}&maximumRecords=1&recordSchema=dc`);
  if (!xml) return null;
  const pick = (tag: string) => {
    const m = xml.match(new RegExp(`<dc:${tag}[^>]*>([\\s\\S]*?)</dc:${tag}>`, "i"));
    return m ? m[1].replace(/<[^>]+>/g, "").trim() : null;
  };
  const pickAll = (tag: string) => {
    const re = new RegExp(`<dc:${tag}[^>]*>([\\s\\S]*?)</dc:${tag}>`, "gi");
    const out: string[] = []; let m;
    while ((m = re.exec(xml)) !== null) out.push(m[1].replace(/<[^>]+>/g, "").trim());
    return out;
  };
  const title = pick("title");
  if (!title) return null;
  const date = pick("date");
  const yr = date ? parseInt(date.match(/\d{4}/)?.[0] || "", 10) : null;
  return {
    title,
    authors: pickAll("creator").concat(pickAll("contributor")),
    publisher: pick("publisher"),
    published_year: yr && !Number.isNaN(yr) ? yr : null,
    description: pick("description"),
    language: pick("language"),
    categories: pickAll("subject").slice(0, 8),
    cover_url: null,
    page_count: null,
    source: "library-of-congress",
  };
}

// ---------- Merge logic ----------
function isLow(s: string | null | undefined, min = 1) {
  return !s || (typeof s === "string" && s.trim().length < min);
}

function pickBetter<T>(current: T, candidates: T[], score: (v: T) => number): T {
  let best = current;
  let bestScore = score(current);
  for (const c of candidates) {
    const sc = score(c);
    if (sc > bestScore) { best = c; bestScore = sc; }
  }
  return best;
}

function mergeBest(book: any, sources: Candidate[]): { patch: Record<string, any>; filled: string[] } {
  const patch: Record<string, any> = {};

  // Title: keep current if it has length, only fix if missing or "Sem título"
  if (isLow(book.title, 2) || book.title === "Sem título") {
    const cands = sources.filter((s) => s.title && !isLow(s.title, 2));
    if (cands[0]?.title) patch.title = cands[0].title;
  }

  // Authors: prefer current if filled, otherwise the first non-empty list
  if (!book.authors || book.authors.length === 0) {
    const c = sources.find((s) => Array.isArray(s.authors) && s.authors.length > 0);
    if (c) patch.authors = c.authors!.slice(0, 20);
  }

  // Description: choose longest among current + candidates (>=80 chars threshold improvement)
  const allDescs = [book.description as string | null, ...sources.map((s) => s.description ?? null)].filter(Boolean) as string[];
  const longest = allDescs.sort((a, b) => b.length - a.length)[0] || null;
  if (longest && (!book.description || longest.length > (book.description?.length || 0) + 40)) {
    patch.description = longest.slice(0, 8000);
  }

  // Categories: union, max 12, dedupe case-insensitive
  const haveCats = new Set<string>((book.categories || []).map((c: string) => c.toLowerCase()));
  const merged: string[] = [...(book.categories || [])];
  for (const s of sources) for (const c of (s.categories || [])) {
    if (!c) continue;
    if (!haveCats.has(c.toLowerCase())) { haveCats.add(c.toLowerCase()); merged.push(c); }
  }
  if (merged.length > (book.categories?.length || 0)) patch.categories = merged.slice(0, 12);

  // Publisher / language / year / pages — fill if empty
  for (const k of ["publisher", "language"] as const) {
    if (isLow(book[k]) ) {
      const c = sources.find((s) => !isLow((s as any)[k]));
      if (c) patch[k] = (c as any)[k];
    }
  }
  if (!book.published_year) {
    const c = sources.find((s) => Number.isFinite(s.published_year));
    if (c) patch.published_year = c.published_year;
  }
  if (!book.page_count) {
    const c = sources.find((s) => Number.isFinite(s.page_count));
    if (c) patch.page_count = c.page_count;
  }

  // Cover: only set if missing — actual cover repair handled by cover-search separately
  if (!book.cover_url) {
    const c = sources.find((s) => s.cover_url && /^https?:\/\//.test(s.cover_url));
    if (c?.cover_url) patch.cover_url = c.cover_url;
  }

  return { patch, filled: Object.keys(patch) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      .select("id,title,subtitle,authors,isbn_13,isbn_10,description,cover_url,categories,page_count,published_year,publisher,language")
      .eq("id", bookId)
      .maybeSingle();
    if (error || !book) {
      return new Response(JSON.stringify({ error: "book not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const v = variantsFor(book.isbn_13) || variantsFor(book.isbn_10);
    const sourcesTried: string[] = [];
    const candidates: Candidate[] = [];

    if (v) {
      const isbns = [v.isbn13, v.isbn10].filter(Boolean) as string[];
      const lookups: Array<{ name: string; fn: (isbn: string) => Promise<Candidate | null> }> = [
        { name: "brasilapi", fn: srcBrasilApi },
        { name: "openlibrary-bibkeys", fn: srcOpenLibraryBibkeys },
        { name: "openlibrary-isbn", fn: srcOpenLibraryWork },
        { name: "google-books", fn: srcGoogleBooks },
        { name: "library-of-congress", fn: srcLoC },
      ];
      // Run all in parallel for the primary ISBN, then fallback to alternate ISBN if nothing yielded
      const primary = isbns[0];
      const alt = isbns[1];
      const results = await Promise.allSettled(lookups.map(async (l) => {
        sourcesTried.push(l.name);
        let r = await l.fn(primary).catch(() => null);
        if (!r && alt) r = await l.fn(alt).catch(() => null);
        return r;
      }));
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) candidates.push(r.value);
      }
    } else {
      // No ISBN — try Google Books title+author as last resort
      sourcesTried.push("google-title-search");
      const q = encodeURIComponent(`intitle:${book.title}${book.authors?.[0] ? `+inauthor:${book.authors[0]}` : ""}`);
      const j = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`);
      const v2 = j?.items?.[0]?.volumeInfo;
      if (v2) candidates.push({
        title: v2.title, authors: v2.authors || [],
        publisher: v2.publisher || null,
        published_year: v2.publishedDate ? parseInt(String(v2.publishedDate).slice(0, 4)) || null : null,
        description: v2.description || null,
        cover_url: v2.imageLinks?.large || v2.imageLinks?.thumbnail?.replace("http:", "https:") || null,
        page_count: v2.pageCount || null,
        language: v2.language || null,
        categories: v2.categories || [],
        source: "google-title-search",
      });
    }

    const { patch, filled } = mergeBest(book, candidates);

    if (filled.length === 0) {
      return new Response(JSON.stringify({
        ok: true, fields_filled: [], skipped: "nothing-to-fill",
        sourcesTried, candidates_count: candidates.length,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { error: upErr } = await sb.from("books").update(patch).eq("id", bookId);
    if (upErr) {
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true, fields_filled: filled, patch,
      sourcesTried, candidates_count: candidates.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
