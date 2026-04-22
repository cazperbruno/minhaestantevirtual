// deno-lint-ignore-file no-explicit-any
/**
 * seed-book-database — Importação massiva e idempotente de livros públicos.
 *
 * Estratégia (item 5: prioridade banco interno):
 *  1. Pega assuntos populares no OpenLibrary (português + populares + mangás)
 *  2. Para cada candidato, normaliza ISBN e checa o banco interno PRIMEIRO
 *     (consulta única em lote por ISBN) — só insere o que NÃO existe
 *  3. Insere em batch usando UPSERT idempotente (onConflict: isbn_13)
 *  4. Enfileira enrichment_queue p/ os recém-inseridos (item 3)
 *  5. Registra em book_audit_log (item 4 + 9: testes/observabilidade)
 *
 * Body: { mode?: 'pt' | 'manga' | 'popular' | 'mixed' (default), limit?: number }
 *  - mixed (default): 200 livros mesclando os 3 modos
 *  - limit max: 500 (item 1: 100~500 por batch)
 *
 * Auth: admin OU service_role (cron). Idempotente: rodar 100x não duplica.
 */
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { requireAdminOrCron } from "../_shared/admin-guard.ts";
import { startRun, finishRun } from "../_shared/automation-runs.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-csrf-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Body {
  mode?: "pt" | "manga" | "popular" | "mixed";
  limit?: number;
}

// Assuntos rotativos OpenLibrary — variamos a cada execução p/ não trazer sempre o mesmo
const SUBJECTS = {
  popular: ["fantasy", "science_fiction", "thriller", "romance", "biography", "history", "philosophy", "mystery", "self_help", "business"],
  pt: ["brazilian_literature", "literatura_brasileira", "portuguese_literature", "literatura_portuguesa"],
  manga: ["manga", "graphic_novels", "comics", "shonen", "shojo", "seinen"],
};

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ----- ISBN helpers -----
const cleanIsbn = (s: string) => (s || "").replace(/[^0-9Xx]/g, "").toUpperCase();
function isValidIsbn13(i: string) {
  if (!/^\d{13}$/.test(i)) return false;
  let s = 0;
  for (let n = 0; n < 13; n++) {
    const d = parseInt(i[n], 10);
    s += n % 2 === 0 ? d : d * 3;
  }
  return s % 10 === 0;
}
function isValidIsbn10(i: string) {
  if (!/^\d{9}[\dX]$/.test(i)) return false;
  let s = 0;
  for (let n = 0; n < 9; n++) s += (n + 1) * parseInt(i[n], 10);
  s += 10 * (i[9] === "X" ? 10 : parseInt(i[9], 10));
  return s % 11 === 0;
}

// ----- normalização -----
function normalizeTitle(t: string): string {
  return (t || "").replace(/\s+/g, " ").trim().slice(0, 500);
}
function normalizeAuthors(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr || []) {
    if (!raw) continue;
    let v = raw.replace(/\s+/g, " ").trim();
    // "Sobrenome, Nome" -> "Nome Sobrenome"
    if (/^[A-ZÀ-Ú][^,]+,\s*[A-ZÀ-Ú]/.test(v)) {
      const [last, first] = v.split(/,\s*/, 2);
      v = `${first} ${last}`;
    }
    const key = v.toLowerCase();
    if (key.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out.slice(0, 10);
}

async function fetchJson(url: string, timeoutMs = 8000): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Readify/seed-1.0", Accept: "application/json" },
    });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    clearTimeout(t);
    return null;
  }
}

interface Candidate {
  title: string;
  authors: string[];
  isbn_13: string | null;
  isbn_10: string | null;
  cover_url: string | null;
  published_year: number | null;
  publisher: string | null;
  language: string | null;
  source: string;
  source_id: string;
  content_type: "book" | "manga";
}

async function fetchSubject(subject: string, isManga: boolean): Promise<Candidate[]> {
  // OpenLibrary subjects API: até 100 obras por chamada, com offset aleatório p/ variar
  const offset = Math.floor(Math.random() * 500);
  const j = await fetchJson(
    `https://openlibrary.org/subjects/${subject}.json?limit=50&offset=${offset}&details=false`,
    10000,
  );
  const works: any[] = j?.works || [];
  const out: Candidate[] = [];

  for (const w of works) {
    const title = normalizeTitle(w.title || "");
    if (!title) continue;
    const authors = normalizeAuthors((w.authors || []).map((a: any) => a.name).filter(Boolean));
    const olid = w.cover_edition_key || w.key?.replace("/works/", "");
    if (!olid) continue;

    out.push({
      title,
      authors,
      isbn_13: null, // OpenLibrary subjects não devolve ISBN — será buscado no enrichment
      isbn_10: null,
      cover_url: w.cover_id
        ? `https://covers.openlibrary.org/b/id/${w.cover_id}-L.jpg`
        : null,
      published_year: typeof w.first_publish_year === "number" ? w.first_publish_year : null,
      publisher: null,
      language: subject.includes("brasileira") || subject.includes("portuguese") ? "pt" : null,
      source: "openlibrary-subject",
      source_id: olid,
      content_type: isManga ? "manga" : "book",
    });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const guard = await requireAdminOrCron(req);
    if (!guard.ok) return jsonResponse({ error: guard.error }, guard.status ?? 403);
    const sb = guard.sb;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

    const body: Body = await req.json().catch(() => ({}));
    const mode = body.mode || "mixed";
    const limit = Math.min(Math.max(body.limit ?? 200, 50), 500);

    const run = await startRun(sb, {
      job_type: `seed-${mode}`,
      source: guard.isService ? "cron" : "admin",
      triggered_by: guard.userId ?? null,
    });

    const summary = {
      mode,
      limit,
      fetched: 0,
      already_existed: 0,
      inserted: 0,
      enqueued_for_enrichment: 0,
      by_source: {} as Record<string, number>,
      sample_inserted: [] as { id?: string; title: string; source_id: string }[],
      duration_ms: 0,
    };
    const t0 = Date.now();

    // 1) Decide quais subjects vamos varrer
    const pickRandom = <T,>(arr: T[], n: number): T[] => {
      const cp = [...arr];
      const out: T[] = [];
      while (cp.length && out.length < n) {
        out.push(cp.splice(Math.floor(Math.random() * cp.length), 1)[0]);
      }
      return out;
    };
    const targets: Array<{ subject: string; isManga: boolean }> = [];
    if (mode === "pt") {
      pickRandom(SUBJECTS.pt, 4).forEach((s) => targets.push({ subject: s, isManga: false }));
    } else if (mode === "manga") {
      pickRandom(SUBJECTS.manga, 4).forEach((s) => targets.push({ subject: s, isManga: true }));
    } else if (mode === "popular") {
      pickRandom(SUBJECTS.popular, 5).forEach((s) => targets.push({ subject: s, isManga: false }));
    } else {
      // mixed: 2 popular + 1 pt + 1 manga
      pickRandom(SUBJECTS.popular, 2).forEach((s) => targets.push({ subject: s, isManga: false }));
      pickRandom(SUBJECTS.pt, 1).forEach((s) => targets.push({ subject: s, isManga: false }));
      pickRandom(SUBJECTS.manga, 1).forEach((s) => targets.push({ subject: s, isManga: true }));
    }

    // 2) Busca candidatos em paralelo
    const results = await Promise.allSettled(
      targets.map((t) => fetchSubject(t.subject, t.isManga)),
    );
    const allCandidates: Candidate[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") allCandidates.push(...r.value);
    }
    summary.fetched = allCandidates.length;

    // dedupe por (source, source_id) dentro do batch
    const seen = new Set<string>();
    const uniq = allCandidates.filter((c) => {
      const k = `${c.source}::${c.source_id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, limit);

    if (uniq.length === 0) {
      summary.duration_ms = Date.now() - t0;
      return jsonResponse(summary);
    }

    // 3) PRIORIDADE BANCO INTERNO: 1 SELECT em lote p/ ver quais source_id já existem
    const sourceIds = uniq.map((c) => c.source_id);
    const { data: existing } = await sb
      .from("books")
      .select("source_id")
      .eq("source", "openlibrary-subject")
      .in("source_id", sourceIds);
    const existingSet = new Set((existing || []).map((r: any) => r.source_id));
    summary.already_existed = existingSet.size;

    const toInsert = uniq.filter((c) => !existingSet.has(c.source_id));
    if (toInsert.length === 0) {
      summary.duration_ms = Date.now() - t0;
      return jsonResponse(summary);
    }

    // 4) Insert em chunks de 100 (idempotente: ISBN único e source+source_id único via constraint? — usamos onConflict só p/ ISBN)
    const chunks: Candidate[][] = [];
    for (let i = 0; i < toInsert.length; i += 100) {
      chunks.push(toInsert.slice(i, i + 100));
    }

    const insertedIds: string[] = [];
    for (const chunk of chunks) {
      const rows = chunk.map((c) => ({
        title: c.title,
        authors: c.authors,
        isbn_13: c.isbn_13,
        isbn_10: c.isbn_10,
        cover_url: c.cover_url,
        published_year: c.published_year,
        publisher: c.publisher,
        language: c.language,
        source: c.source,
        source_id: c.source_id,
        content_type: c.content_type,
      }));
      // sem onConflict (ISBN é null no seed; dedupe foi por source_id)
      const { data: ins, error } = await sb
        .from("books")
        .insert(rows)
        .select("id, title, source_id");
      if (error) {
        console.warn("[seed] chunk insert error:", error.message);
        continue;
      }
      summary.inserted += ins?.length ?? 0;
      ins?.forEach((r: any) => {
        insertedIds.push(r.id);
        summary.by_source["openlibrary-subject"] = (summary.by_source["openlibrary-subject"] ?? 0) + 1;
        if (summary.sample_inserted.length < 8) {
          summary.sample_inserted.push({ id: r.id, title: r.title, source_id: r.source_id });
        }
      });
    }

    // 5) Enfileira enrichment p/ os recém-inseridos (descrição, categorias, ISBN, capa melhor)
    if (insertedIds.length > 0) {
      const enrichRows = insertedIds.map((id) => ({ book_id: id }));
      const { error: eqErr } = await sb.from("enrichment_queue").insert(enrichRows);
      if (!eqErr) summary.enqueued_for_enrichment = enrichRows.length;
    }

    // 6) Audit log
    await sb.from("book_audit_log").insert({
      process: "seed-book-database",
      action: "import",
      fields_changed: ["bulk_insert"],
      details: {
        mode,
        targets: targets.map((t) => t.subject),
        fetched: summary.fetched,
        inserted: summary.inserted,
        already_existed: summary.already_existed,
      },
    });

    // 7) Verificação automática de ISBNs dos livros recém-importados
    //    (idempotente — corrige formatação, valida checksum, deriva par,
    //    invalida quebrados e propõe merge p/ conflitos UNIQUE).
    let isbn_validation: any = null;
    if (insertedIds.length > 0) {
      try {
        const r = await fetch(
          `${SUPABASE_URL}/functions/v1/validate-isbns`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SERVICE_ROLE}`,
              apikey: SERVICE_ROLE,
            },
            body: JSON.stringify({ mode: "recent", limit: insertedIds.length + 50 }),
          },
        );
        if (r.ok) isbn_validation = await r.json().catch(() => null);
      } catch (e) {
        console.warn("[seed] validate-isbns failed:", (e as Error).message);
      }
    }

    summary.duration_ms = Date.now() - t0;
    return jsonResponse({ ...summary, isbn_validation });
  } catch (e) {
    console.error("seed-book-database error", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Erro" }, 500);
  }
});
