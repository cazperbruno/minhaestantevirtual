import { Book, Library, Heart, User as UserIcon, LogOut, Search, ScanBarcode, ArrowRightLeft, MessageSquare, Trophy, Target, Users, BarChart3, Infinity as InfinityIcon } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const items = [
  { to: "/", label: "Descobrir", icon: Book },
  { to: "/feed-infinito", label: "Feed infinito", icon: InfinityIcon },
  { to: "/biblioteca", label: "Biblioteca", icon: Library },
  { to: "/desejos", label: "Lista de desejos", icon: Heart },
  { to: "/emprestimos", label: "Empréstimos", icon: ArrowRightLeft },
  { to: "/scanner", label: "Scanner", icon: ScanBarcode },
  { to: "/feed", label: "Feed social", icon: MessageSquare },
  { to: "/clubes", label: "Clubes", icon: Users },
  { to: "/ranking", label: "Ranking", icon: Trophy },
  { to: "/metas", label: "Metas", icon: Target },
  { to: "/estatisticas", label: "Estatísticas", icon: BarChart3 },
  { to: "/perfil", label: "Perfil", icon: UserIcon },
];

export function Sidebar() {
  const navigate = useNavigate();
  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Até logo!");
    navigate("/auth");
  };
  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-border bg-sidebar h-screen sticky top-0">
      <div className="px-6 pt-7 pb-8">
        <h1 className="font-display text-2xl font-bold text-gradient-gold">Página</h1>
        <p className="text-xs text-muted-foreground mt-1">Sua biblioteca pessoal</p>
      </div>
      <nav className="flex-1 px-3 space-y-1">
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
        <NavLink
          to="/buscar"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
              isActive
                ? "bg-primary/15 text-primary"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
            )
          }
        >
          <Search className="h-4 w-4" /> Buscar livros
        </NavLink>
      </nav>
      <div className="p-4 border-t border-sidebar-border">
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={handleLogout}>
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </div>
    </aside>
  );
}
