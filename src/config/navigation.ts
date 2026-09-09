import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeft,
  BookOpen,
  Heart,
  Home,
  Layers,
  Library,
  MessageSquare,
  Repeat,
  ScanLine,
  Search,
  Sparkles,
  User,
  Users,
  UsersRound,
} from "lucide-react";

export type NavigationItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
};

export type NavigationSection = {
  label: string;
  items: NavigationItem[];
};

/**
 * Product IA for Readify.
 *
 * Core promise: Escanear → Organizar → Descobrir.
 * Secondary capabilities stay reachable without competing with the core flow.
 */
export const navigationSections: NavigationSection[] = [
  {
    label: "Principal",
    items: [
      { to: "/", label: "Início", icon: Home, end: true },
      { to: "/buscar", label: "Buscar", icon: Search },
      { to: "/biblioteca", label: "Biblioteca", icon: Library },
      { to: "/scanner", label: "Escanear", icon: ScanLine },
    ],
  },
  {
    label: "Minha coleção",
    items: [
      { to: "/series", label: "Séries", icon: Layers },
      { to: "/desejos", label: "Desejos", icon: Heart },
      { to: "/emprestimos", label: "Empréstimos", icon: ArrowRightLeft },
    ],
  },
  {
    label: "Comunidade",
    items: [
      { to: "/feed", label: "Feed", icon: MessageSquare },
      { to: "/leitores", label: "Leitores", icon: Users },
      { to: "/clubes", label: "Clubes", icon: UsersRound },
      { to: "/buddy", label: "Buddy", icon: BookOpen },
    ],
  },
  {
    label: "Mais",
    items: [
      { to: "/progresso", label: "Progresso", icon: Sparkles },
      { to: "/trocas", label: "Trocas", icon: Repeat },
    ],
  },
];

export const accountNavigation: NavigationItem[] = [
  { to: "/perfil", label: "Perfil", icon: User },
];

/** Five stable mobile destinations. Scanner is rendered as the central hero action. */
export const bottomNavigation = {
  left: [
    { to: "/", label: "Início", icon: Home, end: true },
    { to: "/biblioteca", label: "Biblioteca", icon: Library },
  ] satisfies NavigationItem[],
  center: { to: "/scanner", label: "Escanear", icon: ScanLine } satisfies NavigationItem,
  right: [
    { to: "/buscar", label: "Buscar", icon: Search },
    { to: "/perfil", label: "Perfil", icon: User },
  ] satisfies NavigationItem[],
};

/**
 * Routes deliberately not promoted to first-level navigation.
 * They remain accessible from their parent surfaces.
 */
export const nestedOnlyRoutes = ["/feed-infinito", "/ranking", "/instalar"] as const;
