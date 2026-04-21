/**
 * Lightweight offline action queue.
 * Stores write operations in localStorage when offline and replays them
 * when the connection returns.
 *
 * Usage:
 *   queueOfflineAction({ kind: "book_status", payload: { id, status } });
 *
 * Replays via `replayOfflineQueue()` (called automatically on `online` event
 * by setupOfflineSync()).
 */

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type OfflineAction =
  | { kind: "book_status"; payload: { user_book_id: string; status: string } }
  | { kind: "book_rating"; payload: { user_book_id: string; rating: number } }
  | { kind: "review_like"; payload: { review_id: string } }
  | { kind: "review_unlike"; payload: { review_id: string } };

const STORAGE_KEY = "readify:offline-queue";

function load(): OfflineAction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(items: OfflineAction[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* quota */ }
}

export function queueOfflineAction(action: OfflineAction) {
  const items = load();
  items.push(action);
  save(items);
}

export function getOfflineQueueSize(): number {
  return load().length;
}

async function executeAction(a: OfflineAction): Promise<boolean> {
  try {
    switch (a.kind) {
      case "book_status":
        await supabase.from("user_books").update({ status: a.payload.status as any }).eq("id", a.payload.user_book_id);
        return true;
      case "book_rating":
        await supabase.from("user_books").update({ rating: a.payload.rating }).eq("id", a.payload.user_book_id);
        return true;
      case "review_like": {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return false;
        await supabase.from("review_likes").insert({ review_id: a.payload.review_id, user_id: data.user.id });
        return true;
      }
      case "review_unlike": {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return false;
        await supabase.from("review_likes").delete().eq("review_id", a.payload.review_id).eq("user_id", data.user.id);
        return true;
      }
    }
  } catch (e) {
    console.warn("[offline-queue] failed", a, e);
    return false;
  }
}

let replaying = false;
export async function replayOfflineQueue(): Promise<{ ok: number; failed: number }> {
  if (replaying) return { ok: 0, failed: 0 };
  replaying = true;
  const items = load();
  if (items.length === 0) { replaying = false; return { ok: 0, failed: 0 }; }

  const remaining: OfflineAction[] = [];
  let ok = 0;
  for (const item of items) {
    const success = await executeAction(item);
    if (success) ok++;
    else remaining.push(item);
  }
  save(remaining);
  replaying = false;

  if (ok > 0) {
    toast.success(`${ok} ${ok === 1 ? "ação sincronizada" : "ações sincronizadas"}`);
  }
  return { ok, failed: remaining.length };
}

let setupDone = false;
export function setupOfflineSync() {
  if (setupDone || typeof window === "undefined") return;
  setupDone = true;
  window.addEventListener("online", () => {
    void replayOfflineQueue();
  });
  // Try once on load (in case we came back online while app was closed)
  if (navigator.onLine) {
    setTimeout(() => void replayOfflineQueue(), 2000);
  }
}
