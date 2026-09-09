import { LogOut, Settings, Shield } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { NotificationsBell } from "@/components/social/NotificationsBell";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { accountNavigation, navigationSections } from "@/config/navigation";
import readifyMark from "@/assets/readify-mark-v8.webp";

export function Sidebar() {
  const navigate = useNavigate();
  const { isAdmin } = useIsAdmin();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Não foi possível sair da conta. Tente novamente.");
      return;
    }
    toast.success("Até logo!");
    navigate("/auth");
  };

  return (
    <aside className="sticky top-0 hidden h-screen max-h-screen w-56 shrink-0 flex-col overflow-hidden border-r border-border bg-sidebar p-3 md:flex lg:w-60">
      <div className="flex shrink-0 items-center justify-between gap-2 px-1 pb-4">
        <NavLink to="/" className="flex min-w-0 items-center gap-2" aria-label="Readify — Início">
          <img
            src={readifyMark}
            alt="Readify"
            className="h-9 w-9 shrink-0 select-none object-contain"
            draggable={false}
          />
          <span className="truncate font-display text-lg font-bold tracking-tight">Readify</span>
        </NavLink>
        <NotificationsBell compact />
      </div>

      <nav
        aria-label="Navegação principal"
        className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pr-1 scroll-smooth [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {navigationSections.map((section) => (
          <section key={section.label} aria-label={section.label}>
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      cn(
                        "flex min-h-12 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
                      )
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>

      <div className="mt-2 shrink-0 space-y-1 border-t border-sidebar-border pt-3">
        {accountNavigation.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex min-h-12 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}

        <NavLink
          to="/configuracoes"
          className={({ isActive }) =>
            cn(
              "flex min-h-12 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
            )
          }
        >
          <Settings className="h-4 w-4" /> Configurações
        </NavLink>

        {isAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              cn(
                "flex min-h-12 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              )
            }
          >
            <Shield className="h-4 w-4" /> Admin
          </NavLink>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </div>
    </aside>
  );
}
