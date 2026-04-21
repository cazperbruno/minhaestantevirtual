/**
 * Regressão: garante que o KIND_META do ActivityCard cobre TODOS os kinds
 * que o banco emite via triggers — assim nenhum activity cai no fallback
 * silencioso (`book_added`) que confundia o feed.
 *
 * Lê o arquivo como texto (sem importar o módulo React) para evitar carregar
 * dependências pesadas (Supabase client, lucide, react-router) só para uma
 * checagem estática.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Lista canônica de kinds que as triggers ativas (user_books_to_activity,
// follows_to_activity, e variações de recomendação/troca) podem inserir.
const EMITTED_KINDS = [
  "book_added",
  "started_reading",
  "finished_reading",
  "book_rated",
  "followed_user",
  "book_recommended",
  "book_lent",
  "trade_completed",
] as const;

describe("activities — todos os kinds têm UI dedicada", () => {
  it("nenhum kind emitido pelo banco fica sem label", () => {
    const file = readFileSync(
      resolve(__dirname, "../components/social/ActivityCard.tsx"),
      "utf8",
    );
    // Extrai o bloco KIND_META e verifica que cada kind canônico aparece
    // como chave (ex: `book_added: {`).
    const missing = EMITTED_KINDS.filter(
      (k) => !new RegExp(`\\b${k}\\s*:\\s*\\{`).test(file),
    );
    expect(missing, `kinds sem entrada em KIND_META: ${missing.join(", ")}`)
      .toEqual([]);
    // Dedup sanity-check
    expect(new Set(EMITTED_KINDS).size).toBe(EMITTED_KINDS.length);
  });
});
