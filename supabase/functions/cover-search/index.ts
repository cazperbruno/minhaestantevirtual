// ============================================================================
// Multi-source book cover finder with parallel search, quality ranking,
// AI fallback and DB persistence.
//
// Strategy:
//   1. Run all relevant sources IN PARALLEL (Promise.allSettled) for speed
//   2. Each source returns { url, source, confidence } candidates
//   3. Validate every candidate (HEAD/GET, content-type, size, dimensions)
//   4. Score each: resolution + aspect ratio + source confidence
//   5. Return the highest-scoring valid cover
//   6. If none → fallback to AI (Lovable AI Gateway with Gemini)
//   7. Persist winner to books.cover_url
//
// Sources implemented:
//   - Open Library (ISBN direct + search by title/author)
//   - Google Books (ISBN + title/author)
//   - iTunes Search (high-res artwork, no key required)
//   - Archive.org (advanced search + thumbnail service)
//   - Wikidata/Wikipedia (P18 image property via SPARQL)
//   - AI fallback (Lovable AI gateway — describes/searches)
//
// Sources NOT implemented (require paid API keys or block scraping):
//   - Goodreads (Cloudflare protection)
//   - Amazon PA-API (paid + approval required)
//   - Metabooks (B2B contract)
//   - Smashwords (no stable API)
// ============================================================================

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
  // Desambiguação adicional (mangás, quadrinhos, séries):
  subtitle?: string | null;
  publisher?: string | null;
  content_type?: string | null;
  volume_number?: number | null;
  persist?: boolean;
  /** Disable AI fallback (e.g. batch jobs to save credits) */
  noAi?: boolean;
}

interface Candidate {
  url: string;
  source: string;
  /** Source trust 0-1 (Google/OL/iTunes high; AI low) */
  trust: number;
}

interface ScoredCandidate extends Candidate {
  width: number;
  height: number;
  bytes: number;
  score: number;
}

// ---------- Source confidence weights (tuned dynamically over time) ----------
const TRUST: Record<string, number> = {
  "anilist": 0.97,           // melhor fonte para mangá/light novel
  "google-isbn": 0.95,
  "openlibrary-isbn": 0.92,
  "itunes": 0.90,
  "google-title": 0.85,
  "openlibrary-search": 0.80,
  "wikidata": 0.75,
  "archive-org": 0.70,
  "ai-fallback": 0.40,
};

// ---------- HTTP helper with timeout ----------
async function fetchSafe(url: string, timeoutMs = 5000, init?: RequestInit): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    clearTimeout(t);
    return r;
  } catch {
    clearTimeout(t);
    return null;
  }
}

// ---------- Image validation + dimension detection ----------
/**
 * Validates an image URL and returns its real dimensions+size.
 * Uses GET (range request when possible) to read enough bytes for header parsing.
 * Returns null if invalid (404, wrong type, too small, placeholder).
 */
async function probeImage(url: string): Promise<{ width: number; height: number; bytes: number } | null> {
  // Range request first — some servers honor it (saves bandwidth)
  const r = await fetchSafe(url, 5000, { headers: { Range: "bytes=0-32768" } });
  if (!r || (!r.ok && r.status !== 206)) return null;
  const ct = r.headers.get("content-type") || "";
  if (!ct.startsWith("image/")) return null;

  const buf = new Uint8Array(await r.arrayBuffer());
  // OpenLibrary placeholder: 807 bytes grey gif
  if (buf.length < 1500) return null;

  const dims = readImageDimensions(buf, ct);
  if (!dims) {
    // Couldn't parse — accept if reasonable size
    return buf.length > 5000 ? { width: 0, height: 0, bytes: buf.length } : null;
  }
  return { ...dims, bytes: buf.length };
}

/** Parse JPEG/PNG/WebP/GIF dimensions from the header bytes. */
function readImageDimensions(b: Uint8Array, contentType: string): { width: number; height: number } | null {
  try {
    // PNG: signature 89 50 4E 47, IHDR width/height at offset 16
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
      const w = (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19];
      const h = (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23];
      return { width: w, height: h };
    }
    // GIF: 'GIF8', dims at 6-9 (little endian)
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
      return { width: b[6] | (b[7] << 8), height: b[8] | (b[9] << 8) };
    }
    // JPEG: scan SOF0/SOF2 markers
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i < b.length - 8) {
        if (b[i] !== 0xff) { i++; continue; }
        const marker = b[i + 1];
        // SOF markers (skip SOF4=DHT, SOFC, etc.)
        if (
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf)
        ) {
          const h = (b[i + 5] << 8) | b[i + 6];
          const w = (b[i + 7] << 8) | b[i + 8];
          return { width: w, height: h };
        }
        const segLen = (b[i + 2] << 8) | b[i + 3];
        i += 2 + segLen;
      }
    }
    // WebP: 'RIFF'...'WEBP'
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57) {
      // VP8X chunk has w/h at offset 24
      if (b[12] === 0x56 && b[13] === 0x50 && b[14] === 0x38 && b[15] === 0x58) {
        const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
        const h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
        return { width: w, height: h };
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

// ---------- Quality scoring ----------
/**
 * Score formula:
 *   resolution (40%) + aspect (20%) + source trust (40%)
 * Penalize tiny images, square images (likely thumbnails or wrong),
 * boost portrait covers near 2:3 ratio.
 */
function scoreCandidate(c: Candidate, dims: { width: number; height: number; bytes: number }): number {
  const { width, height, bytes } = dims;
  let resScore = 0;
  if (width && height) {
    // Min 300px shorter side, ideal ≥600px
    const shortSide = Math.min(width, height);
    if (shortSide < 200) resScore = 10;
    else if (shortSide < 300) resScore = 30;
    else if (shortSide < 500) resScore = 60;
    else if (shortSide < 800) resScore = 85;
    else resScore = 100;
  } else {
    // Unknown dims — estimate from bytes
    if (bytes > 80_000) resScore = 70;
    else if (bytes > 20_000) resScore = 50;
    else resScore = 30;
  }

  let aspectScore = 50;
  if (width && height) {
    const ratio = height / width;
    // Ideal book cover: 1.4–1.7 (close to 2:3 = 1.5)
    if (ratio >= 1.3 && ratio <= 1.7) aspectScore = 100;
    else if (ratio >= 1.1 && ratio <= 1.9) aspectScore = 70;
    else if (ratio < 0.9 || ratio > 2.2) aspectScore = 10; // landscape or weird
    else aspectScore = 40;
  }

  const trustScore = c.trust * 100;
  return resScore * 0.4 + aspectScore * 0.2 + trustScore * 0.4;
}

// ============================================================================
// SOURCES — each returns Candidate[] (multiple candidates possible)
// ============================================================================

async function srcOpenLibraryByIsbn(isbn: string): Promise<Candidate[]> {
  return [{
    url: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`,
    source: "openlibrary-isbn",
    trust: TRUST["openlibrary-isbn"],
  }];
}

async function srcGoogleBooksByIsbn(isbn: string): Promise<Candidate[]> {
  const r = await fetchSafe(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&fields=items(volumeInfo/imageLinks)&maxResults=1`,
    6000,
  );
  if (!r?.ok) return [];
  try {
    const j = await r.json();
    const links = j.items?.[0]?.volumeInfo?.imageLinks;
    if (!links) return [];
    const url = (links.extraLarge || links.large || links.medium || links.thumbnail || "")
      .replace("http://", "https://").replace("&edge=curl", "");
    return url ? [{ url, source: "google-isbn", trust: TRUST["google-isbn"] }] : [];
  } catch { return []; }
}

async function srcGoogleBooksByTitle(title: string, author?: string): Promise<Candidate[]> {
  const q = [`intitle:"${title}"`, author ? `inauthor:"${author}"` : ""].filter(Boolean).join("+");
  const r = await fetchSafe(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&fields=items(volumeInfo/imageLinks)&maxResults=3`,
    6000,
  );
  if (!r?.ok) return [];
  try {
    const j = await r.json();
    const out: Candidate[] = [];
    for (const item of j.items || []) {
      const links = item.volumeInfo?.imageLinks;
      if (!links) continue;
      const url = (links.extraLarge || links.large || links.medium || links.thumbnail || "")
        .replace("http://", "https://").replace("&edge=curl", "");
      if (url) out.push({ url, source: "google-title", trust: TRUST["google-title"] });
    }
    return out;
  } catch { return []; }
}

async function srcOpenLibrarySearch(title: string, author?: string): Promise<Candidate[]> {
  const params = new URLSearchParams({ title, limit: "3" });
  if (author) params.set("author", author);
  const r = await fetchSafe(`https://openlibrary.org/search.json?${params}`, 6000);
  if (!r?.ok) return [];
  try {
    const j = await r.json();
    return (j.docs || [])
      .filter((d: any) => d.cover_i)
      .slice(0, 3)
      .map((d: any) => ({
        url: `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`,
        source: "openlibrary-search",
        trust: TRUST["openlibrary-search"],
      }));
  } catch { return []; }
}

async function srcItunes(title: string, author?: string): Promise<Candidate[]> {
  const term = [title, author].filter(Boolean).join(" ");
  const r = await fetchSafe(
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=ebook&limit=3`,
    6000,
  );
  if (!r?.ok) return [];
  try {
    const j = await r.json();
    const out: Candidate[] = [];
    for (const it of j.results || []) {
      const art = it.artworkUrl100 as string | undefined;
      if (!art) continue;
      // Upgrade to high-res: replace size segment with 1400x1400bb
      const hi = art.replace(/\/\d+x\d+(bb)?\.(jpg|png)/, "/1400x1400bb.$2");
      out.push({ url: hi, source: "itunes", trust: TRUST["itunes"] });
    }
    return out;
  } catch { return []; }
}

async function srcArchiveOrg(title: string, author?: string): Promise<Candidate[]> {
  const q = `title:(${title})${author ? ` AND creator:(${author})` : ""} AND mediatype:texts`;
  const r = await fetchSafe(
    `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier&rows=3&output=json`,
    6000,
  );
  if (!r?.ok) return [];
  try {
    const j = await r.json();
    return (j.response?.docs || [])
      .slice(0, 3)
      .map((d: any) => ({
        url: `https://archive.org/services/img/${d.identifier}`,
        source: "archive-org",
        trust: TRUST["archive-org"],
      }));
  } catch { return []; }
}

async function srcWikidata(title: string, author?: string): Promise<Candidate[]> {
  // SPARQL: find books matching label, get P18 (image)
  const filter = author
    ? `?book wdt:P50 ?author . ?author rdfs:label ?aname . FILTER(CONTAINS(LCASE(?aname), LCASE("${author.replace(/"/g, "")}")))`
    : "";
  const sparql = `
    SELECT ?book ?image WHERE {
      ?book wdt:P31/wdt:P279* wd:Q571 ;
            rdfs:label ?label ;
            wdt:P18 ?image .
      FILTER(CONTAINS(LCASE(?label), LCASE("${title.replace(/"/g, "")}")))
      ${filter}
    } LIMIT 2
  `;
  const r = await fetchSafe(
    `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`,
    7000,
    { headers: { "User-Agent": "ReadifyBookCovers/1.0", Accept: "application/sparql-results+json" } },
  );
  if (!r?.ok) return [];
  try {
    const j = await r.json();
    return (j.results?.bindings || [])
      .map((b: any) => b.image?.value)
      .filter(Boolean)
      .map((url: string) => ({ url, source: "wikidata", trust: TRUST["wikidata"] }));
  } catch { return []; }
}

// ---------- AniList (mangá, light novel, manhwa) ----------
// API GraphQL gratuita sem key. Capas extraLarge ~600x900, alta confiança.
async function srcAnilist(title: string, volumeNumber?: number | null): Promise<Candidate[]> {
  // Estratégia de busca: título + número do volume quando aplicável,
  // depois título puro. AniList retorna a obra; capa é da obra (vol 1 normalmente).
  // Quando há volume_number e a obra tem capa por volume na descrição,
  // tentamos o título com "vol N" antes.
  const queries = [title];
  if (volumeNumber && volumeNumber > 1) {
    queries.unshift(`${title} ${volumeNumber}`);
  }
  const out: Candidate[] = [];
  for (const q of queries) {
    const r = await fetchSafe("https://graphql.anilist.co", 7000, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query: `query($s:String){Page(perPage:3){media(search:$s,type:MANGA,sort:[SEARCH_MATCH,POPULARITY_DESC]){coverImage{extraLarge large}}}}`,
        variables: { s: q },
      }),
    });
    if (!r?.ok) continue;
    try {
      const j = await r.json();
      const items = j.data?.Page?.media || [];
      for (const m of items) {
        const url = m.coverImage?.extraLarge || m.coverImage?.large;
        if (url) out.push({ url, source: "anilist", trust: TRUST["anilist"] });
      }
      if (out.length) break; // primeira query que retornou já basta
    } catch { /* continue */ }
  }
  return out;
}

// ---------- AI fallback (Lovable AI Gateway) ----------
async function srcAiFallback(title: string, author?: string, contentType?: string | null): Promise<Candidate[]> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return [];
  const typeHint = contentType === "manga" ? "mangá" : contentType === "comic" ? "quadrinho/HQ" : contentType === "magazine" ? "revista" : "livro";
  // Ask Gemini to find a likely cover URL from web knowledge
  try {
    const r = await fetchSafe("https://ai.gateway.lovable.dev/v1/chat/completions", 12000, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: `Forneça APENAS uma URL direta (https://...jpg ou png) de uma capa de alta resolução para o ${typeHint}:
Título: "${title}"${author ? `\nAutor: ${author}` : ""}
Prefira openlibrary.org, books.google.com, anilist.co, archive.org. Responda SOMENTE a URL, sem texto adicional.`,
        }],
        max_tokens: 200,
      }),
    });
    if (!r?.ok) return [];
    const j = await r.json();
    const text = j.choices?.[0]?.message?.content?.trim() || "";
    const match = text.match(/https?:\/\/\S+\.(?:jpg|jpeg|png|webp)(?:\?\S*)?/i);
    if (!match) return [];
    return [{ url: match[0], source: "ai-fallback", trust: TRUST["ai-fallback"] }];
  } catch { return []; }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body: Body = await req.json();
    const {
      bookId, isbn_13, isbn_10, title, authors, persist, noAi,
      subtitle, publisher, content_type, volume_number,
    } = body;
    const author = authors?.[0];
    const isbns = [isbn_13, isbn_10].filter(Boolean) as string[];

    // Título enriquecido com volume — desambigua "Berserk Vol. 12" vs "Berserk".
    // Para mangás/quadrinhos buscamos por "Título N" ou "Título Vol N" para
    // tentar pegar a capa correta do volume.
    const isSerial = content_type === "manga" || content_type === "comic";
    const titleWithVolume = (title && volume_number && volume_number > 1)
      ? `${title} ${isSerial ? volume_number : `Vol. ${volume_number}`}`
      : title;

    // ---- 1. Run all sources in PARALLEL ----
    const tasks: Promise<Candidate[]>[] = [];
    for (const isbn of isbns) {
      tasks.push(srcOpenLibraryByIsbn(isbn));
      tasks.push(srcGoogleBooksByIsbn(isbn));
    }
    if (title) {
      // Mangás/quadrinhos: AniList primeiro (melhor fonte para esse nicho).
      if (content_type === "manga" || content_type === "comic") {
        tasks.push(srcAnilist(title, volume_number));
      }
      // Title-based searches usam o título enriquecido com volume quando aplicável.
      const tq = titleWithVolume || title;
      tasks.push(srcGoogleBooksByTitle(tq, author));
      tasks.push(srcOpenLibrarySearch(tq, author));
      // iTunes ebook é fraco para mangá BR; só rodamos para books "tradicionais".
      if (content_type !== "manga" && content_type !== "comic") {
        tasks.push(srcItunes(tq, author));
      }
      tasks.push(srcArchiveOrg(tq, author));
      tasks.push(srcWikidata(tq, author));
      // Subtitle pode mudar drasticamente o resultado (ex.: subtítulo da edição BR).
      if (subtitle && subtitle.trim() && subtitle.trim() !== title) {
        tasks.push(srcGoogleBooksByTitle(`${title} ${subtitle}`, author));
      }
    }

    const results = await Promise.allSettled(tasks);
    const candidates: Candidate[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") candidates.push(...r.value);
    }

    // Dedupe by URL
    const seen = new Set<string>();
    const unique = candidates.filter((c) => {
      if (seen.has(c.url)) return false;
      seen.add(c.url);
      return true;
    });

    // ---- 2. Validate + score in parallel ----
    const scored: ScoredCandidate[] = [];
    await Promise.all(unique.map(async (c) => {
      const dims = await probeImage(c.url);
      if (!dims) return;
      scored.push({ ...c, ...dims, score: scoreCandidate(c, dims) });
    }));

    // ---- 3. Pick winner ----
    scored.sort((a, b) => b.score - a.score);
    let winner = scored[0] ?? null;

    // ---- 4. AI fallback if no candidate passed validation ----
    if (!winner && title && !noAi) {
      const aiCands = await srcAiFallback(title, author, content_type);
      for (const c of aiCands) {
        const dims = await probeImage(c.url);
        if (dims) {
          winner = { ...c, ...dims, score: scoreCandidate(c, dims) };
          break;
        }
      }
    }

    // ---- 5. Persist ----
    if (winner && persist && bookId) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { error } = await supabase.from("books").update({ cover_url: winner.url }).eq("id", bookId);
      if (error) console.warn("[cover-search] persist failed:", error.message);
    }

    return new Response(JSON.stringify({
      cover_url: winner?.url ?? null,
      source: winner?.source ?? null,
      score: winner?.score ?? null,
      width: winner?.width ?? null,
      height: winner?.height ?? null,
      candidatesEvaluated: unique.length,
      candidatesValid: scored.length,
      sources: scored.slice(0, 5).map((s) => ({
        source: s.source, score: Math.round(s.score), w: s.width, h: s.height,
      })),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[cover-search] error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
