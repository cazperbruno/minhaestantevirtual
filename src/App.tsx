import { lazy, Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AuthenticatedAppLayout } from "@/components/layout/AuthenticatedAppLayout";
import { LazyErrorBoundary } from "@/components/LazyErrorBoundary";
import { NativeLinkBridge } from "@/components/NativeLinkBridge";
import { AuthProvider } from "@/providers/AuthProvider";
import Auth from "./pages/Auth";
import ScrollToTop from "./components/ScrollToTop";

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
const ClubCategoryPage = lazy(() => import("./pages/ClubCategoryPage"));
const ClubDetailPage = lazy(() => import("./pages/ClubDetailPage"));
const ClubMembersPage = lazy(() => import("./pages/ClubMembersPage"));
const ClubInviteAcceptPage = lazy(() => import("./pages/ClubInviteAcceptPage"));
const PublicProfile = lazy(() => import("./pages/PublicProfile"));
const PublicWishlistPage = lazy(() => import("./pages/PublicWishlistPage"));
const ReadersPage = lazy(() => import("./pages/ReadersPage"));
const TradesPage = lazy(() => import("./pages/TradesPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const ProgressPage = lazy(() => import("./pages/ProgressPage"));
const XpHistoryPage = lazy(() => import("./pages/XpHistoryPage"));
const SeriesDetailPage = lazy(() => import("./pages/SeriesDetailPage"));
const MySeriesPage = lazy(() => import("./pages/MySeriesPage"));
const ManageSeriesPage = lazy(() => import("./pages/ManageSeriesPage"));
const BuddyReadsPage = lazy(() => import("./pages/BuddyReadsPage"));
const BuddyReadDetailPage = lazy(() => import("./pages/BuddyReadDetailPage"));
const InstallAppPage = lazy(() => import("./pages/InstallAppPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const WrappedPage = lazy(() => import("./pages/WrappedPage"));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
  </div>
);

const App = () => (
  <AuthProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner theme="dark" />
        <BrowserRouter>
          <NativeLinkBridge />
          <ScrollToTop />
          <LazyErrorBoundary>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                {/* Rotas públicas essenciais */}
                <Route path="/auth" element={<Auth />} />
                <Route path="/privacidade" element={<PrivacyPolicyPage />} />
                <Route path="/termos" element={<TermsPage />} />
                <Route path="/clubes/convite/:token" element={<ClubInviteAcceptPage />} />
                <Route path="/u/:username/desejos" element={<PublicWishlistPage />} />
                <Route path="/instalar" element={<InstallAppPage />} />

                {/* Uma única boundary de sessão para toda a aplicação autenticada. */}
                <Route element={<ProtectedRoute />}>
                  {/* Onboarding é protegido, mas deliberadamente não usa o shell principal. */}
                  <Route path="/onboarding" element={<Onboarding />} />

                  {/* O shell permanece montado enquanto apenas o Outlet troca de página. */}
                  <Route element={<AuthenticatedAppLayout />}>
                    <Route path="/" element={<Discover />} />
                    <Route path="/buscar" element={<SearchPage />} />
                    <Route path="/scanner" element={<ScannerPage />} />
                    <Route path="/biblioteca" element={<LibraryPage />} />
                    <Route path="/desejos" element={<WishlistPage />} />
                    <Route path="/emprestimos" element={<LoansPage />} />
                    <Route path="/feed" element={<FeedPage />} />
                    <Route path="/feed-infinito" element={<InfiniteFeedPage />} />
                    <Route path="/ranking" element={<RankingPage />} />
                    <Route path="/metas" element={<GoalsPage />} />
                    <Route path="/estatisticas" element={<StatsPage />} />
                    <Route path="/clubes" element={<ClubsPage />} />
                    <Route path="/clubes/categoria/:slug" element={<ClubCategoryPage />} />
                    <Route path="/clubes/:id" element={<ClubDetailPage />} />
                    <Route path="/clubes/:id/membros" element={<ClubMembersPage />} />
                    <Route path="/u/:username" element={<PublicProfile />} />
                    <Route path="/leitores" element={<ReadersPage />} />
                    <Route path="/trocas" element={<TradesPage />} />
                    <Route path="/relatorios" element={<ReportsPage />} />
                    <Route path="/progresso" element={<ProgressPage />} />
                    <Route path="/progresso/historico" element={<XpHistoryPage />} />
                    <Route path="/perfil" element={<ProfilePage />} />
                    <Route path="/configuracoes" element={<SettingsPage />} />
                    <Route path="/livro/:id" element={<BookDetail />} />
                    <Route path="/serie/:id" element={<SeriesDetailPage />} />
                    <Route path="/series" element={<MySeriesPage />} />
                    <Route path="/series/gerenciar" element={<ManageSeriesPage />} />
                    <Route path="/buddy" element={<BuddyReadsPage />} />
                    <Route path="/buddy/:id" element={<BuddyReadDetailPage />} />
                    <Route path="/admin" element={<AdminPage />} />
                    <Route path="/wrapped" element={<WrappedPage />} />
                  </Route>
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </LazyErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </AuthProvider>
);

export default App;
