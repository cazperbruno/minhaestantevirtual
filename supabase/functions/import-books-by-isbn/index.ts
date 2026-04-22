// deno-lint-ignore-file no-explicit-any
/**
 * import-books-by-isbn — Importação INTELIGENTE por lista de ISBNs.
 *
 * Body: { isbns: string[], language?: string, useAi?: boolean }
 *  - isbns: até 100 por chamada
 *  - language: filtra por idioma final (ex: 'pt')
 *  - useAi: se true, dispara AI fallback nos ISBNs que nenhuma API resolveu (default true)
 *
 * Pipeline por ISBN:
 *   1. limpa + valida checksum (10 ou 13)
 *   2. checa banco interno em LOTE (1 query)
 *   3. cascade: BrasilAPI → OpenLibrary (3 endpoints) → Google Books → AI fallback
 *   4. mescla fontes (preserva PT-BR e maior qualidade)
 *   5. calcula quality_score 0-100
 *   6. dedupe por título+autor antes de inserir
 *   7. salva e enfileira no enrichment_queue se score < 60
 *   8. registra cada falha em book_audit_log
 *
 * Auth: admin OU service_role.
 */
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { requireAdmin } from "../_shared/admin-guard.ts";
import {
  fixPortugueseAccents,
  normalizeAuthors,
  computeQualityScore,
  isPortuguese,
  mergeBest,
  findDuplicateByTitleAuthor,
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
      headers: { "User-Agent": "Readify/import-2.0", Accept: "application/json" },
    });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    clearTimeout(t);
    return null;
  }
}

function normTitle(t: string) {
  return fixPortugueseAccents((t || "").replace(/\s+/g, " ").trim().slice(0, 500));
}

interface BookData extends NormalizedBookLite {
  title: string;
  authors: string[];
  source: string;
}

// ---------- Fontes ----------
async function fromBrasilApi(isbn: string): Promise<BookData | null> {
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

async function fromGoogle(isbn: string): Promise<BookData | null> {
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

async function fromOpenLibrary(isbn: string): Promise<BookData | null> {
  // Tenta /api/books primeiro (mais rico)
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

/**
 * Cascade por ISBN com merge progressivo. Para cedo se score >= 80 e PT-BR.
 */
async function cascadeForIsbn(
  isbn: string,
  useAi: boolean,
): Promise<{ data: BookData | null; sources: string[]; score: number; usedAi: boolean }> {
  const sources: string[] = [];
  let merged: BookData | null = null;
  const fetchers: Array<{ name: string; fn: (i: string) => Promise<BookData | null> }> = [
    { name: "brasilapi", fn: fromBrasilApi },
    { name: "openlibrary", fn: fromOpenLibrary },
    { name: "google-books", fn: fromGoogle },
  ];
  for (const f of fetchers) {
    sources.push(f.name);
    try {
      const got = await f.fn(isbn);
      if (!got || !got.title) continue;
      merged = merged ? (mergeBest(merged, got) as BookData) : got;
      const s = computeQualityScore(merged);
      if (s >= 80 && isPortuguese(merged)) break;
    } catch (e) {
      console.warn(`[cascade] ${f.name} threw: ${(e as Error).message}`);
    }
  }
  let usedAi = false;
  let score = merged ? computeQualityScore(merged) : 0;
  if (useAi && (!merged || score < 40)) {
    sources.push("ai-fallback");
    const ai = await aiFallbackInferBook(isbn);
    if (ai && ai.title) {
      usedAi = true;
      if (!merged) {
        merged = {
          ...ai,
          authors: ai.authors || [],
          source: "ai-fallback",
        } as BookData;
      } else {
        merged = mergeBest(merged, ai) as BookData;
        merged.source = `${merged.source}+ai`;
      }
      score = computeQualityScore(merged);
    }
  }
  return { data: merged, sources, score, usedAi };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return json({ error: guard.error }, guard.status ?? 403);
    const sb = guard.sb;

    const body = await req.json().catch(() => ({}));
    const rawIsbns: string[] = Array.isArray(body?.isbns) ? body.isbns : [];
    const language: string | null = body?.language || null;
    const useAi: boolean = body?.useAi !== false; // default true
    if (rawIsbns.length === 0) return json({ error: "isbns array required" }, 400);

    const t0 = Date.now();
    const summary = {
      received: rawIsbns.length,
      invalid: 0,
      already_existed: 0,
      not_found_external: 0,
      ai_fallback_used: 0,
      inserted: 0,
      enqueued_for_enrichment: 0,
      filtered_by_language: 0,
      avg_quality_score: 0,
      errors: [] as string[],
      sample: [] as { isbn: string; title: string; score: number; source: string }[],
      duration_ms: 0,
    };

    // 1. valida ISBNs
    const validIsbns: string[] = [];
    for (const raw of rawIsbns.slice(0, 100)) {
      const c = cleanIsbn(raw);
      if (isValidIsbn13(c)) validIsbns.push(c);
      else if (isValidIsbn10(c)) {
        const c13 = isbn10To13(c);
        if (c13) validIsbns.push(c13);
        else summary.invalid++;
      } else summary.invalid++;
    }
    if (validIsbns.length === 0) {
      summary.duration_ms = Date.now() - t0;
      return json(summary);
    }

    // 2. checa banco interno em LOTE
    const { data: existing } = await sb
      .from("books")
      .select("isbn_13, isbn_10")
      .or(`isbn_13.in.(${validIsbns.join(",")}),isbn_10.in.(${validIsbns.join(",")})`);
    const existSet = new Set<string>();
    (existing || []).forEach((r: any) => {
      if (r.isbn_13) existSet.add(r.isbn_13);
      if (r.isbn_10) existSet.add(r.isbn_10);
    });
    const toFetch = validIsbns.filter((i) => !existSet.has(i));
    summary.already_existed = validIsbns.length - toFetch.length;

    // 3. cascade em paralelo (chunks de 5 — limite de polidez para APIs públicas)
    interface Resolved { isbn: string; data: BookData | null; sources: string[]; score: number; usedAi: boolean }
    const resolved: Resolved[] = [];
    for (let i = 0; i < toFetch.length; i += 5) {
      const chunk = toFetch.slice(i, i + 5);
      const results = await Promise.all(
        chunk.map(async (isbn) => {
          const r = await cascadeForIsbn(isbn, useAi);
          return { isbn, ...r };
        }),
      );
      for (const r of results) {
        if (!r.data) {
          summary.not_found_external++;
          await sb.from("book_audit_log").insert({
            process: "import-books-by-isbn",
            action: "not-found",
            fields_changed: [],
            details: { isbn: r.isbn, sources_tried: r.sources, ai_attempted: r.sources.includes("ai-fallback") },
          });
          continue;
        }
        if (language && r.data.language && r.data.language !== language) {
          summary.filtered_by_language++;
          continue;
        }
        if (!r.data.isbn_13 && r.isbn.length === 13) r.data.isbn_13 = r.isbn;
        if (!r.data.isbn_10 && r.isbn.length === 10) r.data.isbn_10 = r.isbn;
        if (r.usedAi) summary.ai_fallback_used++;
        resolved.push(r);
      }
      if (i + 5 < toFetch.length) await new Promise((res) => setTimeout(res, 200));
    }

    // 4. dedupe título+autor antes de inserir + inserção idempotente
    const insertedIds: string[] = [];
    const lowQualityIds: string[] = [];
    const scoreSum = { total: 0, count: 0 };

    for (const r of resolved) {
      const data = r.data!;
      const score = computeQualityScore(data);
      scoreSum.total += score;
      scoreSum.count += 1;

      // dedupe título+autor (livros sem ISBN ou com edições paralelas)
      if (data.title && data.authors?.length) {
        const dup = await findDuplicateByTitleAuthor(sb, data.title, data.authors);
        if (dup) {
          summary.already_existed++;
          continue;
        }
      }

      const { data: ins, error } = await sb
        .from("books")
        .upsert(
          {
            title: data.title,
            subtitle: data.subtitle,
            authors: data.authors,
            isbn_13: data.isbn_13,
            isbn_10: data.isbn_10,
            cover_url: data.cover_url,
            description: data.description,
            publisher: data.publisher,
            published_year: data.published_year,
            page_count: data.page_count,
            language: data.language,
            categories: data.categories || [],
            source: data.source,
            source_id: data.source_id,
            content_type: "book" as const,
            quality_score: score,
          },
          { onConflict: "isbn_13", ignoreDuplicates: true },
        )
        .select("id, title");
      if (error) {
        summary.errors.push(`${r.isbn}: ${error.message}`);
        continue;
      }
      const row = ins?.[0];
      if (row) {
        summary.inserted++;
        insertedIds.push(row.id);
        if (score < 60) lowQualityIds.push(row.id);
        if (summary.sample.length < 8) {
          summary.sample.push({ isbn: r.isbn, title: row.title, score, source: data.source });
        }
      } else {
        // upsert ignored (já existia)
        summary.already_existed++;
      }
    }

    if (scoreSum.count > 0) {
      summary.avg_quality_score = Math.round(scoreSum.total / scoreSum.count);
    }

    // 5. enfileira enrichment para inseridos com baixa qualidade (e novos genéricos)
    const toEnqueue = lowQualityIds.length ? lowQualityIds : insertedIds;
    if (toEnqueue.length > 0) {
      const { error: eqErr } = await sb
        .from("enrichment_queue")
        .insert(toEnqueue.map((id) => ({ book_id: id })));
      if (!eqErr) summary.enqueued_for_enrichment = toEnqueue.length;
    }

    // 6. audit log
    await sb.from("book_audit_log").insert({
      process: "import-books-by-isbn",
      action: "import",
      fields_changed: ["bulk_isbn_import"],
      details: {
        received: summary.received,
        inserted: summary.inserted,
        already_existed: summary.already_existed,
        invalid: summary.invalid,
        not_found_external: summary.not_found_external,
        ai_fallback_used: summary.ai_fallback_used,
        avg_quality_score: summary.avg_quality_score,
        language_filter: language,
      },
    });

    summary.duration_ms = Date.now() - t0;
    return json(summary);
  } catch (e) {
    console.error("import-books-by-isbn error", e);
    return json({ error: e instanceof Error ? e.message : "Erro" }, 500);
  }
});
