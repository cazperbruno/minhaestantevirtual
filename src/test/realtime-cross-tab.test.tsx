/**
 * Cross-tab realtime sync — garante que ações em uma aba (Aba A) refletem
 * imediatamente em outra aba aberta no MESMO usuário (Aba B), sem refresh.
 *
 * Estratégia:
 *   - "Aba B" monta o hook `useRealtimeInvalidation` com um QueryClient próprio.
 *   - O canal Supabase é mockado para capturar os handlers `.on(...)` registrados.
 *   - Simulamos a "Aba A" disparando payloads Postgres CHANGES (INSERT/UPDATE)
 *     equivalentes ao que o backend enviaria após mutações reais.
 *   - Verificamos que as queries certas em B passaram a `isInvalidated()` —
 *     ou seja, refetch automático sem refresh manual.
 *
 * Cenários cobertos:
 *   1. Adicionar livro à biblioteca (INSERT user_books)
 *   2. Atualizar progresso de série (UPDATE books — series_id)
 *   3. Criar review (INSERT reviews)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ---- Mocks ----------------------------------------------------------------
const handlers: Array<{
  event: string;
  schema: string;
  table: string;
  filter?: string;
  cb: (payload: any) => void;
}> = [];

const subscribeMock = vi.fn((cb?: (status: string) => void) => {
  // Simula conexão imediata — desliga o fallback de polling.
  cb?.("SUBSCRIBED");
  return { unsubscribe: vi.fn() };
});

const channelMock: any = {
  on: vi.fn((_type: string, cfg: any, cb: any) => {
    handlers.push({ ...cfg, cb });
    return channelMock;
  }),
  subscribe: subscribeMock,
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: vi.fn(() => channelMock),
    removeChannel: vi.fn(),
  },
}));

const TEST_USER_ID = "user-aba-b-00000000-0000-0000-0000-000000000001";
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: TEST_USER_ID }, session: null, loading: false }),
}));

// Importa DEPOIS dos mocks
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { qk } from "@/lib/query-client";

// ---- Helpers --------------------------------------------------------------
function fire(table: string, event: "INSERT" | "UPDATE" | "DELETE", payload: any) {
  // Dispara em todos handlers que casam (event "*" ou específico) e a tabela bate.
  for (const h of handlers) {
    if (h.table !== table) continue;
    if (h.event !== "*" && h.event !== event) continue;
    h.cb({ eventType: event, new: payload.new, old: payload.old, schema: "public", table });
  }
}

function setupTabB() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);

  // Pré-popula caches relevantes para podermos verificar invalidação.
  const seed = (key: readonly unknown[]) => qc.setQueryData(key as any, { __seed: true });
  seed(qk.library(TEST_USER_ID));
  seed(qk.wishlist(TEST_USER_ID));
  seed(qk.mySeries(TEST_USER_ID));
  seed(qk.stats(TEST_USER_ID));
  seed(qk.seriesRanking());
  seed(qk.ranking());
  seed(qk.feed());
  seed(qk.followingReads(TEST_USER_ID));
  seed(qk.nextAchievements(TEST_USER_ID));
  seed(["series", "series-xyz", TEST_USER_ID]);
  seed(qk.reviews("book-123"));

  renderHook(() => useRealtimeInvalidation(), { wrapper });
  return qc;
}

const isInvalidated = (qc: QueryClient, key: readonly unknown[]) => {
  const state = qc.getQueryCache().find({ queryKey: key as any })?.state;
  return state?.isInvalidated === true;
};

// ---- Setup ----------------------------------------------------------------
beforeEach(() => {
  handlers.length = 0;
  subscribeMock.mockClear();
  channelMock.on.mockClear();
});

// ---- Testes ---------------------------------------------------------------
describe("Realtime cross-tab sync", () => {
  it("Aba A adiciona livro → Aba B invalida biblioteca/séries/stats sem refresh", () => {
    const qc = setupTabB();

    // Aba A insere em user_books (mesma user_id da Aba B)
    fire("user_books", "INSERT", {
      new: {
        user_id: TEST_USER_ID,
        book_id: "book-123",
        status: "reading",
        updated_at: new Date().toISOString(),
      },
      old: null,
    });

    expect(isInvalidated(qc, qk.library(TEST_USER_ID))).toBe(true);
    expect(isInvalidated(qc, qk.wishlist(TEST_USER_ID))).toBe(true);
    expect(isInvalidated(qc, qk.mySeries(TEST_USER_ID))).toBe(true);
    expect(isInvalidated(qc, qk.stats(TEST_USER_ID))).toBe(true);
    expect(isInvalidated(qc, qk.followingReads(TEST_USER_ID))).toBe(true);
    expect(isInvalidated(qc, qk.nextAchievements(TEST_USER_ID))).toBe(true);
    // Rankings globais também atualizam
    expect(isInvalidated(qc, qk.ranking())).toBe(true);
    expect(isInvalidated(qc, qk.seriesRanking())).toBe(true);
    expect(isInvalidated(qc, qk.feed())).toBe(true);
  });

  it("Aba A atualiza volume de uma série (books.series_id) → Aba B atualiza Minhas Séries e ranking colecionador", () => {
    const qc = setupTabB();

    fire("books", "UPDATE", {
      new: { id: "book-123", series_id: "series-xyz", title: "Vol 5", volume_number: 5 },
      old: { id: "book-123", series_id: "series-xyz", title: "Vol 5", volume_number: 5 },
    });

    expect(isInvalidated(qc, qk.mySeries(TEST_USER_ID))).toBe(true);
    expect(isInvalidated(qc, qk.seriesRanking())).toBe(true);
    expect(isInvalidated(qc, ["series", "series-xyz", TEST_USER_ID])).toBe(true);
  });

  it("Aba A cria review → Aba B atualiza reviews do livro e feed", () => {
    const qc = setupTabB();

    fire("reviews", "INSERT", {
      new: {
        id: "rev-1",
        user_id: TEST_USER_ID,
        book_id: "book-123",
        rating: 5,
        content: "Top!",
        is_public: true,
        created_at: new Date().toISOString(),
      },
      old: null,
    });

    expect(isInvalidated(qc, qk.reviews("book-123"))).toBe(true);
    expect(isInvalidated(qc, qk.feed())).toBe(true);
  });

  it("Canal único cobre todas as tabelas críticas (user_books, books, series, reviews)", () => {
    setupTabB();
    const tables = new Set(handlers.map((h) => h.table));
    for (const t of ["user_books", "books", "series", "reviews", "follows", "activities"]) {
      expect(tables.has(t), `falta listener para tabela ${t}`).toBe(true);
    }
    // Conectou via WebSocket — sem fallback de polling
    expect(subscribeMock).toHaveBeenCalled();
  });
});
