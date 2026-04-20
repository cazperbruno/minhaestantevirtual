import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { MobileHeader } from "./MobileHeader";
import { ScannerFab } from "./ScannerFab";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  // Stale-while-revalidate: assina canais Realtime e invalida queries.
  useRealtimeInvalidation();
  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <MobileHeader />
        <main key={pathname} className="flex-1 min-w-0 pb-24 md:pb-0 animate-page-in">
          {children}
        </main>
      </div>
      <ScannerFab />
      <BottomNav />
    </div>
  );
}
