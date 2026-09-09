import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { prefetch } from "@/lib/prefetch";
import { bottomNavigation, type NavigationItem } from "@/config/navigation";

/**
 * Navegação inferior mobile — cinco destinos estáveis.
 * Início · Biblioteca · Escanear · Buscar · Perfil
 */
export function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const prefetchFor = (to: string) => {
    if (to === "/biblioteca") prefetch.library(user?.id);
    else if (to === "/perfil" && user?.id) prefetch.profile(user.id);
  };

  const scanActive = pathname.startsWith(bottomNavigation.center.to);
  const isActive = (item: NavigationItem) =>
    item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);

  const renderItem = (item: NavigationItem) => {
    const active = isActive(item);
    const Icon = item.icon;

    return (
      <li key={item.to}>
        <NavLink
          to={item.to}
          end={item.end}
          onMouseEnter={() => prefetchFor(item.to)}
          onTouchStart={() => prefetchFor(item.to)}
          onFocus={() => prefetchFor(item.to)}
          className={cn(
            "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2.5 text-[10px] transition-colors",
            active ? "text-primary" : "text-muted-foreground hover:text-foreground",
          )}
          aria-label={item.label}
        >
          <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]")} />
          <span className="max-w-full truncate font-medium leading-tight">{item.label}</span>
        </NavLink>
      </li>
    );
  };

  const ScanIcon = bottomNavigation.center.icon;

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border glass md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="relative grid grid-cols-5 items-end">
        {bottomNavigation.left.map(renderItem)}

        <li className="flex justify-center">
          <button
            type="button"
            onClick={() => navigate(bottomNavigation.center.to)}
            aria-label="Escanear livro"
            className={cn(
              "relative -mt-7 flex h-16 w-16 flex-col items-center justify-center rounded-full",
              "border-4 border-background bg-primary text-primary-foreground shadow-glow",
              "tap-scale transition-transform active:scale-95",
              scanActive && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
            )}
          >
            <ScanIcon className="h-6 w-6" />
            <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider">
              {bottomNavigation.center.label}
            </span>
          </button>
        </li>

        {bottomNavigation.right.map(renderItem)}
      </ul>
    </nav>
  );
}
