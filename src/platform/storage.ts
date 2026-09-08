import { Preferences } from "@capacitor/preferences";
import { isNativePlatform } from "@/platform/runtime";

const PREFIX = "readify";

function scopedKey(key: string, userId?: string | null) {
  return `${PREFIX}:${userId ? `user:${userId}:` : ""}${key}`;
}

/**
 * Preferências não sensíveis. Não usar para tokens, senhas ou chaves privadas.
 */
export async function getPreference<T>(
  key: string,
  fallback: T,
  userId?: string | null,
): Promise<T> {
  const namespaced = scopedKey(key, userId);
  try {
    const raw = isNativePlatform()
      ? (await Preferences.get({ key: namespaced })).value
      : localStorage.getItem(namespaced);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function setPreference<T>(
  key: string,
  value: T,
  userId?: string | null,
): Promise<void> {
  const namespaced = scopedKey(key, userId);
  const serialized = JSON.stringify(value);
  if (isNativePlatform()) {
    await Preferences.set({ key: namespaced, value: serialized });
    return;
  }
  localStorage.setItem(namespaced, serialized);
}

export async function removePreference(
  key: string,
  userId?: string | null,
): Promise<void> {
  const namespaced = scopedKey(key, userId);
  if (isNativePlatform()) {
    await Preferences.remove({ key: namespaced });
    return;
  }
  localStorage.removeItem(namespaced);
}
