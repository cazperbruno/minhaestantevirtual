import {
  Haptics,
  ImpactStyle,
  NotificationType,
} from "@capacitor/haptics";
import { isNativePlatform } from "@/platform/runtime";

/** Haptic feedback compartilhado entre Web/PWA, Android e iOS. */
type Pattern = "tap" | "success" | "error" | "toggle";

const WEB_PATTERNS: Record<Pattern, number | number[]> = {
  tap: 8,
  toggle: 12,
  success: [10, 40, 20],
  error: [30, 30, 30],
};

let reducedMotion: boolean | null = null;

function prefersReducedMotion(): boolean {
  if (reducedMotion !== null) return reducedMotion;
  if (typeof window === "undefined" || !window.matchMedia) return false;
  reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return reducedMotion;
}

async function nativeHaptic(pattern: Pattern) {
  switch (pattern) {
    case "success":
      await Haptics.notification({ type: NotificationType.Success });
      return;
    case "error":
      await Haptics.notification({ type: NotificationType.Error });
      return;
    case "toggle":
      await Haptics.impact({ style: ImpactStyle.Medium });
      return;
    case "tap":
    default:
      await Haptics.impact({ style: ImpactStyle.Light });
  }
}

export function haptic(pattern: Pattern = "tap"): void {
  if (prefersReducedMotion()) return;

  if (isNativePlatform()) {
    void nativeHaptic(pattern).catch(() => {
      // Haptics are progressive enhancement; never break the user action.
    });
    return;
  }

  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(WEB_PATTERNS[pattern]);
  } catch {
    // Alguns browsers bloqueiam vibração fora de gesto do usuário.
  }
}
