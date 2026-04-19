import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Strip a leading "@" from a username (for storage / lookups). */
export function normalizeUsername(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

/** Always render a username with a single leading "@". */
export function displayUsername(raw: string | null | undefined): string {
  const u = normalizeUsername(raw);
  return u ? `@${u}` : "";
}
