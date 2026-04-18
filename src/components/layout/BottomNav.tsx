import { Book, Library, Heart, User as UserIcon } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "Descobrir", icon: Book },
  { to: "/biblioteca", label: "Biblioteca", icon: Library },
  { to: "/desejos", label: "Desejos", icon: Heart },
  { to: "/perfil", label: "Perfil", icon: UserIcon },
];

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-4">
        {items.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || (to !== "/" && pathname.startsWith(to));
          return (
            <li key={to}>
              <NavLink
                to={to}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-3 text-xs transition-colors",
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
