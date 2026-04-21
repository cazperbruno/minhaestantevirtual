/**
 * Lightweight offline action queue.
 * Stores write operations in localStorage when offline and replays them
 * when the connection returns.
 *
 * Usage direta:
 *   queueOfflineAction({ kind: "book_status", payload: { id, status } });
 *
 * Usage automática (preferida):
 *   await mutateOrQueue(action, () => supabase.from(...).update(...));
 *   // Se offline → enfileira; se online → executa direto.
 *
 * Replays via `replayOfflineQueue()` (called automatically on `online` event
 * by setupOfflineSync()).
 */

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type OfflineAction =
  | { kind: "book_status"; payload: { user_book_id: string; status: string } }
  | { kind: "book_rating"; payload: { user_book_id: string; rating: number } }
  | { kind: "book_progress"; payload: { user_book_id: string; current_page: number } }
  | { kind: "book_notes"; payload: { user_book_id: string; notes: string } }
  | { kind: "review_like"; payload: { review_id: string } }
  | { kind: "review_unlike"; payload: { review_id: string } }
  | { kind: "follow"; payload: { target_user_id: string } }
  | { kind: "unfollow"; payload: { target_user_id: string } };

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

/**
 * Chave de dedup: identifica ações sobre o MESMO recurso/intent.
 * Quando uma nova ação chega, removemos qualquer ação anterior com a mesma chave —
 * a última escrita vence (last-write-wins). Pares like/unlike se cancelam.
 */
function dedupKey(a: OfflineAction): string {
  switch (a.kind) {
    case "book_status":
    case "book_rating":
    case "book_progress":
    case "book_notes":
      return `${a.kind}:${a.payload.user_book_id}`;
    case "review_like":
    case "review_unlike":
      return `review:${a.payload.review_id}`;
    case "follow":
    case "unfollow":
      return `follow:${a.payload.target_user_id}`;
  }
}

/** True se duas ações se cancelam mutuamente (like/unlike, follow/unfollow). */
function cancels(a: OfflineAction, b: OfflineAction): boolean {
  return (
    (a.kind === "review_like" && b.kind === "review_unlike") ||
    (a.kind === "review_unlike" && b.kind === "review_like") ||
    (a.kind === "follow" && b.kind === "unfollow") ||
    (a.kind === "unfollow" && b.kind === "follow")
  );
}

export function queueOfflineAction(action: OfflineAction) {
  const items = load();
  const key = dedupKey(action);
  // Cancela par oposto se existir; senão substitui a última do mesmo recurso
  const idx = items.findIndex((x) => dedupKey(x) === key);
  if (idx >= 0 && cancels(items[idx], action)) {
    items.splice(idx, 1); // ambos se cancelam
  } else {
    if (idx >= 0) items.splice(idx, 1);
    items.push(action);
  }
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
      case "book_progress":
        await supabase.from("user_books").update({ current_page: a.payload.current_page }).eq("id", a.payload.user_book_id);
        return true;
      case "book_notes":
        await supabase.from("user_books").update({ notes: a.payload.notes }).eq("id", a.payload.user_book_id);
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
      case "follow": {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return false;
        await supabase.from("follows").insert({ follower_id: data.user.id, following_id: a.payload.target_user_id });
        return true;
      }
      case "unfollow": {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return false;
        await supabase.from("follows").delete().eq("follower_id", data.user.id).eq("following_id", a.payload.target_user_id);
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

/**
 * Wrapper: se online, executa `online` (a mutação real). Se offline,
 * enfileira a ação e devolve uma "promise vazia" — o caller pode atualizar
 * a UI otimisticamente sem esperar.
 *
 * Retorna `{ queued: true }` quando enfileirou, `{ queued: false }` quando rodou.
 */
export async function mutateOrQueue(
  action: OfflineAction,
  online: () => Promise<unknown>,
): Promise<{ queued: boolean; error?: unknown }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    queueOfflineAction(action);
    return { queued: true };
  }
  try {
    await online();
    return { queued: false };
  } catch (e) {
    // Falha de rede no meio do voo — enfileira e tenta de novo depois
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      queueOfflineAction(action);
      return { queued: true };
    }
    return { queued: false, error: e };
  }
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
