import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Auth from "./pages/Auth";
import Discover from "./pages/Discover";
import LibraryPage from "./pages/LibraryPage";
import WishlistPage from "./pages/WishlistPage";
import ProfilePage from "./pages/ProfilePage";
import SearchPage from "./pages/SearchPage";
import BookDetail from "./pages/BookDetail";
import ScannerPage from "./pages/ScannerPage";
import LoansPage from "./pages/LoansPage";
import FeedPage from "./pages/FeedPage";
import RankingPage from "./pages/RankingPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner theme="dark" />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/" element={<ProtectedRoute><Discover /></ProtectedRoute>} />
          <Route path="/buscar" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
          <Route path="/scanner" element={<ProtectedRoute><ScannerPage /></ProtectedRoute>} />
          <Route path="/biblioteca" element={<ProtectedRoute><LibraryPage /></ProtectedRoute>} />
          <Route path="/desejos" element={<ProtectedRoute><WishlistPage /></ProtectedRoute>} />
          <Route path="/emprestimos" element={<ProtectedRoute><LoansPage /></ProtectedRoute>} />
          <Route path="/feed" element={<ProtectedRoute><FeedPage /></ProtectedRoute>} />
          <Route path="/ranking" element={<ProtectedRoute><RankingPage /></ProtectedRoute>} />
          <Route path="/perfil" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/livro/:id" element={<ProtectedRoute><BookDetail /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
