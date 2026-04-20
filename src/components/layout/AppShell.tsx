import { ReactNode, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { MobileHeader } from "./MobileHeader";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { useAuth } from "@/hooks/useAuth";
import { tickStreak } from "@/lib/xp";
import { XpBurstHost } from "@/components/gamification/XpBurstHost";
import { UpdatePrompt } from "@/components/pwa/UpdatePrompt";
import { OfflineBanner } from "@/components/pwa/OfflineBanner";

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const tickedRef = useRef(false);
  // Stale-while-revalidate: assina canais Realtime e invalida queries.
  useRealtimeInvalidation();
  // Tick de streak diário (1x por sessão)
  useEffect(() => {
    if (user?.id && !tickedRef.current) {
      tickedRef.current = true;
      void tickStreak(user.id);
    }
  }, [user?.id]);
  return (
    <div className="min-h-screen flex">
      <a href="#main-content" className="skip-link">Pular para o conteúdo</a>
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <MobileHeader />
        <main id="main-content" key={pathname} className="flex-1 min-w-0 pb-24 md:pb-0 animate-page-in" tabIndex={-1}>
          {children}
        </main>
      </div>
      <BottomNav />
      <XpBurstHost />
      <UpdatePrompt />
      <OfflineBanner />
    </div>
  );
}
