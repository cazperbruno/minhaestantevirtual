// Multi-source book cover finder with server-side validation and DB persistence.
// Sources: provided URL → OpenLibrary (ISBN) → Google Books (ISBN) → Google Books (title+author) → OpenLibrary search.
// Validates each candidate by HEAD/GET to ensure non-empty image (OL returns 1x1 grey gif when missing).

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Body {
  bookId?: string;
  isbn_13?: string | null;
  isbn_10?: string | null;
  title?: string;
  authors?: string[];
  /** If true, persist found URL to books table (requires bookId) */
  persist?: boolean;
}

async function fetchSafe(url: string, timeoutMs = 5000): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return r;
  } catch {
    clearTimeout(t);
    return null;
  }
}

/** Validate that an image URL exists and isn't a placeholder (e.g. OL's 1x1 grey gif). */
async function isValidImage(url: string): Promise<boolean> {
  const r = await fetchSafe(url, 4000);
  if (!r || !r.ok) return false;
  const ct = r.headers.get("content-type") || "";
  if (!ct.startsWith("image/")) return false;
  const len = parseInt(r.headers.get("content-length") || "0", 10);
  // OpenLibrary's "no cover" placeholder is ~807 bytes; real covers are 5KB+.
  if (len > 0 && len < 2000) return false;
  return true;
}

async function tryOpenLibraryByIsbn(isbn: string): Promise<string | null> {
  const url = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
  return (await isValidImage(url)) ? url : null;
}

async function tryGoogleBooksByIsbn(isbn: string): Promise<string | null> {
  const r = await fetchSafe(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&fields=items(volumeInfo/imageLinks)&maxResults=1`,
    6000,
  );
  if (!r || !r.ok) return null;
  try {
    const j = await r.json();
    const links = j.items?.[0]?.volumeInfo?.imageLinks;
    if (!links) return null;
    const url = (links.extraLarge || links.large || links.medium || links.thumbnail || "")
      .replace("http://", "https://")
      .replace("&edge=curl", "");
    if (!url) return null;
    return (await isValidImage(url)) ? url : null;
  } catch {
    return null;
  }
}

async function tryGoogleBooksByTitle(title: string, author?: string): Promise<string | null> {
  const q = [`intitle:"${title}"`, author ? `inauthor:"${author}"` : ""].filter(Boolean).join("+");
  const r = await fetchSafe(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&fields=items(volumeInfo/imageLinks,volumeInfo/title)&maxResults=3`,
    6000,
  );
  if (!r || !r.ok) return null;
  try {
    const j = await r.json();
    for (const item of j.items || []) {
      const links = item.volumeInfo?.imageLinks;
      if (!links) continue;
      const url = (links.extraLarge || links.large || links.medium || links.thumbnail || "")
        .replace("http://", "https://")
        .replace("&edge=curl", "");
      if (url && (await isValidImage(url))) return url;
    }
    return null;
  } catch {
    return null;
  }
}

async function tryOpenLibrarySearch(title: string, author?: string): Promise<string | null> {
  const params = new URLSearchParams({ title, limit: "3" });
  if (author) params.set("author", author);
  const r = await fetchSafe(`https://openlibrary.org/search.json?${params}`, 6000);
  if (!r || !r.ok) return null;
  try {
    const j = await r.json();
    for (const doc of j.docs || []) {
      if (doc.cover_i) {
        const url = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
        if (await isValidImage(url)) return url;
      }
    }
    return null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body: Body = await req.json();
    const { bookId, isbn_13, isbn_10, title, authors, persist } = body;
    const author = authors?.[0];

    const sources: { name: string; url: string }[] = [];
    let found: string | null = null;

    // 1. OpenLibrary by ISBN
    for (const isbn of [isbn_13, isbn_10].filter(Boolean) as string[]) {
      sources.push({ name: `openlibrary-isbn:${isbn}`, url: "" });
      found = await tryOpenLibraryByIsbn(isbn);
      if (found) { sources[sources.length - 1].url = found; break; }
    }

    // 2. Google Books by ISBN
    if (!found) {
      for (const isbn of [isbn_13, isbn_10].filter(Boolean) as string[]) {
        sources.push({ name: `google-isbn:${isbn}`, url: "" });
        found = await tryGoogleBooksByIsbn(isbn);
        if (found) { sources[sources.length - 1].url = found; break; }
      }
    }

    // 3. Google Books by title + author
    if (!found && title) {
      sources.push({ name: `google-title`, url: "" });
      found = await tryGoogleBooksByTitle(title, author);
      if (found) sources[sources.length - 1].url = found;
    }

    // 4. OpenLibrary search by title + author
    if (!found && title) {
      sources.push({ name: `openlibrary-search`, url: "" });
      found = await tryOpenLibrarySearch(title, author);
      if (found) sources[sources.length - 1].url = found;
    }

    // 5. Persist to DB if requested
    if (found && persist && bookId) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { error } = await supabase.from("books").update({ cover_url: found }).eq("id", bookId);
      if (error) console.warn("[cover-search] persist failed:", error.message);
    }

    return new Response(
      JSON.stringify({ cover_url: found, sourcesTried: sources.map((s) => s.name) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[cover-search] error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
