/**
 * Categorias curadas de clubes de leitura.
 * Mantemos um conjunto fixo para garantir consistência visual e descoberta.
 */
export type ClubCategory =
  | "manga"
  | "fantasia"
  | "romance"
  | "hq"
  | "autoajuda"
  | "classicos"
  | "nao_ficcao"
  | "sci_fi"
  | "terror"
  | "infantojuvenil"
  | "tecnicos"
  | "geral";

export interface ClubCategoryMeta {
  slug: ClubCategory;
  label: string;
  emoji: string;
  /** Cor base — usada via gradiente; mantenha tons HSL coerentes com o design system. */
  gradient: string;
  /** Cor de texto/ícone secundário sobre o gradiente. */
  accent: string;
  description: string;
}

export const CLUB_CATEGORIES: ClubCategoryMeta[] = [
  {
    slug: "manga",
    label: "Mangás",
    emoji: "📖",
    gradient: "from-pink-500/30 via-rose-500/20 to-fuchsia-500/30",
    accent: "text-pink-200",
    description: "Shonen, seinen, shoujo e mais",
  },
  {
    slug: "fantasia",
    label: "Fantasia",
    emoji: "🐉",
    gradient: "from-violet-500/30 via-purple-500/20 to-indigo-500/30",
    accent: "text-violet-200",
    description: "Mundos mágicos e épicos",
  },
  {
    slug: "romance",
    label: "Romance",
    emoji: "💌",
    gradient: "from-rose-500/30 via-red-500/20 to-pink-500/30",
    accent: "text-rose-200",
    description: "Histórias para o coração",
  },
  {
    slug: "hq",
    label: "Quadrinhos",
    emoji: "🦸",
    gradient: "from-amber-500/30 via-orange-500/20 to-red-500/30",
    accent: "text-amber-200",
    description: "Heróis, indies e graphic novels",
  },
  {
    slug: "sci_fi",
    label: "Sci-fi",
    emoji: "🚀",
    gradient: "from-cyan-500/30 via-sky-500/20 to-blue-500/30",
    accent: "text-cyan-200",
    description: "Ficção científica e futuro",
  },
  {
    slug: "terror",
    label: "Terror",
    emoji: "🕯️",
    gradient: "from-zinc-700/40 via-slate-700/30 to-red-900/40",
    accent: "text-red-200",
    description: "Suspense, horror e mistério",
  },
  {
    slug: "classicos",
    label: "Clássicos",
    emoji: "📜",
    gradient: "from-amber-700/30 via-yellow-700/20 to-orange-700/30",
    accent: "text-amber-100",
    description: "A literatura que atravessa séculos",
  },
  {
    slug: "nao_ficcao",
    label: "Não-ficção",
    emoji: "🧠",
    gradient: "from-emerald-500/30 via-teal-500/20 to-green-500/30",
    accent: "text-emerald-200",
    description: "História, ciência e biografias",
  },
  {
    slug: "autoajuda",
    label: "Autoajuda",
    emoji: "✨",
    gradient: "from-yellow-400/30 via-amber-400/20 to-orange-400/30",
    accent: "text-yellow-100",
    description: "Crescimento, hábitos e mindset",
  },
  {
    slug: "infantojuvenil",
    label: "Infantojuvenil",
    emoji: "🧸",
    gradient: "from-sky-400/30 via-blue-400/20 to-indigo-400/30",
    accent: "text-sky-100",
    description: "Para os jovens leitores",
  },
  {
    slug: "tecnicos",
    label: "Técnicos / Acadêmicos",
    emoji: "🎓",
    gradient: "from-slate-500/30 via-zinc-500/20 to-stone-500/30",
    accent: "text-slate-100",
    description: "Programação, engenharia, vestibular e estudos",
  },
  {
    slug: "geral",
    label: "Geral",
    emoji: "📚",
    gradient: "from-primary/25 via-primary/10 to-primary/25",
    accent: "text-primary",
    description: "Variados e multitemáticos",
  },
];

const BY_SLUG: Record<ClubCategory, ClubCategoryMeta> = CLUB_CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.slug]: c }),
  {} as Record<ClubCategory, ClubCategoryMeta>,
);

export function getCategoryMeta(slug: string | null | undefined): ClubCategoryMeta {
  if (slug && (slug as ClubCategory) in BY_SLUG) return BY_SLUG[slug as ClubCategory];
  return BY_SLUG.geral;
}
