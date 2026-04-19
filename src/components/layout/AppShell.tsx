import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main key={pathname} className="flex-1 min-w-0 pb-24 md:pb-0 animate-page-in">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
