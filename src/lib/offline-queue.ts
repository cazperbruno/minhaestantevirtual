/**
 * Lightweight offline action queue.
 *
 * Regras de integridade:
 * - A fila é SEMPRE particionada pelo usuário autenticado.
 * - Ação só é removida após confirmação real do Supabase.
 * - Erros retornados por supabase-js são tratados explicitamente.
 * - Troca/logout de conta nunca reaplica ações de outro usuário.
 * - Conectividade vem do adapter multiplataforma (Web/Android/iOS).
 */

import { supabase } from "@/integrations/supabase/client";
import { getNetworkStatus, subscribeNetworkStatus } from "@/platform/network";
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

const STORAGE_PREFIX = "readify:offline-queue:";
let activeUserId: string | null = null;

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function load(userId: string): OfflineAction[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(userId: string, items: OfflineAction[]) {
  try {
    const key = storageKey(userId);
    if (items.length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(items));
  } catch {
    console.warn("[offline-queue] local storage unavailable");
  }
}

async function resolveCurrentUserId(): Promise<string | null> {
  return activeUserId;
}

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

function cancels(a: OfflineAction, b: OfflineAction): boolean {
  return (
    (a.kind === "review_like" && b.kind === "review_unlike") ||
    (a.kind === "review_unlike" && b.kind === "review_like") ||
    (a.kind === "follow" && b.kind === "unfollow") ||
    (a.kind === "unfollow" && b.kind === "follow")
  );
}

function enqueueForUser(userId: string, action: OfflineAction) {
  const items = load(userId);
  const key = dedupKey(action);
  const idx = items.findIndex((x) => dedupKey(x) === key);
  if (idx >= 0 && cancels(items[idx], action)) {
    items.splice(idx, 1);
  } else {
    if (idx >= 0) items.splice(idx, 1);
    items.push(action);
  }
  save(userId, items);
}

export function queueOfflineAction(action: OfflineAction): boolean {
  if (!activeUserId) {
    console.warn("[offline-queue] refused unowned action", action.kind);
    return false;
  }
  enqueueForUser(activeUserId, action);
  return true;
}

export function getOfflineQueueSize(): number {
  return activeUserId ? load(activeUserId).length : 0;
}

function isDuplicateError(error: any): boolean {
  return error?.code === "23505";
}

async function executeAction(a: OfflineAction, userId: string): Promise<boolean> {
  try {
    switch (a.kind) {
      case "book_status": {
        const { data, error } = await supabase
          .from("user_books")
          .update({ status: a.payload.status as any })
          .eq("id", a.payload.user_book_id)
          .eq("user_id", userId)
          .select("id")
          .maybeSingle();
        return !error && !!data;
      }
      case "book_rating": {
        const { data, error } = await supabase
          .from("user_books")
          .update({ rating: a.payload.rating })
          .eq("id", a.payload.user_book_id)
          .eq("user_id", userId)
          .select("id")
          .maybeSingle();
        return !error && !!data;
      }
      case "book_progress": {
        const { data, error } = await supabase
          .from("user_books")
          .update({ current_page: a.payload.current_page })
          .eq("id", a.payload.user_book_id)
          .eq("user_id", userId)
          .select("id")
          .maybeSingle();
        return !error && !!data;
      }
      case "book_notes": {
        const { error } = await supabase.from("user_book_notes").upsert(
          { user_book_id: a.payload.user_book_id, user_id: userId, notes: a.payload.notes },
          { onConflict: "user_book_id" },
        );
        return !error;
      }
      case "review_like": {
        const { error } = await supabase
          .from("review_likes")
          .insert({ review_id: a.payload.review_id, user_id: userId });
        return !error || isDuplicateError(error);
      }
      case "review_unlike": {
        const { error } = await supabase
          .from("review_likes")
          .delete()
          .eq("review_id", a.payload.review_id)
          .eq("user_id", userId);
        return !error;
      }
      case "follow": {
        const { error } = await supabase
          .from("follows")
          .insert({ follower_id: userId, following_id: a.payload.target_user_id });
        return !error || isDuplicateError(error);
      }
      case "unfollow": {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", userId)
          .eq("following_id", a.payload.target_user_id);
        return !error;
      }
    }
  } catch (e) {
    console.warn("[offline-queue] failed", a.kind, e);
    return false;
  }
}

let replaying = false;
export async function replayOfflineQueue(): Promise<{ ok: number; failed: number }> {
  if (replaying) return { ok: 0, failed: 0 };

  const network = await getNetworkStatus();
  if (!network.connected) return { ok: 0, failed: 0 };

  const userId = await resolveCurrentUserId();
  if (!userId) return { ok: 0, failed: 0 };

  replaying = true;
  try {
    const items = load(userId);
    if (items.length === 0) return { ok: 0, failed: 0 };

    const remaining: OfflineAction[] = [];
    let ok = 0;
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const currentUserId = await resolveCurrentUserId();
      if (currentUserId !== userId) {
        remaining.push(...items.slice(index));
        break;
      }

      const currentNetwork = await getNetworkStatus();
      if (!currentNetwork.connected) {
        remaining.push(...items.slice(index));
        break;
      }

      const success = await executeAction(item, userId);
      if (success) ok++;
      else remaining.push(item);
    }
    save(userId, remaining);

    if (ok > 0) {
      toast.success(`${ok} ${ok === 1 ? "ação sincronizada" : "ações sincronizadas"}`);
    }
    return { ok, failed: remaining.length };
  } finally {
    replaying = false;
  }
}

function returnedSupabaseError(result: unknown): unknown | null {
  if (!result || typeof result !== "object") return null;
  if (!("error" in result)) return null;
  return (result as { error?: unknown }).error ?? null;
}

export async function mutateOrQueue(
  action: OfflineAction,
  online: () => Promise<unknown>,
): Promise<{ queued: boolean; error?: unknown }> {
  const network = await getNetworkStatus();
  if (!network.connected) {
    const userId = await resolveCurrentUserId();
    if (!userId) return { queued: false, error: new Error("not_authenticated") };
    enqueueForUser(userId, action);
    return { queued: true };
  }

  try {
    const result = await online();
    const error = returnedSupabaseError(result);
    if (error) return { queued: false, error };
    return { queued: false };
  } catch (e) {
    const afterFailure = await getNetworkStatus();
    if (!afterFailure.connected) {
      const userId = await resolveCurrentUserId();
      if (!userId) return { queued: false, error: e };
      enqueueForUser(userId, action);
      return { queued: true };
    }
    return { queued: false, error: e };
  }
}

let setupDone = false;
let networkCleanup: (() => Promise<void>) | null = null;

export function setOfflineSyncUser(userId: string | null) {
  const previousUserId = activeUserId;
  activeUserId = userId;

  if (activeUserId && activeUserId !== previousUserId) {
    void getNetworkStatus().then((network) => {
      if (network.connected) void replayOfflineQueue();
    });
  }
}

export function setupOfflineSync() {
  if (setupDone) return;
  setupDone = true;

  void subscribeNetworkStatus((network) => {
    if (network.connected) void replayOfflineQueue();
  }).then((cleanup) => {
    networkCleanup = cleanup;
  });
}

/** Exposto para testes/HMR; no app real o sync vive durante toda a sessão. */
export async function teardownOfflineSyncForTests() {
  setupDone = false;
  if (networkCleanup) await networkCleanup();
  networkCleanup = null;
  activeUserId = null;
}
