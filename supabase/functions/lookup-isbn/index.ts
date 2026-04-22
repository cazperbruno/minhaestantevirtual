// deno-lint-ignore-file no-explicit-any
/**
 * lookup-isbn — Busca PREVIEW de UM ISBN sem persistir nada.
 *
 * Uso: { isbn: "9788532530802", useAi?: boolean }
 *
 * Retorna o melhor resultado mesclado das fontes (BrasilAPI → OpenLibrary
 * → Google Books → AI fallback) + score de qualidade + lista de fontes
 * tentadas. Permite ao admin validar visualmente antes de importar.
 *
 * Auth: admin com CSRF.
 */
import { requireAdmin } from "../_shared/admin-guard.ts";
import {
  fixPortugueseAccents,
  normalizeAuthors,
  computeQualityScore,
  isPortuguese,
  mergeBest,
  aiFallbackInferBook,
  type NormalizedBookLite,
} from "../_shared/isbn-intelligence.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-csrf-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (b: any, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const cleanIsbn = (s: string) => (s || "").replace(/[^0-9Xx]/g, "").toUpperCase();
function isValidIsbn13(i: string) {
  if (!/^\d{13}$/.test(i)) return false;
  let s = 0;
  for (let n = 0; n < 13; n++) s += (n % 2 === 0 ? 1 : 3) * parseInt(i[n], 10);
  return s % 10 === 0;
}
function isValidIsbn10(i: string) {
  if (!/^\d{9}[\dX]$/.test(i)) return false;
  let s = 0;
  for (let n = 0; n < 9; n++) s += (n + 1) * parseInt(i[n], 10);
  s += 10 * (i[9] === "X" ? 10 : parseInt(i[9], 10));
  return s % 11 === 0;
}
function isbn10To13(i: string): string | null {
  if (!isValidIsbn10(i)) return null;
  const c = "978" + i.slice(0, 9);
  let s = 0;
  for (let n = 0; n < 12; n++) s += (n % 2 === 0 ? 1 : 3) * parseInt(c[n], 10);
  return c + ((10 - (s % 10)) % 10);
}

async function fetchJson(url: string, timeoutMs = 6000): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Readify/lookup-1.0", Accept: "application/json" },
    });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    clearTimeout(t);
    return null;
  }
}

const normTitle = (t: string) =>
  fixPortugueseAccents((t || "").replace(/\s+/g, " ").trim().slice(0, 500));

async function fromBrasilApi(isbn: string): Promise<NormalizedBookLite | null> {
  const j = await fetchJson(`https://brasilapi.com.br/api/isbn/v1/${isbn}`, 7000);
  if (!j?.title) return null;
  const yearStr = j.year ?? j.publish_date ?? null;
  const year = yearStr ? parseInt(String(yearStr).slice(0, 4)) || null : null;
  return {
    title: normTitle(j.title),
    subtitle: j.subtitle ? fixPortugueseAccents(j.subtitle) : null,
    authors: normalizeAuthors(Array.isArray(j.authors) ? j.authors : (j.authors ? [j.authors] : [])),
    isbn_13: j.isbn?.length === 13 ? j.isbn : (isbn.length === 13 ? isbn : null),
    isbn_10: j.isbn?.length === 10 ? j.isbn : null,
    cover_url: j.cover_url || null,
    description: j.synopsis ? fixPortugueseAccents(j.synopsis) : null,
    publisher: j.publisher || null,
    published_year: year,
    page_count: j.page_count || null,
    language: j.language || "pt",
    categories: Array.isArray(j.subjects) ? j.subjects.slice(0, 8) : [],
    source: `brasilapi:${j.provider || "agg"}`,
    source_id: j.isbn || isbn,
  };
}
async function fromGoogle(isbn: string): Promise<NormalizedBookLite | null> {
  const j = await fetchJson(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1`,
  );
  const item = j?.items?.[0];
  if (!item) return null;
  const v = item.volumeInfo || {};
  const ids: any[] = v.industryIdentifiers || [];
  const i13 = ids.find((x) => x.type === "ISBN_13")?.identifier ?? null;
  const i10 = ids.find((x) => x.type === "ISBN_10")?.identifier ?? null;
  const img =
    v.imageLinks?.extraLarge || v.imageLinks?.large ||
    v.imageLinks?.medium || v.imageLinks?.thumbnail || null;
  return {
    title: normTitle(v.title || ""),
    subtitle: v.subtitle ? fixPortugueseAccents(v.subtitle) : null,
    authors: normalizeAuthors(v.authors || []),
    isbn_13: i13,
    isbn_10: i10,
    cover_url: img ? img.replace(/^http:/, "https:") : null,
    description: v.description ? fixPortugueseAccents(v.description) : null,
    publisher: v.publisher || null,
    published_year: v.publishedDate ? parseInt(String(v.publishedDate).slice(0, 4)) || null : null,
    page_count: v.pageCount || null,
    language: v.language || null,
    categories: (v.categories || []).slice(0, 8),
    source: "google-books",
    source_id: item.id || null,
  };
}
async function fromOpenLibrary(isbn: string): Promise<NormalizedBookLite | null> {
  const j = await fetchJson(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
  );
  const v = j?.[`ISBN:${isbn}`];
  if (!v) return null;
  return {
    title: normTitle(v.title || ""),
    subtitle: v.subtitle ? fixPortugueseAccents(v.subtitle) : null,
    authors: normalizeAuthors((v.authors || []).map((a: any) => a.name).filter(Boolean)),
    isbn_13: isbn.length === 13 ? isbn : null,
    isbn_10: isbn.length === 10 ? isbn : null,
    cover_url: v.cover?.large || v.cover?.medium || null,
    description: typeof v.notes === "string" ? fixPortugueseAccents(v.notes) : null,
    publisher: v.publishers?.[0]?.name || null,
    published_year: v.publish_date ? parseInt(String(v.publish_date).slice(-4)) || null : null,
    page_count: v.number_of_pages || null,
    language: null,
    categories: (v.subjects || []).slice(0, 8).map((s: any) => s.name).filter(Boolean),
    source: "openlibrary",
    source_id: v.key || null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return json({ error: guard.error }, guard.status ?? 403);
    const sb = guard.sb;

    const body = await req.json().catch(() => ({}));
    const raw = String(body?.isbn || "");
    const useAi = body?.useAi !== false;
    const cleaned = cleanIsbn(raw);
    let isbn = cleaned;
    if (!isValidIsbn13(isbn)) {
      if (isValidIsbn10(isbn)) {
        const i13 = isbn10To13(isbn);
        if (i13) isbn = i13;
      } else {
        return json({ error: "ISBN inválido", input: raw }, 400);
      }
    }

    const t0 = Date.now();
    // 1. Banco interno antes
    const { data: existing } = await sb
      .from("books")
      .select("id, title, authors, cover_url, language, source, quality_score")
      .or(`isbn_13.eq.${isbn},isbn_10.eq.${isbn}`)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return json({
        ok: true,
        already_in_database: true,
        existing,
        duration_ms: Date.now() - t0,
      });
    }

    const sources: string[] = [];
    let merged: NormalizedBookLite | null = null;
    const fetchers: Array<{ name: string; fn: (i: string) => Promise<NormalizedBookLite | null> }> = [
      { name: "brasilapi", fn: fromBrasilApi },
      { name: "openlibrary", fn: fromOpenLibrary },
      { name: "google-books", fn: fromGoogle },
    ];
    const sourceResults: Record<string, boolean> = {};
    for (const f of fetchers) {
      sources.push(f.name);
      try {
        const got = await f.fn(isbn);
        sourceResults[f.name] = !!got?.title;
        if (!got || !got.title) continue;
        merged = merged ? mergeBest(merged, got) : got;
        const s = computeQualityScore(merged);
        if (s >= 80 && isPortuguese(merged)) break;
      } catch {
        sourceResults[f.name] = false;
      }
    }
    let usedAi = false;
    if (useAi && (!merged || computeQualityScore(merged) < 40)) {
      sources.push("ai-fallback");
      const ai = await aiFallbackInferBook(isbn);
      sourceResults["ai-fallback"] = !!ai;
      if (ai && ai.title) {
        usedAi = true;
        merged = merged ? mergeBest(merged, ai) : ai;
      }
    }

    if (!merged) {
      return json({
        ok: false,
        not_found: true,
        isbn,
        sources_tried: sources,
        source_results: sourceResults,
        duration_ms: Date.now() - t0,
      });
    }

    const score = computeQualityScore(merged);
    return json({
      ok: true,
      isbn,
      data: merged,
      quality_score: score,
      sources_tried: sources,
      source_results: sourceResults,
      used_ai: usedAi,
      is_portuguese: isPortuguese(merged),
      duration_ms: Date.now() - t0,
    });
  } catch (e) {
    console.error("lookup-isbn error", e);
    return json({ error: e instanceof Error ? e.message : "Erro" }, 500);
  }
});
