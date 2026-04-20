/**
 * Haptic feedback — vibração tátil leve para microinterações.
 *
 * Estratégia:
 * - Usa Vibration API (Android/Chrome). Silencioso onde não há suporte (iOS Safari).
 * - Respeita `prefers-reduced-motion`: usuários sensíveis não recebem vibração.
 * - Padrões curtos (≤30ms) — apenas confirmação tátil, nunca distrativo.
 */

type Pattern = "tap" | "success" | "error" | "toggle";

const PATTERNS: Record<Pattern, number | number[]> = {
  tap: 8,           // toque sutil — like, follow
  toggle: 12,       // troca de estado — bookmark, status
  success: [10, 40, 20], // confirmação positiva — XP, conquista
  error: [30, 30, 30],   // alerta de erro
};

let reducedMotion: boolean | null = null;

function prefersReducedMotion(): boolean {
  if (reducedMotion !== null) return reducedMotion;
  if (typeof window === "undefined" || !window.matchMedia) return false;
  reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return reducedMotion;
}

export function haptic(pattern: Pattern = "tap"): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  if (prefersReducedMotion()) return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    /* silent — alguns browsers bloqueiam fora de gesto do usuário */
  }
}
