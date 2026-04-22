// ============================================================================
// fix-book-covers
// ----------------------------------------------------------------------------
// Validates existing book covers and replaces broken/low-quality ones.
//
// Strategy:
//   1. Pick a batch of books (those with no cover OR that haven't been checked
//      recently). Books are ordered by user activity (popularity) so we fix
//      the most-seen ones first.
//   2. For each book, probe the existing cover URL:
//        - Missing → trigger replacement
//        - 404 / non-image → trigger replacement
//        - Too small (< 1500 bytes) or known placeholder → trigger replacement
//        - Wrong aspect ratio (landscape / square) → trigger replacement
//   3. Replacement: call the existing `cover-search` function which already
//      handles multi-source parallel search + AI fallback + persistence.
//   4. Return a summary (checked, replaced, failed).
//
// Modes:
//   - { mode: "auto" }            → batch run (default 25 books)
//   - { mode: "book", bookId }    → single book on demand
//   - { mode: "missing" }         → only books with NULL cover_url
//
// Auth: requires service role (called from cron) OR an admin user (manual).
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { requireAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-csrf-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Body {
  mode?: "auto" | "missing" | "book";
  bookId?: string;
  limit?: number;
  /** Skip AI fallback (saves credits in batch jobs) */
  noAi?: boolean;
}

interface ProbeResult {
  ok: boolean;
  reason?: string;
  width?: number;
  height?: number;
  bytes?: number;
}

// ---------- HTTP with timeout ----------
async function fetchSafe(url: string, timeoutMs = 5000, init?: RequestInit) {
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

/**
 * Validates an existing cover URL by reading its header bytes.
 * Returns ok=false with a reason if the cover should be replaced.
 */
async function probeCover(url: string | null): Promise<ProbeResult> {
  if (!url) return { ok: false, reason: "missing" };

  const r = await fetchSafe(url, 6000, { headers: { Range: "bytes=0-32768" } });
  if (!r) return { ok: false, reason: "timeout" };
  if (!r.ok && r.status !== 206) return { ok: false, reason: `http_${r.status}` };

  const ct = r.headers.get("content-type") || "";
  if (!ct.startsWith("image/")) return { ok: false, reason: "not_image" };

  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.length < 1500) return { ok: false, reason: "too_small" };

  const dims = readDims(buf);
  if (!dims) return { ok: true, bytes: buf.length }; // accept unknown dims if size is reasonable

  const { width, height } = dims;
  const shortSide = Math.min(width, height);
  if (shortSide < 200) return { ok: false, reason: "low_res", width, height, bytes: buf.length };

  const ratio = height / width;
  // Book cover should be portrait near 2:3 (1.5). Reject very wide or square.
  if (ratio < 0.9) return { ok: false, reason: "landscape", width, height, bytes: buf.length };
  if (ratio > 2.5) return { ok: false, reason: "too_tall", width, height, bytes: buf.length };

  return { ok: true, width, height, bytes: buf.length };
}

/** Minimal JPEG/PNG/GIF/WebP dimension reader. */
function readDims(b: Uint8Array): { width: number; height: number } | null {
  try {
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
      return { width: (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], height: (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23] };
    }
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
      return { width: b[6] | (b[7] << 8), height: b[8] | (b[9] << 8) };
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i < b.length - 8) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) {
          return { width: (b[i + 7] << 8) | b[i + 8], height: (b[i + 5] << 8) | b[i + 6] };
        }
        const seg = (b[i + 2] << 8) | b[i + 3];
        i += 2 + seg;
      }
    }
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57) {
      if (b[12] === 0x56 && b[13] === 0x50 && b[14] === 0x38 && b[15] === 0x58) {
        return {
          width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)),
          height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)),
        };
      }
    }
  } catch { /* ignore */ }
  return null;
}

interface BookRow {
  id: string;
  title: string;
  authors: string[];
  isbn_10: string | null;
  isbn_13: string | null;
  cover_url: string | null;
}

/** Calls the cover-search edge function to find a replacement. */
async function findReplacement(book: BookRow, noAi: boolean): Promise<string | null> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/cover-search`;
  const r = await fetchSafe(url, 30000, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    },
    body: JSON.stringify({
      bookId: book.id,
      isbn_13: book.isbn_13,
      isbn_10: book.isbn_10,
      title: book.title,
      authors: book.authors,
      persist: true,
      noAi,
    }),
  });
  if (!r?.ok) return null;
  const j = await r.json();
  return j.cover_url ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) {
      return new Response(JSON.stringify({ error: guard.error }), {
        status: guard.status ?? 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = guard.sb;

    const body: Body = await req.json().catch(() => ({}));
    const mode = body.mode ?? "auto";
    const limit = Math.min(body.limit ?? 25, 100);
    const noAi = body.noAi ?? true; // default: batch jobs skip AI

    // ---- Pick batch ----
    let books: BookRow[] = [];
    if (mode === "book") {
      if (!body.bookId) {
        return new Response(JSON.stringify({ error: "bookId required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data } = await supabase
        .from("books")
        .select("id,title,authors,isbn_10,isbn_13,cover_url")
        .eq("id", body.bookId)
        .maybeSingle();
      if (data) books = [data as BookRow];
    } else if (mode === "missing") {
      const { data } = await supabase
        .from("books")
        .select("id,title,authors,isbn_10,isbn_13,cover_url")
        .is("cover_url", null)
        .order("created_at", { ascending: false })
        .limit(limit);
      books = (data as BookRow[]) ?? [];
    } else {
      // auto: prioritize books with views/adds — join via user_interactions
      const { data } = await supabase.rpc("books_for_cover_audit", { _limit: limit }).select();
      if (data && Array.isArray(data) && data.length > 0) {
        const ids = data.map((d: any) => d.book_id);
        const { data: rows } = await supabase
          .from("books")
          .select("id,title,authors,isbn_10,isbn_13,cover_url")
          .in("id", ids);
        books = (rows as BookRow[]) ?? [];
      } else {
        // Fallback: random sample
        const { data: rows } = await supabase
          .from("books")
          .select("id,title,authors,isbn_10,isbn_13,cover_url")
          .order("updated_at", { ascending: true })
          .limit(limit);
        books = (rows as BookRow[]) ?? [];
      }
    }

    // ---- Validate + replace ----
    const summary = { checked: 0, ok: 0, replaced: 0, failed: 0, details: [] as any[] };

    for (const book of books) {
      summary.checked++;
      const probe = await probeCover(book.cover_url);
      if (probe.ok) {
        summary.ok++;
        continue;
      }
      const replacement = await findReplacement(book, noAi);
      if (replacement) {
        summary.replaced++;
        summary.details.push({ id: book.id, title: book.title, reason: probe.reason, new: replacement });
      } else {
        summary.failed++;
        summary.details.push({ id: book.id, title: book.title, reason: probe.reason, new: null });
      }
    }

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[fix-book-covers] error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
