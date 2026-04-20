import confetti from "canvas-confetti";

/**
 * Burst dourado a partir do centro da tela, ~1.5s.
 * Usado em level-up e ao coletar desafios épicos.
 */
export function goldenBurst() {
  if (typeof window === "undefined") return;
  // Respeita usuários que pediram menos animação
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const colors = ["#FFD700", "#FFC107", "#FFB300", "#FFE082", "#FFFFFF"];
  const duration = 1500;
  const end = Date.now() + duration;

  // Burst inicial forte do centro
  confetti({
    particleCount: 120,
    spread: 90,
    startVelocity: 45,
    ticks: 200,
    origin: { x: 0.5, y: 0.5 },
    colors,
    scalar: 1.1,
    zIndex: 9999,
  });

  // Chuva contínua até completar 1.5s
  (function frame() {
    confetti({
      particleCount: 6,
      angle: 60,
      spread: 55,
      startVelocity: 40,
      origin: { x: 0.5, y: 0.5 },
      colors,
      zIndex: 9999,
    });
    confetti({
      particleCount: 6,
      angle: 120,
      spread: 55,
      startVelocity: 40,
      origin: { x: 0.5, y: 0.5 },
      colors,
      zIndex: 9999,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}
