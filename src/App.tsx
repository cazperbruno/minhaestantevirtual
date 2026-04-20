import { lazy, Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Auth from "./pages/Auth";

// Code-splitting: páginas carregadas sob demanda
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Discover = lazy(() => import("./pages/Discover"));
const LibraryPage = lazy(() => import("./pages/LibraryPage"));
const WishlistPage = lazy(() => import("./pages/WishlistPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const BookDetail = lazy(() => import("./pages/BookDetail"));
const ScannerPage = lazy(() => import("./pages/ScannerPage"));
const LoansPage = lazy(() => import("./pages/LoansPage"));
const FeedPage = lazy(() => import("./pages/FeedPage"));
const InfiniteFeedPage = lazy(() => import("./pages/InfiniteFeedPage"));
const RankingPage = lazy(() => import("./pages/RankingPage"));
const GoalsPage = lazy(() => import("./pages/GoalsPage"));
const StatsPage = lazy(() => import("./pages/StatsPage"));
const ClubsPage = lazy(() => import("./pages/ClubsPage"));
const ClubDetailPage = lazy(() => import("./pages/ClubDetailPage"));
const PublicProfile = lazy(() => import("./pages/PublicProfile"));
const ReadersPage = lazy(() => import("./pages/ReadersPage"));
const TradesPage = lazy(() => import("./pages/TradesPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const ProgressPage = lazy(() => import("./pages/ProgressPage"));
const XpHistoryPage = lazy(() => import("./pages/XpHistoryPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner theme="dark" />
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
            <Route path="/" element={<ProtectedRoute><Discover /></ProtectedRoute>} />
            <Route path="/buscar" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
            <Route path="/scanner" element={<ProtectedRoute><ScannerPage /></ProtectedRoute>} />
            <Route path="/biblioteca" element={<ProtectedRoute><LibraryPage /></ProtectedRoute>} />
            <Route path="/desejos" element={<ProtectedRoute><WishlistPage /></ProtectedRoute>} />
            <Route path="/emprestimos" element={<ProtectedRoute><LoansPage /></ProtectedRoute>} />
            <Route path="/feed" element={<ProtectedRoute><FeedPage /></ProtectedRoute>} />
            <Route path="/feed-infinito" element={<ProtectedRoute><InfiniteFeedPage /></ProtectedRoute>} />
            <Route path="/ranking" element={<ProtectedRoute><RankingPage /></ProtectedRoute>} />
            <Route path="/metas" element={<ProtectedRoute><GoalsPage /></ProtectedRoute>} />
            <Route path="/estatisticas" element={<ProtectedRoute><StatsPage /></ProtectedRoute>} />
            <Route path="/clubes" element={<ProtectedRoute><ClubsPage /></ProtectedRoute>} />
            <Route path="/clubes/:id" element={<ProtectedRoute><ClubDetailPage /></ProtectedRoute>} />
            <Route path="/u/:username" element={<ProtectedRoute><PublicProfile /></ProtectedRoute>} />
            <Route path="/leitores" element={<ProtectedRoute><ReadersPage /></ProtectedRoute>} />
            <Route path="/trocas" element={<ProtectedRoute><TradesPage /></ProtectedRoute>} />
            <Route path="/relatorios" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
            <Route path="/progresso" element={<ProtectedRoute><ProgressPage /></ProtectedRoute>} />
            <Route path="/progresso/historico" element={<ProtectedRoute><XpHistoryPage /></ProtectedRoute>} />
            <Route path="/perfil" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/livro/:id" element={<ProtectedRoute><BookDetail /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
