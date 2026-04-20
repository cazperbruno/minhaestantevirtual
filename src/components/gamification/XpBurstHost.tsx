import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, Flame, Trophy } from "lucide-react";

export type XpBurst = {
  id: number;
  amount: number;
  label?: string;
  variant?: "xp" | "level" | "streak";
};

type Listener = (b: XpBurst) => void;
const listeners = new Set<Listener>();
let counter = 0;

/** Dispara um burst flutuante. Funciona inclusive com toast silenciado. */
export function emitXpBurst(input: Omit<XpBurst, "id">) {
  const burst: XpBurst = { id: ++counter, ...input };
  listeners.forEach((l) => l(burst));
}

/** Monte uma única vez no AppShell. */
export function XpBurstHost() {
  const [bursts, setBursts] = useState<XpBurst[]>([]);

  useEffect(() => {
    const onBurst: Listener = (b) => {
      setBursts((prev) => [...prev, b]);
      // Auto-clean após animação
      setTimeout(() => {
        setBursts((prev) => prev.filter((x) => x.id !== b.id));
      }, 1800);
    };
    listeners.add(onBurst);
    return () => {
      listeners.delete(onBurst);
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-0 z-[100] flex items-start justify-end pt-20 pr-6 md:pt-24 md:pr-10"
    >
      <AnimatePresence>
        {bursts.map((b, i) => (
          <BurstBubble key={b.id} burst={b} index={i} />
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

function BurstBubble({ burst, index }: { burst: XpBurst; index: number }) {
  const variant = burst.variant ?? "xp";
  const Icon = variant === "level" ? Trophy : variant === "streak" ? Flame : Sparkles;
  const tint =
    variant === "level"
      ? "from-amber-400 to-orange-500"
      : variant === "streak"
      ? "from-orange-500 to-red-500"
      : "from-primary to-primary/70";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.6 }}
      animate={{ opacity: 1, y: -index * 56, scale: 1 }}
      exit={{ opacity: 0, y: -120, scale: 0.8 }}
      transition={{ type: "spring", stiffness: 380, damping: 22, mass: 0.6 }}
      className="absolute right-0 top-0"
    >
      <motion.div
        animate={{
          y: [0, -6, 0],
        }}
        transition={{ duration: 1.2, repeat: 1, ease: "easeInOut" }}
        className={`pointer-events-none flex items-center gap-2 rounded-full bg-gradient-to-r ${tint} px-4 py-2 text-white shadow-[0_8px_30px_-8px_hsl(var(--primary)/0.6)] ring-2 ring-white/20`}
      >
        <Icon className="h-4 w-4 drop-shadow" />
        <span className="font-display text-sm font-bold tracking-wide">
          {variant === "level" ? `Nível ${burst.amount}!` : `+${burst.amount} XP`}
        </span>
        {burst.label && (
          <span className="hidden text-xs opacity-90 sm:inline">{burst.label}</span>
        )}
      </motion.div>
      {/* Partículas leves */}
      {variant !== "xp" && (
        <motion.div
          initial={{ opacity: 0.8, scale: 0 }}
          animate={{ opacity: 0, scale: 2.4 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className={`absolute inset-0 -z-10 rounded-full bg-gradient-to-r ${tint} blur-xl`}
        />
      )}
    </motion.div>
  );
}
