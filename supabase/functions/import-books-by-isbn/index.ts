// deno-lint-ignore-file no-explicit-any
/**
 * import-books-by-isbn — Importação inteligente por lista de ISBNs.
 *
 * Body: { isbns: string[], language?: string }
 *  - isbns: até 100 por chamada (rate-limit interno)
 *  - language: opcional, filtra resultados (ex: 'pt')
 *
 * Para cada ISBN:
 *   1. limpa + valida checksum
 *   2. checa banco interno PRIMEIRO (1 SELECT batch por isbn_13/isbn_10)
 *   3. se não existe: busca Google Books -> OpenLibrary fallback
 *   4. salva e enfileira em enrichment_queue
 *
 * Auth: admin OU service_role.
 */
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
      headers: { "User-Agent": "Readify/import-1.0", Accept: "application/json" },
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
  return (t || "").replace(/\s+/g, " ").trim().slice(0, 500);
}
function normAuthors(arr: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of arr || []) {
    let v = (raw || "").replace(/\s+/g, " ").trim();
    if (!v) continue;
    if (/^[A-ZÀ-Ú][^,]+,\s*[A-ZÀ-Ú]/.test(v)) {
      const [last, first] = v.split(/,\s*/, 2);
      v = `${first} ${last}`;
    }
    const k = v.toLowerCase();
    if (k.length < 2 || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out.slice(0, 10);
}

interface BookData {
  title: string;
  authors: string[];
  isbn_13: string | null;
  isbn_10: string | null;
  cover_url: string | null;
  description: string | null;
  publisher: string | null;
  published_year: number | null;
  page_count: number | null;
  language: string | null;
  categories: string[];
  source: string;
  source_id: string | null;
}

async function fetchFromGoogle(isbn: string): Promise<BookData | null> {
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
    authors: normAuthors(v.authors || []),
    isbn_13: i13,
    isbn_10: i10,
    cover_url: img ? img.replace(/^http:/, "https:") : null,
    description: v.description || null,
    publisher: v.publisher || null,
    published_year: v.publishedDate ? parseInt(String(v.publishedDate).slice(0, 4), 10) || null : null,
    page_count: v.pageCount || null,
    language: v.language || null,
    categories: (v.categories || []).slice(0, 8),
    source: "google-books",
    source_id: item.id || null,
  };
}

async function fetchFromOpenLibrary(isbn: string): Promise<BookData | null> {
  const j = await fetchJson(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
  );
  const v = j?.[`ISBN:${isbn}`];
  if (!v) return null;
  return {
    title: normTitle(v.title || ""),
    authors: normAuthors((v.authors || []).map((a: any) => a.name).filter(Boolean)),
    isbn_13: isbn.length === 13 ? isbn : null,
    isbn_10: isbn.length === 10 ? isbn : null,
    cover_url: v.cover?.large || v.cover?.medium || null,
    description: typeof v.notes === "string" ? v.notes : null,
    publisher: v.publishers?.[0]?.name || null,
    published_year: v.publish_date ? parseInt(String(v.publish_date).slice(-4), 10) || null : null,
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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const isService =
      authHeader === `Bearer ${SERVICE_ROLE}` || req.headers.get("apikey") === SERVICE_ROLE;
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (!isService) {
      if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(SUPABASE_URL, ANON, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: u } = await userClient.auth.getUser();
      if (!u?.user) return json({ error: "Unauthorized" }, 401);
      const { data: isAdmin } = await sb.rpc("has_role", {
        _user_id: u.user.id,
        _role: "admin",
      });
      if (!isAdmin) return json({ error: "Admin only" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const rawIsbns: string[] = Array.isArray(body?.isbns) ? body.isbns : [];
    const language: string | null = body?.language || null;
    if (rawIsbns.length === 0) return json({ error: "isbns array required" }, 400);

    const t0 = Date.now();
    const summary = {
      received: rawIsbns.length,
      invalid: 0,
      already_existed: 0,
      not_found_external: 0,
      inserted: 0,
      enqueued_for_enrichment: 0,
      filtered_by_language: 0,
      errors: [] as string[],
      sample: [] as { isbn: string; title: string }[],
      duration_ms: 0,
    };

    // 1. valida e normaliza ISBNs
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
      .or(
        `isbn_13.in.(${validIsbns.join(",")}),isbn_10.in.(${validIsbns.join(",")})`,
      );
    const existSet = new Set<string>();
    (existing || []).forEach((r: any) => {
      if (r.isbn_13) existSet.add(r.isbn_13);
      if (r.isbn_10) existSet.add(r.isbn_10);
    });
    const toFetch = validIsbns.filter((i) => !existSet.has(i));
    summary.already_existed = validIsbns.length - toFetch.length;

    // 3. busca externa em paralelo controlado (chunks de 5)
    const fetched: BookData[] = [];
    for (let i = 0; i < toFetch.length; i += 5) {
      const chunk = toFetch.slice(i, i + 5);
      const results = await Promise.all(
        chunk.map(async (isbn) => {
          const g = await fetchFromGoogle(isbn);
          if (g && g.title) return { isbn, data: g };
          const o = await fetchFromOpenLibrary(isbn);
          if (o && o.title) return { isbn, data: o };
          return { isbn, data: null };
        }),
      );
      for (const r of results) {
        if (!r.data) {
          summary.not_found_external++;
        } else if (language && r.data.language && r.data.language !== language) {
          summary.filtered_by_language++;
        } else {
          if (!r.data.isbn_13 && r.isbn.length === 13) r.data.isbn_13 = r.isbn;
          if (!r.data.isbn_10 && r.isbn.length === 10) r.data.isbn_10 = r.isbn;
          fetched.push(r.data);
        }
      }
      // pequeno respiro para evitar rate-limit
      if (i + 5 < toFetch.length) await new Promise((res) => setTimeout(res, 200));
    }

    // 4. inserção em lote
    const insertedIds: string[] = [];
    for (let i = 0; i < fetched.length; i += 50) {
      const chunk = fetched.slice(i, i + 50);
      const rows = chunk.map((c) => ({
        title: c.title,
        authors: c.authors,
        isbn_13: c.isbn_13,
        isbn_10: c.isbn_10,
        cover_url: c.cover_url,
        description: c.description,
        publisher: c.publisher,
        published_year: c.published_year,
        page_count: c.page_count,
        language: c.language,
        categories: c.categories,
        source: c.source,
        source_id: c.source_id,
        content_type: "book" as const,
      }));
      const { data: ins, error } = await sb
        .from("books")
        .upsert(rows, { onConflict: "isbn_13", ignoreDuplicates: true })
        .select("id, title");
      if (error) {
        summary.errors.push(error.message);
        continue;
      }
      summary.inserted += ins?.length ?? 0;
      ins?.forEach((r: any) => {
        insertedIds.push(r.id);
        if (summary.sample.length < 8) {
          const isbn = chunk.find((x) => x.title === r.title)?.isbn_13 || "";
          summary.sample.push({ isbn, title: r.title });
        }
      });
    }

    // 5. enfileira enrichment
    if (insertedIds.length > 0) {
      const { error: eqErr } = await sb
        .from("enrichment_queue")
        .insert(insertedIds.map((id) => ({ book_id: id })));
      if (!eqErr) summary.enqueued_for_enrichment = insertedIds.length;
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
      },
    });

    summary.duration_ms = Date.now() - t0;
    return json(summary);
  } catch (e) {
    console.error("import-books-by-isbn error", e);
    return json({ error: e instanceof Error ? e.message : "Erro" }, 500);
  }
});
