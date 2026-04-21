/**
 * Prioridade de invalidação — garante que ações disparadas via Realtime
 * atualizam IMEDIATAMENTE feed/biblioteca/séries/perfil (HOT) e adiam para
 * background os agregados pesados como ranking global e achievements (COLD).
 *
 * HOT  → marcado como `fetchStatus: "fetching"` na hora (refetch ativo).
 * COLD → apenas `isInvalidated: true`, refetch agendado em idle.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import React from "react";

const handlers: Array<{ table: string; cb: (p: any) => void }> = [];
const channelMock: any = {
  on: vi.fn((_t: string, cfg: any, cb: any) => {
    handlers.push({ table: cfg.table, cb });
    return channelMock;
  }),
  subscribe: vi.fn((cb?: (s: string) => void) => {
    cb?.("SUBSCRIBED");
    return { unsubscribe: vi.fn() };
  }),
};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { channel: vi.fn(() => channelMock), removeChannel: vi.fn() },
}));

const TEST_USER_ID = "user-priority-00000000-0000-0000-0000-000000000002";
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: TEST_USER_ID }, session: null, loading: false }),
}));

import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { qk, queryClient } from "@/lib/query-client";

function setup() {
  queryClient.clear();
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  // Cria queries observáveis (com queryFn) para distinguir HOT (refetch agora)
  // de COLD (só marca stale). Active-only refetch precisa de observer.
  const seedActive = (key: readonly unknown[]) => {
    const obs = queryClient.getQueryCache().build(queryClient, {
      queryKey: key as any,
      queryFn: async () => ({ __fresh: true } as any),
    });
    obs.setData({ __seed: true } as any);
    obs.addObserver({} as any);
    return obs;
  };

  const libQ = seedActive(qk.library(TEST_USER_ID));
  const feedQ = seedActive(qk.feed());
  const seriesQ = seedActive(qk.mySeries(TEST_USER_ID));
  const rankingQ = seedActive(qk.ranking());
  const seriesRankQ = seedActive(qk.seriesRanking());
  const statsQ = seedActive(qk.stats(TEST_USER_ID));

  renderHook(() => useRealtimeInvalidation(), { wrapper });

  return { libQ, feedQ, seriesQ, rankingQ, seriesRankQ, statsQ };
}

function fire(table: string, payload: any) {
  for (const h of handlers) if (h.table === table) h.cb(payload);
}

beforeEach(() => {
  handlers.length = 0;
  channelMock.on.mockClear();
});

describe("Prioridade de invalidação (HOT vs COLD)", () => {
  it("user_books INSERT → HOT (library/feed/séries fetching) e COLD (ranking apenas stale)", () => {
    const { libQ, feedQ, seriesQ, rankingQ, seriesRankQ, statsQ } = setup();

    fire("user_books", {
      eventType: "INSERT",
      schema: "public",
      table: "user_books",
      new: { user_id: TEST_USER_ID, book_id: "book-1", status: "reading" },
      old: null,
    });

    // HOT — refetch disparado imediatamente (fetchStatus = "fetching")
    expect(libQ.state.fetchStatus).toBe("fetching");
    expect(feedQ.state.fetchStatus).toBe("fetching");
    expect(seriesQ.state.fetchStatus).toBe("fetching");

    // COLD — apenas marcado como stale, sem refetch imediato
    expect(rankingQ.state.fetchStatus).toBe("idle");
    expect(rankingQ.state.isInvalidated).toBe(true);
    expect(seriesRankQ.state.fetchStatus).toBe("idle");
    expect(seriesRankQ.state.isInvalidated).toBe(true);
    expect(statsQ.state.fetchStatus).toBe("idle");
    expect(statsQ.state.isInvalidated).toBe(true);
  });
});
