import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase BEFORE importing track
const insertMock = vi.fn().mockResolvedValue({ error: null });
const fromMock = vi.fn(() => ({ insert: insertMock }));
const getUserMock = vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: getUserMock },
    from: fromMock,
  },
}));

beforeEach(() => {
  insertMock.mockClear();
  fromMock.mockClear();
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
});

describe("trackEvent", () => {
  it("does not throw when called sync (fire-and-forget)", async () => {
    const { trackEvent } = await import("@/lib/track");
    expect(() => trackEvent("search_executed", { results: 3 })).not.toThrow();
  });

  it("ignores empty event names", async () => {
    const { trackEvent } = await import("@/lib/track");
    trackEvent("");
    await new Promise((r) => setTimeout(r, 5));
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("inserts into app_events with session_id and props for authenticated user", async () => {
    const { trackEvent } = await import("@/lib/track");
    trackEvent("search_executed", { query: "1984", results: 5 });
    await new Promise((r) => setTimeout(r, 10));
    expect(fromMock).toHaveBeenCalledWith("app_events");
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "search_executed",
        props: { query: "1984", results: 5 },
        session_id: expect.stringMatching(/^s_/),
        user_id: "u1",
      }),
    );
  });

  it("does NOT insert when user is anonymous (RLS hardened)", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } });
    const { trackEvent } = await import("@/lib/track");
    trackEvent("search_executed", { query: "anon" });
    await new Promise((r) => setTimeout(r, 10));
    expect(fromMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("never throws even if supabase.from blows up", async () => {
    fromMock.mockImplementationOnce(() => { throw new Error("boom"); });
    const { trackEvent } = await import("@/lib/track");
    expect(() => trackEvent("scanner_isbn_found", { isbn: "x" })).not.toThrow();
  });
});
