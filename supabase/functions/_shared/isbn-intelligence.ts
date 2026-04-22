// deno-lint-ignore-file no-explicit-any
/**
 * isbn-intelligence — Helpers compartilhados para o sistema de busca por ISBN.
 *
 *  - normalizeAuthors / fixPortugueseAccents: padroniza autores e corrige acentos
 *    perdidos em fontes ASCII (ex: "Memorias Postumas" → "Memórias Póstumas").
 *  - computeQualityScore: 0-100 baseado em campos críticos + bônus pt-BR.
 *  - mergeBest: combina dois NormalizedBook priorizando o de maior qualidade
 *    e o idioma português, sem perder informação útil.
 *  - aiFallbackInferBook: usa Lovable AI Gateway para inferir título/autor
 *    quando todas as APIs públicas falham (último recurso).
 *  - findDuplicateByTitleAuthor: detecção fuzzy título+autor primário.
 */

export interface NormalizedBookLite {
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
  categories?: string[] | null;
  source?: string | null;
  source_id?: string | null;
}

// ============================================================
// 1) Normalização PT-BR
// ============================================================

/**
 * Corrige acentos faltantes em palavras comuns do português brasileiro.
 * Aplica heurísticas seguras — não inventa acentos, só restaura padrões
 * óbvios usados em catálogos antigos sem suporte Unicode.
 */
const ACCENT_FIXES: Array<[RegExp, string]> = [
  // Palavras de alta frequência (case-insensitive, mantém capitalização)
  [/\bacao\b/gi, "ação"],
  [/\bacoes\b/gi, "ações"],
  [/\bcoracao\b/gi, "coração"],
  [/\bnao\b/gi, "não"],
  [/\bsao\b/gi, "são"],
  [/\bmae\b/gi, "mãe"],
  [/\bpai\b/gi, "pai"],
  [/\birmao\b/gi, "irmão"],
  [/\birmaos\b/gi, "irmãos"],
  [/\bmemorias\b/gi, "memórias"],
  [/\bpostumas\b/gi, "póstumas"],
  [/\bhistoria\b/gi, "história"],
  [/\bhistorias\b/gi, "histórias"],
  [/\bamor\b/gi, "amor"],
  [/\bportugues\b/gi, "português"],
  [/\bportuguesa\b/gi, "portuguesa"],
  [/\beducacao\b/gi, "educação"],
  [/\bsolidao\b/gi, "solidão"],
  [/\bcoracoes\b/gi, "corações"],
  [/\billusoes\b/gi, "ilusões"],
  [/\bpaisao\b/gi, "paixão"],
  [/\bdor\b/gi, "dor"],
];

function preserveCase(original: string, replacement: string): string {
  if (original === original.toUpperCase()) return replacement.toUpperCase();
  if (original[0] === original[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

export function fixPortugueseAccents(input: string | null | undefined): string {
  if (!input) return "";
  let out = input;
  for (const [re, fix] of ACCENT_FIXES) {
    out = out.replace(re, (m) => preserveCase(m, fix));
  }
  return out;
}

/**
 * Padroniza lista de autores:
 *  - "Sobrenome, Nome" → "Nome Sobrenome"
 *  - remove duplicados case-insensitive
 *  - corrige espaçamento e capitalização
 *  - corrige acentos PT-BR
 *  - limita a 10 autores
 */
export function normalizeAuthors(arr: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of arr || []) {
    if (!raw) continue;
    let v = String(raw).replace(/\s+/g, " ").trim();
    if (!v) continue;
    // "Sobrenome, Nome" → "Nome Sobrenome"
    if (/^[A-ZÀ-Ú][^,]+,\s*[A-ZÀ-Ú]/.test(v)) {
      const [last, first] = v.split(/,\s*/, 2);
      v = `${first} ${last}`;
    }
    v = fixPortugueseAccents(v);
    // Capitaliza palavras (preserva preposições comuns)
    v = v
      .split(" ")
      .map((w, i) => {
        if (i > 0 && /^(de|da|do|dos|das|e|y|von|van|del)$/i.test(w)) return w.toLowerCase();
        return w[0] ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w;
      })
      .join(" ");
    const k = v.toLowerCase();
    if (k.length < 2 || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out.slice(0, 10);
}

// ============================================================
// 2) Score de qualidade 0-100
// ============================================================

/**
 * Score de qualidade baseado nos campos críticos do livro.
 *  - +20 título não-vazio
 *  - +20 ao menos 1 autor
 *  - +20 capa
 *  - +20 descrição (>40 chars)
 *  - +20 idioma pt/pt-BR
 *  + bônus: ano publicado (+5), páginas (+5), categorias (+5), publisher (+5)
 *    (truncado em 100)
 */
export function computeQualityScore(b: NormalizedBookLite): number {
  let s = 0;
  if (b.title && b.title.trim().length > 1 && b.title.trim().toLowerCase() !== "sem título") s += 20;
  if (b.authors && b.authors.length > 0) s += 20;
  if (b.cover_url && /^https?:\/\//.test(b.cover_url)) s += 20;
  if (b.description && b.description.trim().length > 40) s += 20;
  const lang = (b.language || "").toLowerCase();
  if (lang === "pt" || lang === "pt-br" || lang === "por") s += 20;
  // bônus
  if (b.published_year && b.published_year > 1000 && b.published_year < 3000) s += 5;
  if (b.page_count && b.page_count > 0) s += 5;
  if (b.categories && b.categories.length > 0) s += 5;
  if (b.publisher) s += 5;
  return Math.min(100, s);
}

export function isPortuguese(b: NormalizedBookLite): boolean {
  const lang = (b.language || "").toLowerCase();
  return lang === "pt" || lang === "pt-br" || lang === "por";
}

// ============================================================
// 3) Merge inteligente entre múltiplas fontes
// ============================================================

/**
 * Combina `b` (atual) com `extra` (alternativa) preservando o melhor de cada
 * campo. Prioriza pt-BR quando disponível e nunca sobrescreve um valor bom
 * por null/vazio.
 */
export function mergeBest<T extends NormalizedBookLite>(b: T, extra: NormalizedBookLite | null): T {
  if (!extra) return b;
  const ptBaseline = isPortuguese(b);
  const ptExtra = isPortuguese(extra);

  // Quando o "extra" é pt e o atual não é, ele ganha prioridade no título e descrição
  const preferExtra = ptExtra && !ptBaseline;

  const out: any = { ...b };
  if (preferExtra && extra.title) out.title = extra.title;
  if (!out.subtitle && extra.subtitle) out.subtitle = extra.subtitle;
  if ((!out.authors || out.authors.length === 0) && extra.authors?.length) {
    out.authors = extra.authors;
  }
  if (!out.publisher && extra.publisher) out.publisher = extra.publisher;
  if (!out.published_year && extra.published_year) out.published_year = extra.published_year;
  if ((!out.description || out.description.length < 40 || preferExtra) && extra.description) {
    out.description = extra.description;
  }
  if (!out.cover_url && extra.cover_url) out.cover_url = extra.cover_url;
  if (!out.page_count && extra.page_count) out.page_count = extra.page_count;
  if (!out.language && extra.language) out.language = extra.language;
  if ((!out.categories || out.categories.length === 0) && extra.categories?.length) {
    out.categories = extra.categories;
  }
  if (!out.isbn_13 && extra.isbn_13) out.isbn_13 = extra.isbn_13;
  if (!out.isbn_10 && extra.isbn_10) out.isbn_10 = extra.isbn_10;
  return out as T;
}

// ============================================================
// 4) Detecção de duplicados por título + autor
// ============================================================

const STOP_WORDS = new Set([
  "a", "o", "as", "os", "um", "uma", "de", "da", "do", "das", "dos",
  "e", "the", "and", "of", "in", "to",
]);

export function normalizeTitleKey(title: string): string {
  return (title || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w))
    .join(" ")
    .trim();
}

export function normalizeAuthorKey(author: string): string {
  return (author || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Procura no banco um livro com mesmo título normalizado E primeiro autor
 * normalizado. Usado antes de inserir para evitar duplicados sem ISBN.
 *
 * Retorna `{id, title}` quando encontra, ou null.
 */
export async function findDuplicateByTitleAuthor(
  sb: any,
  title: string,
  authors: string[],
): Promise<{ id: string; title: string } | null> {
  const tKey = normalizeTitleKey(title);
  if (tKey.length < 4) return null;
  const firstAuthor = authors?.[0] ? normalizeAuthorKey(authors[0]) : null;

  // Busca aproximada por título — usa ilike no campo authors_text se disponível
  const { data } = await sb
    .from("books")
    .select("id, title, authors")
    .ilike("title", `%${title.slice(0, 60)}%`)
    .limit(15);
  if (!data || data.length === 0) return null;
  for (const row of data) {
    if (normalizeTitleKey(row.title) !== tKey) continue;
    if (!firstAuthor) return { id: row.id, title: row.title };
    const rowAuthor = (row.authors || [])[0] ? normalizeAuthorKey(row.authors[0]) : "";
    if (rowAuthor && rowAuthor === firstAuthor) {
      return { id: row.id, title: row.title };
    }
  }
  return null;
}

// ============================================================
// 5) Fallback IA — Lovable AI Gateway
// ============================================================

/**
 * Quando todas as APIs falham, pede ao Lovable AI Gateway para inferir
 * dados de um livro a partir do ISBN. Modelo barato (gemini-2.5-flash)
 * com JSON estruturado. Retorna `null` se a resposta não for confiável.
 *
 * NUNCA inventa ISBN — apenas título/autor/sinopse + idioma.
 * O caller é responsável por validar e marcar source = "ai-fallback".
 */
export async function aiFallbackInferBook(
  isbn: string,
): Promise<NormalizedBookLite | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    console.warn("[ai-fallback] LOVABLE_API_KEY ausente, pulando");
    return null;
  }

  const prompt = `Você é um catalogador de livros. Dado o ISBN abaixo, devolva
APENAS um JSON com os dados que você tem alta confiança. Se não souber, devolva
{ "found": false }. Priorize a edição em português brasileiro quando existir.

ISBN: ${isbn}

Schema esperado:
{
  "found": boolean,
  "title": string | null,
  "subtitle": string | null,
  "authors": string[],
  "publisher": string | null,
  "published_year": number | null,
  "description": string | null,
  "language": "pt" | "en" | "es" | "fr" | string | null,
  "categories": string[]
}`;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Responda apenas JSON válido, sem comentários." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    clearTimeout(t);
    if (!r.ok) {
      console.warn(`[ai-fallback] HTTP ${r.status}`);
      return null;
    }
    const j = await r.json();
    const content = j?.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    if (!parsed?.found || !parsed?.title) return null;
    return {
      title: fixPortugueseAccents(String(parsed.title).slice(0, 500)),
      subtitle: parsed.subtitle ? String(parsed.subtitle).slice(0, 500) : null,
      authors: normalizeAuthors(Array.isArray(parsed.authors) ? parsed.authors : []),
      publisher: parsed.publisher ? String(parsed.publisher).slice(0, 200) : null,
      published_year:
        Number.isFinite(parsed.published_year) && parsed.published_year > 1000
          ? parsed.published_year
          : null,
      description: parsed.description ? String(parsed.description).slice(0, 5000) : null,
      cover_url: null,
      page_count: null,
      language: parsed.language ? String(parsed.language).slice(0, 8) : null,
      categories: Array.isArray(parsed.categories)
        ? parsed.categories.filter((c: any) => typeof c === "string").slice(0, 8)
        : [],
      isbn_13: isbn.length === 13 ? isbn : null,
      isbn_10: isbn.length === 10 ? isbn : null,
      source: "ai-fallback",
      source_id: null,
    };
  } catch (e) {
    console.warn(`[ai-fallback] erro: ${(e as Error).message}`);
    return null;
  }
}
