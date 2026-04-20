// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type ContentType = "book" | "manga" | "comic" | "magazine";

type SeriesPayload = {
  total_volumes?: number | null;
  total_chapters?: number | null;
  status?: string | null;
  banner_url?: string | null;
  score?: number | null;
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
  content_type?: ContentType;
  series_id?: string | null;
  volume_number?: number | null;
  /** When provided (e.g. AniList), creates/updates the linked series row. */
  _series?: SeriesPayload | null;
  raw?: any;
};

// ============================================================
// 1) ISBN normalization & validation
// ============================================================
const cleanIsbn = (s: string) => (s || "").replace(/[^0-9Xx]/g, "").toUpperCase();

function isValidIsbn10(isbn: string): boolean {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (i + 1) * parseInt(isbn[i], 10);
  const last = isbn[9] === "X" ? 10 : parseInt(isbn[9], 10);
  sum += 10 * last;
  return sum % 11 === 0;
}

function isValidIsbn13(isbn: string): boolean {
  if (!/^\d{13}$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    const d = parseInt(isbn[i], 10);
    sum += i % 2 === 0 ? d : d * 3;
  }
  return sum % 10 === 0;
}

function isbn10To13(isbn10: string): string | null {
  if (!/^\d{9}[\dX]$/.test(isbn10)) return null;
  const core = "978" + isbn10.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(core[i], 10);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return core + check;
}

function isbn13To10(isbn13: string): string | null {
  if (!/^\d{13}$/.test(isbn13) || !isbn13.startsWith("978")) return null;
  const core = isbn13.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (i + 1) * parseInt(core[i], 10);
  const checkNum = sum % 11;
  const check = checkNum === 10 ? "X" : String(checkNum);
  return core + check;
}

/** Returns { isbn13, isbn10 } from any valid input, or null if invalid. */
function normalizeIsbn(input: string): { isbn13: string | null; isbn10: string | null } | null {
  const c = cleanIsbn(input);
  if (c.length === 10 && isValidIsbn10(c)) {
    return { isbn10: c, isbn13: isbn10To13(c) };
  }
  if (c.length === 13 && isValidIsbn13(c)) {
    return { isbn13: c, isbn10: isbn13To10(c) };
  }
  return null;
}

// ============================================================
// 2) Robust fetch with timeout + retry + circuit breaker
// ============================================================
// In-memory circuit breaker to avoid hammering rate-limited APIs across requests
// (the runtime reuses isolates, so this state persists across invocations on the same instance).
const breaker: Record<string, { until: number }> = {};
const isBreakerOpen = (key: string) => (breaker[key]?.until ?? 0) > Date.now();
const tripBreaker = (key: string, ms: number) => {
  breaker[key] = { until: Date.now() + ms };
  console.warn(`[breaker] ${key} OPEN for ${ms}ms`);
};
async function fetchWithRetry(
  url: string,
  opts: { timeoutMs?: number; retries?: number; label?: string } = {},
): Promise<{ res: Response | null; ms: number; attempt: number }> {
  const { timeoutMs = 6000, retries = 1, label = url } = opts;
  let attempt = 0;
  const start = Date.now();
  while (attempt <= retries) {
    attempt++;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          "User-Agent": "PaginaApp/1.0 (contact@pagina.app)",
          Accept: "application/json",
        },
      });
      clearTimeout(t);
      const ms = Date.now() - start;
      if (r.status === 429) {
        console.warn(`[${label}] 429 rate-limited (attempt ${attempt}, ${ms}ms)`);
        if (attempt <= retries) {
          await new Promise((res) => setTimeout(res, 400));
          continue;
        }
        return { res: r, ms, attempt };
      }
      if (!r.ok) {
        console.warn(`[${label}] HTTP ${r.status} (attempt ${attempt}, ${ms}ms)`);
        if (attempt <= retries) continue;
      }
      return { res: r, ms, attempt };
    } catch (e) {
      clearTimeout(t);
      console.warn(`[${label}] fetch error (attempt ${attempt}): ${(e as Error).message}`);
      if (attempt > retries) return { res: null, ms: Date.now() - start, attempt };
    }
  }
  return { res: null, ms: Date.now() - start, attempt };
}

// ============================================================
// 3) Normalizers per source
// ============================================================
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
  const isbn13 = (work.isbn_13 && work.isbn_13[0]) || (isbn && isbn.length === 13 ? isbn : null);
  const isbn10 = (work.isbn_10 && work.isbn_10[0]) || (isbn && isbn.length === 10 ? isbn : null);
  return {
    isbn_13: isbn13,
    isbn_10: isbn10,
    title: work.title || "Sem título",
    subtitle: work.subtitle || null,
    authors: (work.authors || []).map((a: any) => a.name).filter(Boolean),
    publisher: (work.publishers && (work.publishers[0]?.name || work.publishers[0])) || null,
    published_year: work.publish_date ? parseInt(String(work.publish_date).slice(-4)) || null : null,
    description: typeof work.notes === "string" ? work.notes : work.notes?.value || null,
    cover_url: work.cover?.large || work.cover?.medium || null,
    page_count: work.number_of_pages || null,
    language: null,
    categories: (work.subjects || []).map((s: any) => s.name || s).slice(0, 8),
    source: "openlibrary",
    source_id: work.key || null,
    raw: work,
  };
}

function normalizeOpenLibraryIsbnEndpoint(data: any, isbn: string): NormalizedBook {
  return {
    isbn_13: isbn.length === 13 ? isbn : null,
    isbn_10: isbn.length === 10 ? isbn : null,
    title: data.title || "Sem título",
    subtitle: data.subtitle || null,
    authors: [], // /isbn/ returns author refs only; resolved later if needed
    publisher: Array.isArray(data.publishers) ? data.publishers[0] : data.publishers || null,
    published_year: data.publish_date ? parseInt(String(data.publish_date).slice(-4)) || null : null,
    description: typeof data.description === "string" ? data.description : data.description?.value || null,
    cover_url: null,
    page_count: data.number_of_pages || null,
    language: null,
    categories: (data.subjects || []).slice(0, 8),
    source: "openlibrary",
    source_id: data.key || null,
    raw: data,
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

function normalizeIsbnDb(item: any): NormalizedBook {
  return {
    isbn_13: item.isbn13 || null,
    isbn_10: item.isbn || null,
    title: item.title || item.title_long || "Sem título",
    subtitle: null,
    authors: item.authors || [],
    publisher: item.publisher || null,
    published_year: item.date_published ? parseInt(String(item.date_published).slice(0, 4)) || null : null,
    description: item.synopsys || item.overview || null,
    cover_url: item.image || null,
    page_count: item.pages || null,
    language: item.language || null,
    categories: item.subjects || [],
    source: "isbndb",
    source_id: item.isbn13 || item.isbn || null,
    raw: item,
  };
}

// ============================================================
// 4) ISBN cascade lookup (multi-source)
// ============================================================
async function lookupOpenLibraryBibkeys(isbn: string): Promise<NormalizedBook | null> {
  const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
  const { res, ms, attempt } = await fetchWithRetry(url, { label: `OL-bibkeys:${isbn}` });
  if (!res || !res.ok) return null;
  try {
    const j = await res.json();
    const k = `ISBN:${isbn}`;
    if (j[k]) {
      console.log(`[OL-bibkeys] hit ISBN ${isbn} in ${ms}ms (attempt ${attempt})`);
      return normalizeOpenLibraryWork(j[k], isbn);
    }
    return null;
  } catch {
    return null;
  }
}

async function lookupOpenLibraryIsbnEndpoint(isbn: string): Promise<NormalizedBook | null> {
  const { res, ms, attempt } = await fetchWithRetry(`https://openlibrary.org/isbn/${isbn}.json`, {
    label: `OL-isbn:${isbn}`,
  });
  if (!res || !res.ok) return null;
  try {
    const j = await res.json();
    if (!j || !j.title) return null;
    console.log(`[OL-isbn] hit ISBN ${isbn} in ${ms}ms (attempt ${attempt})`);
    return normalizeOpenLibraryIsbnEndpoint(j, isbn);
  } catch {
    return null;
  }
}

async function lookupGoogleBooks(isbn: string): Promise<NormalizedBook | null> {
  if (isBreakerOpen("google-books")) {
    console.log(`[Google] breaker OPEN, skipping ISBN ${isbn}`);
    return null;
  }
  const { res, ms, attempt } = await fetchWithRetry(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`,
    { label: `Google:${isbn}` },
  );
  if (!res) return null;
  if (res.status === 429 || res.status === 503) {
    tripBreaker("google-books", 90_000);
    return null;
  }
  if (!res.ok) return null;
  try {
    const j = await res.json();
    if (j.error) {
      console.warn(`[Google] body error: ${j.error.message}`);
      return null;
    }
    if (j.items?.[0]) {
      console.log(`[Google] hit ISBN ${isbn} in ${ms}ms (attempt ${attempt})`);
      return normalizeGoogleBook(j.items[0]);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * BrasilAPI — agrega CBL, Mercado Editorial, Open Library e Google Books.
 * Cobertura excelente para livros brasileiros. Sem chave, sem rate-limit agressivo.
 */
async function lookupBrasilApi(isbn: string): Promise<NormalizedBook | null> {
  const { res, ms, attempt } = await fetchWithRetry(
    `https://brasilapi.com.br/api/isbn/v1/${isbn}`,
    { label: `BrasilAPI:${isbn}`, timeoutMs: 7000 },
  );
  if (!res || !res.ok) return null;
  try {
    const j = await res.json();
    if (!j?.title) return null;
    console.log(`[BrasilAPI] hit ISBN ${isbn} via ${j.provider || "?"} in ${ms}ms (attempt ${attempt})`);
    const yearStr = j.year ?? j.publish_date ?? null;
    const year = yearStr ? parseInt(String(yearStr).slice(0, 4)) || null : null;
    return {
      isbn_13: j.isbn?.length === 13 ? j.isbn : (isbn.length === 13 ? isbn : null),
      isbn_10: j.isbn?.length === 10 ? j.isbn : (isbn.length === 10 ? isbn : null),
      title: j.title,
      subtitle: j.subtitle || null,
      authors: Array.isArray(j.authors) ? j.authors : (j.authors ? [j.authors] : []),
      publisher: j.publisher || null,
      published_year: year,
      description: j.synopsis || null,
      cover_url: j.cover_url || null,
      page_count: j.page_count || null,
      language: j.language || null,
      categories: Array.isArray(j.subjects) ? j.subjects.slice(0, 8) : [],
      source: `brasilapi:${j.provider || "agg"}`,
      source_id: j.isbn || isbn,
      raw: j,
    };
  } catch (e) {
    console.warn(`[BrasilAPI] parse error: ${(e as Error).message}`);
    return null;
  }
}

/**
 * Open Library Search by ISBN — mais tolerante que /api/books quando há
 * variações de edição. Retorna doc com possíveis covers e metadata mesmo
 * quando /isbn/<X>.json devolve 404.
 */
async function lookupOpenLibrarySearch(isbn: string): Promise<NormalizedBook | null> {
  const { res, ms, attempt } = await fetchWithRetry(
    `https://openlibrary.org/search.json?isbn=${isbn}&limit=1`,
    { label: `OL-isbn-search:${isbn}` },
  );
  if (!res || !res.ok) return null;
  try {
    const j = await res.json();
    if (!j?.docs?.[0]) return null;
    console.log(`[OL-isbn-search] hit ISBN ${isbn} in ${ms}ms (attempt ${attempt})`);
    return normalizeOpenLibraryDoc(j.docs[0]);
  } catch {
    return null;
  }
}

/**
 * Library of Congress — free public catalog (no API key).
 * Uses the SRU endpoint with Dublin Core XML response (lighter than MODS).
 */
async function lookupLibraryOfCongress(isbn: string): Promise<NormalizedBook | null> {
  const url = `https://lx2.loc.gov/sru/?version=1.1&operation=searchRetrieve&query=bath.isbn=${isbn}&maximumRecords=1&recordSchema=dc`;
  const { res, ms, attempt } = await fetchWithRetry(url, { label: `LoC:${isbn}` });
  if (!res || !res.ok) return null;
  try {
    const xml = await res.text();
    // Cheap XML scraping — avoids pulling a parser dep
    const pick = (tag: string): string | null => {
      const m = xml.match(new RegExp(`<dc:${tag}[^>]*>([\\s\\S]*?)</dc:${tag}>`, "i"));
      return m ? m[1].replace(/<[^>]+>/g, "").trim() : null;
    };
    const pickAll = (tag: string): string[] => {
      const re = new RegExp(`<dc:${tag}[^>]*>([\\s\\S]*?)</dc:${tag}>`, "gi");
      const out: string[] = [];
      let m;
      while ((m = re.exec(xml)) !== null) out.push(m[1].replace(/<[^>]+>/g, "").trim());
      return out;
    };
    const title = pick("title");
    if (!title) return null;
    console.log(`[LoC] hit ISBN ${isbn} in ${ms}ms (attempt ${attempt})`);
    const date = pick("date");
    const year = date ? parseInt(date.match(/\d{4}/)?.[0] || "", 10) : null;
    return {
      title,
      authors: pickAll("creator").concat(pickAll("contributor")),
      publisher: pick("publisher"),
      published_year: year && !Number.isNaN(year) ? year : null,
      description: pick("description"),
      language: pick("language"),
      categories: pickAll("subject"),
      cover_url: null,
      page_count: null,
      isbn_13: isbn.length === 13 ? isbn : null,
      isbn_10: isbn.length === 10 ? isbn : null,
      source: "library-of-congress",
      source_id: isbn,
      raw: { sru_xml_excerpt: xml.slice(0, 800) },
    };
  } catch (e) {
    console.warn(`[LoC] parse error: ${(e as Error).message}`);
    return null;
  }
}

/**
 * Worldcat / classify.oclc.org — free public endpoint, no key.
 * Returns title + author summary used as last-resort metadata.
 */
async function lookupWorldcatClassify(isbn: string): Promise<NormalizedBook | null> {
  const url = `http://classify.oclc.org/classify2/Classify?isbn=${isbn}&summary=true`;
  const { res, ms, attempt } = await fetchWithRetry(url, { label: `Worldcat:${isbn}` });
  if (!res || !res.ok) return null;
  try {
    const xml = await res.text();
    const work = xml.match(/<work[^>]*\stitle="([^"]+)"[^>]*\sauthor="([^"]*)"[^>]*\/>/i);
    if (!work) return null;
    console.log(`[Worldcat] hit ISBN ${isbn} in ${ms}ms (attempt ${attempt})`);
    const authors = work[2]
      ? work[2].split("|").map((a) => a.replace(/\s*\[.*?\]\s*/g, "").trim()).filter(Boolean)
      : [];
    return {
      title: work[1],
      authors,
      publisher: null,
      published_year: null,
      description: null,
      language: null,
      categories: [],
      cover_url: null,
      page_count: null,
      isbn_13: isbn.length === 13 ? isbn : null,
      isbn_10: isbn.length === 10 ? isbn : null,
      source: "worldcat-classify",
      source_id: isbn,
      raw: { xml_excerpt: xml.slice(0, 500) },
    };
  } catch (e) {
    console.warn(`[Worldcat] parse error: ${(e as Error).message}`);
    return null;
  }
}

/** Try both ISBN variants on a given lookup. */
async function tryBothVariants(
  fn: (isbn: string) => Promise<NormalizedBook | null>,
  v: { isbn13: string | null; isbn10: string | null },
): Promise<NormalizedBook | null> {
  if (v.isbn13) {
    const r = await fn(v.isbn13);
    if (r) return r;
  }
  if (v.isbn10) {
    const r = await fn(v.isbn10);
    if (r) return r;
  }
  return null;
}

/** Best-effort cover fallback via Open Library Covers API. */
async function ensureCover(book: NormalizedBook): Promise<NormalizedBook> {
  if (book.cover_url) return book;
  const isbn = book.isbn_13 || book.isbn_10;
  if (!isbn) return book;
  // Open Library covers (no API key, returns 1x1 if missing — use default=false to 404 instead)
  const url = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
  const { res } = await fetchWithRetry(url, { label: `OL-cover:${isbn}`, retries: 0, timeoutMs: 4000 });
  if (res && res.ok) {
    book.cover_url = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
    console.log(`[Cover] OL fallback found for ${isbn}`);
  }
  return book;
}

/** Cascade lookup with logs and fallback. */
async function lookupIsbnCascade(
  variants: { isbn13: string | null; isbn10: string | null },
): Promise<{ book: NormalizedBook | null; sourcesTried: string[] }> {
  const sourcesTried: string[] = [];
  const isbnLabel = variants.isbn13 || variants.isbn10 || "?";
  console.log(`[Cascade] start ISBN ${isbnLabel}`);

  const sources: Array<{ name: string; fn: (isbn: string) => Promise<NormalizedBook | null> }> = [
    { name: "brasilapi", fn: lookupBrasilApi },
    { name: "openlibrary-bibkeys", fn: lookupOpenLibraryBibkeys },
    { name: "openlibrary-isbn-search", fn: lookupOpenLibrarySearch },
    { name: "openlibrary-isbn", fn: lookupOpenLibraryIsbnEndpoint },
    { name: "library-of-congress", fn: lookupLibraryOfCongress },
    { name: "worldcat-classify", fn: lookupWorldcatClassify },
    { name: "google-books", fn: lookupGoogleBooks },
  ];

  for (const s of sources) {
    sourcesTried.push(s.name);
    try {
      const found = await tryBothVariants(s.fn, variants);
      if (found && found.title && found.title !== "Sem título") {
        // Always store both variants when possible
        if (!found.isbn_13 && variants.isbn13) found.isbn_13 = variants.isbn13;
        if (!found.isbn_10 && variants.isbn10) found.isbn_10 = variants.isbn10;
        const withCover = await ensureCover(found);
        console.log(`[Cascade] resolved by ${s.name} for ${isbnLabel}`);
        return { book: withCover, sourcesTried };
      }
    } catch (e) {
      console.warn(`[Cascade] source ${s.name} threw: ${(e as Error).message}`);
    }
  }
  console.warn(`[Cascade] no source resolved ISBN ${isbnLabel}`);
  return { book: null, sourcesTried };
}

// ============================================================
// 5) Search (text query)
// ============================================================
async function searchOpenLibrary(query: string, lang = "por"): Promise<NormalizedBook[]> {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&language=${lang}&limit=20`;
  const { res } = await fetchWithRetry(url, { label: `OL-search:${query}` });
  if (!res || !res.ok) return [];
  try {
    const j = await res.json();
    return (j.docs || []).map(normalizeOpenLibraryDoc);
  } catch {
    return [];
  }
}

async function searchGoogleBooks(query: string, lang = "pt"): Promise<NormalizedBook[]> {
  if (isBreakerOpen("google-books")) {
    console.log(`[Google-search] breaker OPEN, skipping query "${query}"`);
    return [];
  }
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&langRestrict=${lang}&maxResults=20`;
  const { res } = await fetchWithRetry(url, { label: `Google-search:${query}` });
  if (!res) return [];
  if (res.status === 429 || res.status === 503) {
    tripBreaker("google-books", 90_000);
    return [];
  }
  if (!res.ok) return [];
  try {
    const j = await res.json();
    if (j.error) return [];
    return (j.items || []).map(normalizeGoogleBook);
  } catch {
    return [];
  }
}

// ============================================================
// 6) Persistence (cache layer)
// ============================================================
async function ensureSeries(supabase: any, book: NormalizedBook): Promise<string | null> {
  // Already has a linked series id from caller
  if (book.series_id) return book.series_id;
  // No external series payload -> nothing to create
  if (!book._series || !book.source_id || book.content_type !== "manga") return null;

  // Try to find by source + source_id
  if (book.source && book.source_id) {
    const { data: existing } = await supabase
      .from("series")
      .select("id")
      .eq("source", book.source)
      .eq("source_id", book.source_id)
      .maybeSingle();
    if (existing) return existing.id;
  }

  const { data, error } = await supabase
    .from("series")
    .insert({
      title: book.title,
      authors: book.authors || [],
      content_type: book.content_type,
      cover_url: book.cover_url,
      description: book.description,
      source: book.source,
      source_id: book.source_id,
      total_volumes: book._series.total_volumes ?? null,
      status: book._series.status ?? null,
      raw: book._series ?? null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("ensureSeries error", error);
    return null;
  }
  return data?.id ?? null;
}

async function persistBook(supabase: any, book: NormalizedBook) {
  // Manga from AniList -> dedupe by source/source_id (no ISBN)
  if (book.source && book.source_id && book.content_type && book.content_type !== "book") {
    const { data: existing } = await supabase
      .from("books")
      .select("*")
      .eq("source", book.source)
      .eq("source_id", book.source_id)
      .maybeSingle();
    if (existing) return existing;
  }
  if (book.isbn_13) {
    const { data } = await supabase.from("books").select("*").eq("isbn_13", book.isbn_13).maybeSingle();
    if (data) return data;
  }
  if (book.isbn_10) {
    const { data } = await supabase.from("books").select("*").eq("isbn_10", book.isbn_10).maybeSingle();
    if (data) return data;
  }

  // For series-bearing items, ensure the series row first.
  const seriesId = await ensureSeries(supabase, book);

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
      content_type: book.content_type ?? "book",
      series_id: seriesId,
      volume_number: book.volume_number ?? null,
      raw: book.raw ?? (book._series ? { series: book._series } : null),
    })
    .select()
    .single();
  if (error) {
    console.error("persistBook error", error);
    return null;
  }
  return data;
}

async function findCachedByVariants(
  supabase: any,
  v: { isbn13: string | null; isbn10: string | null },
) {
  if (v.isbn13) {
    const { data } = await supabase.from("books").select("*").eq("isbn_13", v.isbn13).maybeSingle();
    if (data) return data;
  }
  if (v.isbn10) {
    const { data } = await supabase.from("books").select("*").eq("isbn_10", v.isbn10).maybeSingle();
    if (data) return data;
  }
  return null;
}

// ============================================================
// 7) HTTP entrypoint
// ============================================================
// Sanitize free-text search queries to prevent PostgREST filter injection.
// Allow letters (incl. accented), digits, spaces and a small set of safe punctuation.
function sanitizeQuery(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[%(),{}\\]/g, " ") // strip PostgREST special chars
    .replace(/[^\p{L}\p{N}\s'’\-:.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "search";
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    // ---- AUTH GUARD ----
    // Require a valid user JWT for every action. Unauthenticated callers are rejected.
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authClient = createClient(supaUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service-role client used ONLY for server-side cache writes (persistBook).
    // Reads use the user-scoped client so RLS still applies.
    const supabase = createClient(supaUrl, serviceKey);
    const userClient = authClient;

    if (action === "isbn") {
      const isbnRaw = url.searchParams.get("isbn") || "";
      const variants = normalizeIsbn(isbnRaw);
      if (!variants) {
        return new Response(
          JSON.stringify({ error: "ISBN inválido. Verifique e tente novamente." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      console.log(`[ISBN] request ISBN13=${variants.isbn13} ISBN10=${variants.isbn10}`);

      const cached = await findCachedByVariants(supabase, variants);
      if (cached) {
        console.log(`[ISBN] cache hit`);
        return new Response(JSON.stringify({ book: cached, cached: true, source: "cache" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { book, sourcesTried } = await lookupIsbnCascade(variants);
      if (!book) {
        return new Response(
          JSON.stringify({ book: null, notFound: true, sourcesTried, error: "Livro não encontrado em nenhuma fonte." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const saved = await persistBook(supabase, book);
      return new Response(
        JSON.stringify({ book: saved, cached: false, source: book.source, sourcesTried }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "search") {
      const q = url.searchParams.get("q") || "";
      if (!q.trim()) {
        return new Response(JSON.stringify({ results: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // If query looks like an ISBN, route to cascade
      const variants = normalizeIsbn(q);
      if (variants) {
        const cached = await findCachedByVariants(supabase, variants);
        if (cached) {
          return new Response(JSON.stringify({ results: [cached] }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { book } = await lookupIsbnCascade(variants);
        if (book) {
          const saved = await persistBook(supabase, book);
          return new Response(JSON.stringify({ results: saved ? [saved] : [] }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ results: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const [ol, gb] = await Promise.all([searchOpenLibrary(q, "por"), searchGoogleBooks(q, "pt")]);
      const results = [...ol, ...gb];
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
      let body: any;
      try {
        body = await req.json();
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Validate payload
      if (!body || typeof body !== "object") {
        return new Response(JSON.stringify({ error: "Invalid payload" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title || title.length > 500) {
        return new Response(JSON.stringify({ error: "Title required (max 500 chars)" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const safe: NormalizedBook = {
        title,
        subtitle: typeof body.subtitle === "string" ? body.subtitle.slice(0, 500) : null,
        authors: Array.isArray(body.authors)
          ? body.authors.filter((a: any) => typeof a === "string").slice(0, 20).map((a: string) => a.slice(0, 200))
          : [],
        publisher: typeof body.publisher === "string" ? body.publisher.slice(0, 200) : null,
        published_year: Number.isFinite(body.published_year) ? body.published_year : null,
        description: typeof body.description === "string" ? body.description.slice(0, 5000) : null,
        cover_url: typeof body.cover_url === "string" && /^https?:\/\//.test(body.cover_url) ? body.cover_url.slice(0, 1000) : null,
        page_count: Number.isFinite(body.page_count) ? body.page_count : null,
        language: typeof body.language === "string" ? body.language.slice(0, 16) : null,
        categories: Array.isArray(body.categories)
          ? body.categories.filter((c: any) => typeof c === "string").slice(0, 16).map((c: string) => c.slice(0, 80))
          : [],
        isbn_13: typeof body.isbn_13 === "string" && /^\d{13}$/.test(body.isbn_13) ? body.isbn_13 : null,
        isbn_10: typeof body.isbn_10 === "string" && /^\d{9}[\dX]$/.test(body.isbn_10) ? body.isbn_10 : null,
        source: typeof body.source === "string" ? body.source.slice(0, 32) : "manual",
        source_id: typeof body.source_id === "string" ? body.source_id.slice(0, 200) : null,
        raw: null,
      };
      const saved = await persistBook(supabase, safe);
      return new Response(JSON.stringify({ book: saved }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Autocomplete: cache-first, then Open Library light search.
    // Returns up to 8 suggestions ultra-fast for typeahead UX.
    if (action === "suggest") {
      const rawQ = (url.searchParams.get("q") || "").trim();
      const q = sanitizeQuery(rawQ);
      if (q.length < 2) {
        return new Response(JSON.stringify({ suggestions: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 1) Internal catalog first — use user-scoped client (RLS enforced)
      // and parameterized .ilike (no string interpolation in .or() filter).
      const { data: cached } = await userClient
        .from("books")
        .select("id,title,subtitle,authors,cover_url,published_year,isbn_13")
        .ilike("title", `%${q}%`)
        .limit(6);

      const fromCache = (cached || []).map((b: any) => ({
        id: b.id,
        title: b.title,
        subtitle: b.subtitle,
        authors: b.authors || [],
        cover_url: b.cover_url,
        published_year: b.published_year,
        source: "cache" as const,
      }));

      // 2) If we already have 6 from cache, return immediately
      if (fromCache.length >= 6) {
        return new Response(JSON.stringify({ suggestions: fromCache }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 3) Top-up from Open Library (lightweight fields)
      try {
        const olUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=${8 - fromCache.length}&fields=key,title,author_name,first_publish_year,cover_i,isbn`;
        const { res } = await fetchWithRetry(olUrl, { label: `OL-suggest:${q}`, timeoutMs: 3500, retries: 0 });
        const fromOL: any[] = [];
        if (res && res.ok) {
          const j = await res.json();
          for (const d of (j.docs || [])) {
            fromOL.push({
              id: null,
              title: d.title || "Sem título",
              subtitle: null,
              authors: d.author_name || [],
              cover_url: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
              published_year: d.first_publish_year || null,
              source: "openlibrary" as const,
              isbn: (d.isbn || [])[0] || null,
            });
          }
        }
        return new Response(
          JSON.stringify({ suggestions: [...fromCache, ...fromOL].slice(0, 8) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch {
        return new Response(JSON.stringify({ suggestions: fromCache }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("search-books error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
