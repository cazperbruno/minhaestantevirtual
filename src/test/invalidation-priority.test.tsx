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
  // de COLD (só marca stale). Active-only refetch precisa de observer real.
  const seedActive = (key: readonly unknown[]) => {
    queryClient.setQueryData(key as any, { __seed: true });
    const obs = new QueryObserver(queryClient, {
      queryKey: key as any,
      queryFn: async () => ({ __fresh: true } as any),
      staleTime: Infinity, // não refetch automático ao mount, só via invalidate
    });
    const unsub = obs.subscribe(() => {});
    const query = queryClient.getQueryCache().find({ queryKey: key as any })!;
    return { query, unsub };
  };

  const lib = seedActive(qk.library(TEST_USER_ID));
  const feed = seedActive(qk.feed());
  const series = seedActive(qk.mySeries(TEST_USER_ID));
  const ranking = seedActive(qk.ranking());
  const seriesRank = seedActive(qk.seriesRanking());
  const stats = seedActive(qk.stats(TEST_USER_ID));

  renderHook(() => useRealtimeInvalidation(), { wrapper });

  return { lib, feed, series, ranking, seriesRank, stats };
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
    const { lib, feed, series, ranking, seriesRank, stats } = setup();

    fire("user_books", {
      eventType: "INSERT",
      schema: "public",
      table: "user_books",
      new: { user_id: TEST_USER_ID, book_id: "book-1", status: "reading" },
      old: null,
    });

    // HOT — refetch disparado imediatamente (fetchStatus = "fetching")
    expect(lib.query.state.fetchStatus).toBe("fetching");
    expect(feed.query.state.fetchStatus).toBe("fetching");
    expect(series.query.state.fetchStatus).toBe("fetching");

    // COLD — apenas marcado como stale, sem refetch imediato
    expect(ranking.query.state.fetchStatus).toBe("idle");
    expect(ranking.query.state.isInvalidated).toBe(true);
    expect(seriesRank.query.state.fetchStatus).toBe("idle");
    expect(seriesRank.query.state.isInvalidated).toBe(true);
    expect(stats.query.state.fetchStatus).toBe("idle");
    expect(stats.query.state.isInvalidated).toBe(true);

    // cleanup
    [lib, feed, series, ranking, seriesRank, stats].forEach((q) => q.unsub());
  });
});
