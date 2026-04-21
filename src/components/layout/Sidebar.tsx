import { Book, BookOpen, Library, Heart, User as UserIcon, LogOut, Search, ScanBarcode, ArrowRightLeft, MessageSquare, Trophy, Users, Repeat, Sparkles, Layers, Download, Settings } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { NotificationsBell } from "@/components/social/NotificationsBell";
import readifyMark from "@/assets/readify-mark-v8.webp";

const items = [
  { to: "/", label: "Descobrir", icon: Book },
  { to: "/feed-infinito", label: "Para você", icon: BookOpen },
  { to: "/biblioteca", label: "Biblioteca", icon: Library },
  { to: "/series", label: "Minhas séries", icon: Layers },
  { to: "/desejos", label: "Lista de desejos", icon: Heart },
  { to: "/emprestimos", label: "Empréstimos", icon: ArrowRightLeft },
  { to: "/trocas", label: "Trocas", icon: Repeat },
  { to: "/scanner", label: "Scanner", icon: ScanBarcode },
  { to: "/feed", label: "Feed social", icon: MessageSquare },
  { to: "/leitores", label: "Leitores", icon: Users },
  { to: "/clubes", label: "Clubes", icon: Users },
  { to: "/buddy", label: "Buddy Reading", icon: BookOpen },
  { to: "/progresso", label: "Progresso", icon: Sparkles },
  { to: "/ranking", label: "Ranking", icon: Trophy },
  { to: "/instalar", label: "Instalar app", icon: Download },
  { to: "/perfil", label: "Perfil", icon: UserIcon },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

export function Sidebar() {
  const navigate = useNavigate();
  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Até logo!");
    navigate("/auth");
  };
  return (
    <aside
      className="hidden md:flex flex-col shrink-0 items-stretch border-r border-border bg-sidebar h-screen max-h-screen sticky top-0 overflow-hidden p-3"
      style={{ width: "max-content", maxWidth: "80vw" }}
    >
      <div className="pb-4 flex items-center justify-between gap-2 shrink-0 px-1">
        <NavLink to="/" className="flex items-center gap-2 min-w-0">
          <img src={readifyMark} alt="Readify" className="h-9 w-9 select-none object-contain shrink-0" draggable={false} />
          <span className="font-display text-lg font-bold tracking-tight">Readify</span>
        </NavLink>
        <NotificationsBell compact />
      </div>
      <nav
        className="flex-1 min-h-0 space-y-1 overflow-y-auto overscroll-contain scroll-smooth [scrollbar-width:thin] [-webkit-overflow-scrolling:touch] pr-1"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                isActive
                  ? "bg-primary/15 text-primary shadow-glow"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
        <NavLink
          to="/buscar"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
              isActive
                ? "bg-primary/15 text-primary"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
            )
          }
        >
          <Search className="h-4 w-4 shrink-0" /> Buscar livros
        </NavLink>
      </nav>
      <div className="pt-3 mt-2 border-t border-sidebar-border shrink-0">
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={handleLogout}>
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </div>
    </aside>
  );
}
