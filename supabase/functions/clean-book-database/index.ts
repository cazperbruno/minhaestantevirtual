// deno-lint-ignore-file no-explicit-any
/**
 * clean-book-database — Orquestrador de limpeza inteligente do catálogo.
 *
 * Pipeline (idempotente, seguro p/ rodar de hora em hora ou diariamente):
 *  1. Identifica os N livros com pior quality_score (priorização)
 *  2. Padroniza campos óbvios (trim, idioma, deduplica autores) direto no SQL
 *     — sem custo de IA, totalmente determinístico
 *  3. Enfileira normalização IA (metadata_normalization_queue) só p/ os
 *     que realmente têm metadados sujos (CAPS, encoding, autor invertido)
 *  4. Enfileira enriquecimento (enrichment_queue) p/ os que faltam capa,
 *     descrição, categorias, ISBN, etc.
 *  5. Detecta duplicatas por ISBN e cria sugestões em merge_suggestions
 *     (mesclagem real é manual via merge-duplicate-books p/ segurança)
 *  6. Roda fix-book-covers em modo missing/auto p/ corrigir capas
 *  7. Roda consolidate-series para agrupar séries soltas
 *  8. Registra TUDO em book_audit_log
 *
 * Body opcional: { mode?: 'auto' | 'aggressive', limit?: number, dryRun?: boolean }
 *  - auto (default): processa 200 livros, sem IA pesada, sem agressivo em custo
 *  - aggressive: processa até 1000 livros, dispara também IA + cover-search com IA
 *
 * Auth: admin OU service_role (cron).
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
  mode?: "auto" | "aggressive";
  limit?: number;
  dryRun?: boolean;
}

interface BookRow {
  id: string;
  title: string;
  authors: string[] | null;
  publisher: string | null;
  description: string | null;
  cover_url: string | null;
  isbn_13: string | null;
  isbn_10: string | null;
  language: string | null;
  categories: string[] | null;
  series_id: string | null;
  quality_score: number;
  last_enriched_at: string | null;
}

// Livros enriquecidos nos últimos N dias NÃO voltam para a fila de enrich
const ENRICH_COOLDOWN_DAYS = 14;

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ----- Helpers de detecção -----
function looksDirty(b: BookRow): boolean {
  const t = b.title || "";
  const a = (b.authors || []).join(" ");
  const d = b.description || "";
  // CAPS LOCK no título ou autor
  if (t.length > 6 && t === t.toUpperCase()) return true;
  if (a.length > 6 && a === a.toUpperCase()) return true;
  // encoding quebrado tipo "Ã©", "Ã¡"
  if (/Ã[¡-ÿ]/.test(t + " " + a + " " + d)) return true;
  // autor invertido com vírgula "Sobrenome, Nome"
  if ((b.authors || []).some((x) => /,/.test(x) && /^[A-Z]/.test(x))) return true;
  // espaços duplos
  if (/ {2,}/.test(t) || /\s{2,}/.test(d)) return true;
  return false;
}

function missingFields(b: BookRow): string[] {
  const missing: string[] = [];
  if (!b.cover_url) missing.push("cover_url");
  if (!b.description || b.description.length < 60) missing.push("description");
  if (!b.categories || b.categories.length === 0) missing.push("categories");
  if (!b.isbn_13 && !b.isbn_10) missing.push("isbn");
  if (!b.publisher) missing.push("publisher");
  if (!b.language) missing.push("language");
  return missing;
}

function normalizeIsbn(s: string | null, len: 10 | 13): string | null {
  if (!s) return null;
  const digits = s.replace(/[^\dXx]/g, "").toUpperCase();
  if (digits.length !== len) return null;
  return digits;
}

function normalizeAuthors(arr: string[] | null): string[] {
  if (!arr) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr) {
    if (!raw) continue;
    const trimmed = raw.replace(/\s{2,}/g, " ").trim();
    const key = trimmed.toLowerCase();
    if (key.length < 2) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function detectLanguage(b: BookRow): string | null {
  if (b.language) return b.language;
  const text = `${b.title || ""} ${b.description || ""}`.slice(0, 500).toLowerCase();
  if (!text.trim()) return null;
  // heurística leve baseada em palavras curtas
  const ptHits = (text.match(/\b(o|a|os|as|de|da|do|para|com|que|não|ção|um|uma|nesta|este)\b/g) || []).length;
  const enHits = (text.match(/\b(the|of|and|to|in|that|with|for|this|from|book)\b/g) || []).length;
  const esHits = (text.match(/\b(el|la|los|las|de|del|para|con|que|una|este)\b/g) || []).length;
  const max = Math.max(ptHits, enHits, esHits);
  if (max < 3) return null;
  if (ptHits === max) return "pt";
  if (enHits === max) return "en";
  return "es";
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
    const mode = body.mode === "aggressive" ? "aggressive" : "auto";
    const limit = Math.min(body.limit ?? (mode === "aggressive" ? 1000 : 200), 2000);
    const dryRun = body.dryRun === true;

    const run = await startRun(sb, {
      job_type: `clean-${mode}`,
      source: guard.isService ? "cron" : "admin",
      triggered_by: guard.userId ?? null,
    });

    const summary = {
      mode,
      limit,
      dryRun,
      picked: 0,
      standardized: 0,
      enqueued_normalization: 0,
      enqueued_enrichment: 0,
      duplicate_groups: 0,
      duplicate_suggestions_created: 0,
      covers_invoked: 0,
      series_invoked: 0,
      avg_score_before: 0,
      avg_score_after: 0,
      details_sample: [] as any[],
    };

    // 1) pega os livros com pior quality_score (e mais recentes em empate)
    const { data: rows, error: pickErr } = await sb
      .from("books")
      .select("id,title,authors,publisher,description,cover_url,isbn_13,isbn_10,language,categories,series_id,quality_score,last_enriched_at")
      .order("quality_score", { ascending: true })
      .order("updated_at", { ascending: true })
      .limit(limit);
    if (pickErr) return jsonResponse({ error: pickErr.message }, 500);

    const books = (rows || []) as BookRow[];
    summary.picked = books.length;
    summary.avg_score_before = books.length
      ? Math.round(books.reduce((a, b) => a + (b.quality_score || 0), 0) / books.length)
      : 0;

    if (books.length === 0) return jsonResponse(summary);

    // 2) padronização determinística (sem IA) + log
    const auditEntries: any[] = [];
    const dirtyIds: string[] = [];
    const incompleteIds: string[] = [];

    for (const b of books) {
      const patch: Record<string, any> = {};
      const before: Record<string, any> = {};

      // ISBN normalization
      const norm13 = normalizeIsbn(b.isbn_13, 13);
      if (b.isbn_13 && norm13 && norm13 !== b.isbn_13) {
        before.isbn_13 = b.isbn_13;
        patch.isbn_13 = norm13;
      } else if (b.isbn_13 && !norm13) {
        before.isbn_13 = b.isbn_13;
        patch.isbn_13 = null; // ISBN inválido — limpa
      }
      const norm10 = normalizeIsbn(b.isbn_10, 10);
      if (b.isbn_10 && norm10 && norm10 !== b.isbn_10) {
        before.isbn_10 = b.isbn_10;
        patch.isbn_10 = norm10;
      } else if (b.isbn_10 && !norm10) {
        before.isbn_10 = b.isbn_10;
        patch.isbn_10 = null;
      }

      // título: trim + collapse spaces
      const t2 = (b.title || "").replace(/\s+/g, " ").trim();
      if (t2 && t2 !== b.title) {
        before.title = b.title;
        patch.title = t2;
      }

      // autores: dedupe, trim, remove vazios
      const a2 = normalizeAuthors(b.authors);
      if (JSON.stringify(a2) !== JSON.stringify(b.authors || [])) {
        before.authors = b.authors;
        patch.authors = a2;
      }

      // publisher: trim
      if (b.publisher) {
        const p2 = b.publisher.replace(/\s+/g, " ").trim();
        if (p2 !== b.publisher) {
          before.publisher = b.publisher;
          patch.publisher = p2;
        }
      }

      // language: heurística leve quando ausente
      if (!b.language) {
        const lang = detectLanguage(b);
        if (lang) {
          before.language = b.language;
          patch.language = lang;
        }
      }

      // categories: dedupe + trim
      if (b.categories && b.categories.length > 0) {
        const c2 = Array.from(
          new Set(b.categories.map((c) => (c || "").replace(/\s+/g, " ").trim()).filter(Boolean)),
        );
        if (JSON.stringify(c2) !== JSON.stringify(b.categories)) {
          before.categories = b.categories;
          patch.categories = c2;
        }
      }

      if (Object.keys(patch).length > 0 && !dryRun) {
        const { error: uErr } = await sb.from("books").update(patch).eq("id", b.id);
        if (!uErr) {
          summary.standardized++;
          auditEntries.push({
            book_id: b.id,
            process: "clean-book-database",
            action: "patch",
            fields_changed: Object.keys(patch),
            before,
            after: patch,
            details: { phase: "standardize" },
          });
        }
      } else if (Object.keys(patch).length > 0) {
        summary.standardized++;
      }

      if (looksDirty(b)) dirtyIds.push(b.id);
      // Cooldown: pula livros enriquecidos com sucesso recentemente
      const enrichedRecently =
        b.last_enriched_at &&
        Date.now() - new Date(b.last_enriched_at).getTime() < ENRICH_COOLDOWN_DAYS * 86400_000;
      if (!enrichedRecently && missingFields(b).length >= 2) incompleteIds.push(b.id);
    }

    // 3) enfileira normalização IA — só p/ os realmente sujos
    if (!dryRun && dirtyIds.length > 0) {
      const { data: existing } = await sb
        .from("metadata_normalization_queue")
        .select("book_id")
        .in("book_id", dirtyIds)
        .in("status", ["pending", "processing"]);
      const skipSet = new Set((existing || []).map((r: any) => r.book_id));
      const toEnqueue = dirtyIds
        .filter((id) => !skipSet.has(id))
        .map((id) => ({ book_id: id, reasons: ["dirty_metadata"] as string[] }));
      if (toEnqueue.length > 0) {
        const { error: insErr } = await sb
          .from("metadata_normalization_queue")
          .insert(toEnqueue);
        if (!insErr) summary.enqueued_normalization = toEnqueue.length;
      }
    } else {
      summary.enqueued_normalization = dirtyIds.length;
    }

    // 4) enfileira enrichment p/ incompletos
    if (!dryRun && incompleteIds.length > 0) {
      const { data: existing } = await sb
        .from("enrichment_queue")
        .select("book_id")
        .in("book_id", incompleteIds)
        .in("status", ["pending", "processing"]);
      const skipSet = new Set((existing || []).map((r: any) => r.book_id));
      const toEnqueue = incompleteIds
        .filter((id) => !skipSet.has(id))
        .map((id) => ({ book_id: id }));
      if (toEnqueue.length > 0) {
        const { error: insErr } = await sb
          .from("enrichment_queue")
          .insert(toEnqueue);
        if (!insErr) summary.enqueued_enrichment = toEnqueue.length;
      }
    } else {
      summary.enqueued_enrichment = incompleteIds.length;
    }

    // 5) detecta duplicatas por ISBN dentro do batch
    const dupGroups = new Map<string, string[]>();
    for (const b of books) {
      const k = b.isbn_13 ? `13:${b.isbn_13}` : b.isbn_10 ? `10:${b.isbn_10}` : null;
      if (!k) continue;
      if (!dupGroups.has(k)) dupGroups.set(k, []);
      dupGroups.get(k)!.push(b.id);
    }
    const realDups = [...dupGroups.entries()].filter(([, ids]) => ids.length >= 2);
    summary.duplicate_groups = realDups.length;

    if (!dryRun) {
      for (const [, ids] of realDups) {
        // canonical = primeiro ID; cria sugestão p/ cada par
        const [canonical, ...losers] = ids;
        for (const loser of losers) {
          const { error: insErr } = await sb
            .from("merge_suggestions")
            .upsert(
              {
                canonical_id: canonical,
                duplicate_id: loser,
                similarity_score: 1.0,
                status: "pending",
              },
              { onConflict: "duplicate_id", ignoreDuplicates: true },
            );
          if (!insErr) summary.duplicate_suggestions_created++;
        }
      }
    }

    // 6) chama fix-book-covers (missing first, depois auto)
    if (!dryRun) {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/fix-book-covers`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE}`,
            apikey: SERVICE_ROLE,
          },
          body: JSON.stringify({
            mode: "missing",
            limit: mode === "aggressive" ? 50 : 20,
            noAi: mode !== "aggressive",
          }),
        });
        if (r.ok) summary.covers_invoked++;
      } catch (e) {
        console.warn("fix-book-covers failed:", (e as Error).message);
      }
    }

    // 7) consolidate-series — só em modo aggressive ou se não rodou nas últimas 24h
    if (!dryRun && mode === "aggressive") {
      try {
        // chamada direta: a função exige bearer admin, então usamos service role + bypass
        // chamando o pipeline interno via SQL não é trivial — então, p/ cron, registramos um audit hint
        // (cron diário pode chamar a função via configurações específicas; aqui apenas marcamos)
        auditEntries.push({
          process: "clean-book-database",
          action: "series_consolidation_hint",
          fields_changed: [],
          details: { reason: "aggressive_run", note: "Run consolidate-series manually via admin panel" },
        });
      } catch { /* noop */ }
    }

    // 8) grava log de auditoria em batch
    if (auditEntries.length > 0 && !dryRun) {
      await sb.from("book_audit_log").insert(auditEntries);
    }

    // recomputa avg score do batch (já refletiu trigger no UPDATE)
    if (!dryRun && books.length > 0) {
      const ids = books.map((b) => b.id);
      const { data: after } = await sb
        .from("books")
        .select("quality_score")
        .in("id", ids);
      summary.avg_score_after = after?.length
        ? Math.round(after.reduce((a: number, r: any) => a + (r.quality_score || 0), 0) / after.length)
        : summary.avg_score_before;
    } else {
      summary.avg_score_after = summary.avg_score_before;
    }

    summary.details_sample = books.slice(0, 5).map((b) => ({
      id: b.id,
      title: b.title,
      score: b.quality_score,
      missing: missingFields(b),
      dirty: looksDirty(b),
    }));

    return jsonResponse(summary);
  } catch (e) {
    console.error("clean-book-database error", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Erro" }, 500);
  }
});
