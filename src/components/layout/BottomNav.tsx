import {
  Library,
  Heart,
  Users,
  ScanLine,
  Sparkles,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { prefetch } from "@/lib/prefetch";

/**
 * Navegação inferior mobile — 5 atalhos essenciais.
 * Labels curtas (8 chars max) pra caber em 411px sem quebrar nem truncar.
 * Ordem: Biblioteca · Social (feed) · Escanear (centro) · Progresso · Clubes
 */
const left = [
  { to: "/biblioteca", label: "Biblioteca", icon: Library },
  { to: "/feed-infinito", label: "Social", icon: Heart },
];
const right = [
  { to: "/progresso", label: "Progresso", icon: Sparkles },
  { to: "/clubes", label: "Clubes", icon: Users },
];

export function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const prefetchFor = (to: string) => {
    if (to === "/biblioteca") prefetch.library(user?.id);
    else if (to === "/feed-infinito" || to === "/feed") prefetch.feed();
    else if (to === "/perfil" && user?.id) prefetch.profile(user.id);
    // /clubes não tem prefetch dedicado — carrega rápido pela query padrão
  };

  const scanActive = pathname.startsWith("/scanner");
  const isActive = (to: string) =>
    pathname === to || (to !== "/" && pathname.startsWith(to));

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5 items-end relative">
        {left.map(({ to, label, icon: Icon }) => {
          const active = isActive(to);
          return (
            <li key={to}>
              <NavLink
                to={to}
                onMouseEnter={() => prefetchFor(to)}
                onTouchStart={() => prefetchFor(to)}
                onFocus={() => prefetchFor(to)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-3 px-1 text-[10px] transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]")} />
                <span className="font-medium leading-tight truncate max-w-full">{label}</span>
              </NavLink>
            </li>
          );
        })}

        {/* Center: Escanear — destaque vermelho (the hero action) */}
        <li className="flex justify-center">
          <button
            onClick={() => navigate("/scanner")}
            aria-label="Escanear livro"
            className={cn(
              "relative -mt-7 h-16 w-16 rounded-full flex flex-col items-center justify-center",
              "bg-primary text-primary-foreground border-4 border-background shadow-glow",
              "transition-transform active:scale-95 tap-scale",
              scanActive && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
            )}
          >
            <ScanLine className="h-6 w-6" />
            <span className="text-[9px] font-bold uppercase tracking-wider mt-0.5">Escanear</span>
          </button>
        </li>

        {right.map(({ to, label, icon: Icon }) => {
          const active = isActive(to);
          return (
            <li key={to}>
              <NavLink
                to={to}
                onMouseEnter={() => prefetchFor(to)}
                onTouchStart={() => prefetchFor(to)}
                onFocus={() => prefetchFor(to)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-3 px-1 text-[10px] transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]")} />
                <span className="font-medium">{label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
