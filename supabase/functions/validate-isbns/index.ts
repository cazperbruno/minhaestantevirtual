// deno-lint-ignore-file no-explicit-any
/**
 * validate-isbns — Verifica e corrige ISBNs do catálogo.
 *
 * Para cada livro analisado:
 *  1. Limpa caracteres não numéricos (e X) dos campos isbn_10 / isbn_13
 *  2. Recalcula checksum:
 *     - se ISBN-10 válido e não há ISBN-13 → gera o ISBN-13 (978...)
 *     - se ISBN-13 válido (978-) e não há ISBN-10 → gera o ISBN-10
 *     - se inválido → tenta limpeza; se ainda inválido, marca como NULL
 *  3. Antes de gravar um ISBN novo, checa se já existe outro livro com
 *     esse ISBN (constraint UNIQUE) — se existir, cria sugestão em
 *     merge_suggestions em vez de quebrar (deduplicação preservada).
 *  4. Aplica patch idempotente e registra tudo em book_audit_log.
 *
 * Body: { mode?: 'recent' | 'all' | 'invalid', limit?: number, dryRun?: boolean }
 *  - recent (default): últimos N livros atualizados (combina com seed)
 *  - invalid: só os que tem ISBN preenchido mas falham na validação
 *  - all: varre tudo (limit-bound)
 *
 * Auth: admin OU service_role (cron / chamada do próprio seed).
 */
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Body {
  mode?: "recent" | "all" | "invalid";
  limit?: number;
  dryRun?: boolean;
}

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------- ISBN core ----------
const cleanIsbn = (s: string | null | undefined): string =>
  (s || "").replace(/[^0-9Xx]/g, "").toUpperCase();

function isValidIsbn10(i: string): boolean {
  if (!/^\d{9}[\dX]$/.test(i)) return false;
  let s = 0;
  for (let n = 0; n < 9; n++) s += (n + 1) * parseInt(i[n], 10);
  s += 10 * (i[9] === "X" ? 10 : parseInt(i[9], 10));
  return s % 11 === 0;
}
function isValidIsbn13(i: string): boolean {
  if (!/^\d{13}$/.test(i)) return false;
  let s = 0;
  for (let n = 0; n < 13; n++) {
    const d = parseInt(i[n], 10);
    s += n % 2 === 0 ? d : d * 3;
  }
  return s % 10 === 0;
}
function isbn10To13(i: string): string | null {
  if (!isValidIsbn10(i)) return null;
  const c = "978" + i.slice(0, 9);
  let s = 0;
  for (let n = 0; n < 12; n++) {
    const d = parseInt(c[n], 10);
    s += n % 2 === 0 ? d : d * 3;
  }
  return c + ((10 - (s % 10)) % 10);
}
function isbn13To10(i: string): string | null {
  if (!isValidIsbn13(i) || !i.startsWith("978")) return null;
  const c = i.slice(3, 12);
  let s = 0;
  for (let n = 0; n < 9; n++) s += (n + 1) * parseInt(c[n], 10);
  const k = s % 11;
  return c + (k === 10 ? "X" : String(k));
}

interface BookRow {
  id: string;
  isbn_10: string | null;
  isbn_13: string | null;
  title: string;
  updated_at: string;
}

interface PatchPlan {
  id: string;
  before: { isbn_10: string | null; isbn_13: string | null };
  after: { isbn_10: string | null; isbn_13: string | null };
  reasons: string[];
}

function planFor(b: BookRow): PatchPlan | null {
  const reasons: string[] = [];
  let isbn10 = b.isbn_10;
  let isbn13 = b.isbn_13;

  // 1) limpa formatação
  if (isbn10) {
    const c = cleanIsbn(isbn10);
    if (c !== isbn10) {
      reasons.push("isbn10_formatted");
      isbn10 = c;
    }
  }
  if (isbn13) {
    const c = cleanIsbn(isbn13);
    if (c !== isbn13) {
      reasons.push("isbn13_formatted");
      isbn13 = c;
    }
  }

  // 2) valida — invalida se checksum errado (substitui por null)
  if (isbn10 && !isValidIsbn10(isbn10)) {
    reasons.push("isbn10_invalid_dropped");
    isbn10 = null;
  }
  if (isbn13 && !isValidIsbn13(isbn13)) {
    reasons.push("isbn13_invalid_dropped");
    isbn13 = null;
  }

  // 3) deriva o que falta a partir do par válido
  if (isbn10 && !isbn13) {
    const derived = isbn10To13(isbn10);
    if (derived) {
      reasons.push("isbn13_derived_from_isbn10");
      isbn13 = derived;
    }
  }
  if (isbn13 && !isbn10) {
    const derived = isbn13To10(isbn13);
    if (derived) {
      reasons.push("isbn10_derived_from_isbn13");
      isbn10 = derived;
    }
  }

  // 4) consistência cruzada — se os dois existem e não batem, mantém o ISBN-13 (mais autoritativo)
  if (isbn10 && isbn13) {
    const expected13 = isbn10To13(isbn10);
    if (expected13 && expected13 !== isbn13) {
      reasons.push("isbn_pair_mismatch_kept_13");
      const derived10 = isbn13To10(isbn13);
      isbn10 = derived10;
    }
  }

  if (
    isbn10 === b.isbn_10 &&
    isbn13 === b.isbn_13
  ) {
    return null; // nada a fazer
  }

  return {
    id: b.id,
    before: { isbn_10: b.isbn_10, isbn_13: b.isbn_13 },
    after: { isbn_10: isbn10, isbn_13: isbn13 },
    reasons,
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
      authHeader === `Bearer ${SERVICE_ROLE}` ||
      req.headers.get("apikey") === SERVICE_ROLE;

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (!isService) {
      if (!authHeader.startsWith("Bearer ")) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
      const userClient = createClient(SUPABASE_URL, ANON, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: u } = await userClient.auth.getUser();
      if (!u?.user) return jsonResponse({ error: "Unauthorized" }, 401);
      const { data: isAdmin } = await sb.rpc("has_role", {
        _user_id: u.user.id,
        _role: "admin",
      });
      if (!isAdmin) return jsonResponse({ error: "Admin only" }, 403);
    }

    const body: Body = await req.json().catch(() => ({}));
    const mode = body.mode || "recent";
    const limit = Math.min(Math.max(body.limit ?? 500, 1), 5000);
    const dryRun = body.dryRun === true;

    const summary = {
      mode,
      limit,
      dryRun,
      checked: 0,
      already_valid: 0,
      formatted: 0,
      derived_pair: 0,
      invalid_dropped: 0,
      mismatched_pair: 0,
      duplicate_conflict_suggested: 0,
      updated: 0,
      duration_ms: 0,
      sample_changes: [] as PatchPlan[],
    };
    const t0 = Date.now();

    // --- query base
    let q = sb
      .from("books")
      .select("id, isbn_10, isbn_13, title, updated_at");
    if (mode === "recent") {
      q = q.order("updated_at", { ascending: false }).limit(limit);
    } else if (mode === "invalid") {
      // Postgres regex: livros com ISBN preenchido que tenham caracteres errados ou tamanho fora do padrão
      // (validação completa de checksum é feita aqui no JS depois)
      q = q
        .or("isbn_10.not.is.null,isbn_13.not.is.null")
        .order("updated_at", { ascending: false })
        .limit(limit);
    } else {
      q = q.order("id", { ascending: true }).limit(limit);
    }

    const { data: rows, error } = await q;
    if (error) return jsonResponse({ error: error.message }, 500);

    const books = (rows || []) as BookRow[];
    summary.checked = books.length;

    if (books.length === 0) {
      summary.duration_ms = Date.now() - t0;
      return jsonResponse(summary);
    }

    // monta planos
    const plans: PatchPlan[] = [];
    for (const b of books) {
      const p = planFor(b);
      if (!p) {
        summary.already_valid++;
        continue;
      }
      plans.push(p);
      if (p.reasons.some((r) => r.includes("formatted"))) summary.formatted++;
      if (p.reasons.some((r) => r.includes("derived"))) summary.derived_pair++;
      if (p.reasons.some((r) => r.includes("invalid_dropped"))) summary.invalid_dropped++;
      if (p.reasons.some((r) => r.includes("mismatch"))) summary.mismatched_pair++;
      if (summary.sample_changes.length < 8) summary.sample_changes.push(p);
    }

    if (dryRun || plans.length === 0) {
      summary.duration_ms = Date.now() - t0;
      return jsonResponse(summary);
    }

    // --- antes de gravar, verifica conflitos de UNIQUE em ISBN
    const ids = plans.map((p) => p.id);
    const candidate13 = plans
      .map((p) => p.after.isbn_13)
      .filter((v): v is string => !!v);
    const candidate10 = plans
      .map((p) => p.after.isbn_10)
      .filter((v): v is string => !!v);

    const [conflict13, conflict10] = await Promise.all([
      candidate13.length
        ? sb.from("books").select("id, isbn_13").in("isbn_13", candidate13).not("id", "in", `(${ids.join(",")})`)
        : Promise.resolve({ data: [] as any[] }),
      candidate10.length
        ? sb.from("books").select("id, isbn_10").in("isbn_10", candidate10).not("id", "in", `(${ids.join(",")})`)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const taken13 = new Map<string, string>();
    (conflict13.data || []).forEach((r: any) => {
      if (r.isbn_13) taken13.set(r.isbn_13, r.id);
    });
    const taken10 = new Map<string, string>();
    (conflict10.data || []).forEach((r: any) => {
      if (r.isbn_10) taken10.set(r.isbn_10, r.id);
    });

    const auditEntries: any[] = [];
    const mergeSuggestionRows: any[] = [];

    for (const p of plans) {
      // Se o ISBN proposto já pertence a outro livro → não atribuir; criar sugestão de merge
      let after10 = p.after.isbn_10;
      let after13 = p.after.isbn_13;
      const conflicts: string[] = [];

      if (after13 && taken13.has(after13)) {
        const canonical = taken13.get(after13)!;
        conflicts.push(`isbn13_taken_by:${canonical}`);
        mergeSuggestionRows.push({
          canonical_id: canonical,
          duplicate_id: p.id,
          similarity_score: 1.0,
          status: "pending",
        });
        after13 = p.before.isbn_13; // mantém o que estava
      }
      if (after10 && taken10.has(after10)) {
        const canonical = taken10.get(after10)!;
        conflicts.push(`isbn10_taken_by:${canonical}`);
        if (!mergeSuggestionRows.some((r) => r.duplicate_id === p.id)) {
          mergeSuggestionRows.push({
            canonical_id: canonical,
            duplicate_id: p.id,
            similarity_score: 1.0,
            status: "pending",
          });
        }
        after10 = p.before.isbn_10;
      }

      // se nada mudou após resolver conflito, pula update
      const finalChanged =
        after10 !== p.before.isbn_10 || after13 !== p.before.isbn_13;
      if (!finalChanged) {
        if (conflicts.length > 0) {
          auditEntries.push({
            book_id: p.id,
            process: "validate-isbns",
            action: "skip-conflict",
            fields_changed: [],
            before: p.before,
            after: p.after,
            details: { reasons: p.reasons, conflicts },
          });
        }
        continue;
      }

      const { error: upErr } = await sb
        .from("books")
        .update({ isbn_10: after10, isbn_13: after13 })
        .eq("id", p.id);

      if (upErr) {
        auditEntries.push({
          book_id: p.id,
          process: "validate-isbns",
          action: "update-failed",
          fields_changed: ["isbn_10", "isbn_13"],
          before: p.before,
          after: { isbn_10: after10, isbn_13: after13 },
          details: { reasons: p.reasons, error: upErr.message, conflicts },
        });
        continue;
      }

      summary.updated++;
      auditEntries.push({
        book_id: p.id,
        process: "validate-isbns",
        action: "patch",
        fields_changed: ["isbn_10", "isbn_13"].filter((k) =>
          (k === "isbn_10" ? after10 !== p.before.isbn_10 : after13 !== p.before.isbn_13),
        ),
        before: p.before,
        after: { isbn_10: after10, isbn_13: after13 },
        details: { reasons: p.reasons, conflicts },
      });
    }

    // grava sugestões de merge (idempotente: onConflict=duplicate_id)
    if (mergeSuggestionRows.length > 0) {
      const { error: msErr } = await sb
        .from("merge_suggestions")
        .upsert(mergeSuggestionRows, {
          onConflict: "duplicate_id",
          ignoreDuplicates: true,
        });
      if (!msErr) summary.duplicate_conflict_suggested = mergeSuggestionRows.length;
    }

    if (auditEntries.length > 0) {
      await sb.from("book_audit_log").insert(auditEntries);
    }

    summary.duration_ms = Date.now() - t0;
    return jsonResponse(summary);
  } catch (e) {
    console.error("validate-isbns error", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Erro" }, 500);
  }
});
