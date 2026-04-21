import {
  Book,
  Library,
  Heart,
  User as UserIcon,
  LogOut,
  ArrowRightLeft,
  Users,
  Infinity as InfinityIcon,
  Repeat,
  Layers,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { NotificationsBell } from "@/components/social/NotificationsBell";
import readifyLogo from "@/assets/readify-logo-v8.png";

/**
 * Menu lateral enxuto — apenas o essencial.
 * Metas, Estatísticas, Relatórios, Ranking, Progresso, Scanner, Feed, Buddy,
 * Clubes, Buscar e Instalar foram movidos para dentro do Perfil (hub central)
 * ou para deep-links contextuais.
 */
const items = [
  { to: "/", label: "Início", icon: Book },
  { to: "/feed-infinito", label: "Para você", icon: InfinityIcon },
  { to: "/leitores", label: "Leitores", icon: Users },
  { to: "/biblioteca", label: "Biblioteca", icon: Library },
  { to: "/series", label: "Minhas séries", icon: Layers },
  { to: "/desejos", label: "Lista de desejos", icon: Heart },
  { to: "/emprestimos", label: "Empréstimos", icon: ArrowRightLeft },
  { to: "/trocas", label: "Trocas", icon: Repeat },
  { to: "/perfil", label: "Configurações", icon: UserIcon },
];

export function Sidebar() {
  const navigate = useNavigate();
  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Até logo!");
    navigate("/auth");
  };
  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-border bg-sidebar h-screen max-h-screen sticky top-0 overflow-hidden">
      <div className="px-5 pt-6 pb-5 flex items-center justify-between gap-2 shrink-0">
        <NavLink to="/" className="flex items-center min-w-0">
          <img src={readifyLogo} alt="Readify" className="h-10 max-w-[180px] w-auto select-none object-contain" draggable={false} />
        </NavLink>
        <NotificationsBell compact />
      </div>
      <nav
        className="flex-1 min-h-0 px-3 space-y-1 overflow-y-auto overscroll-contain scroll-smooth [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                isActive
                  ? "bg-primary/15 text-primary shadow-glow"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-sidebar-border shrink-0">
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={handleLogout}>
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </div>
    </aside>
  );
}
