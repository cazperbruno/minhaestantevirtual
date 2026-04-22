/**
 * Normalização de categorias de livros para PT-BR.
 *
 * O catálogo agrega dados de Google Books, Open Library, Amazon, etc., que
 * misturam idiomas e granularidades — "Fiction", "Comics & Graphic Novels",
 * "Juvenile Fiction"... Isso polui qualquer filtro/agrupamento.
 *
 * Estratégia:
 *  - Apply mapeia tanto traduções diretas (Fiction → Ficção) quanto sinônimos
 *    (Sci-Fi / Science Fiction / Ficção Científica → Ficção científica)
 *  - Caso a categoria não esteja no dicionário, fazemos uma normalização leve
 *    (trim, lower-case primeiro, capitaliza só a primeira letra) para manter
 *    em PT-BR consistente sem inventar tradução errada.
 *
 * IMPORTANTE: nunca tocamos no dado original do livro. Só na exibição.
 */

const RAW_MAP: Record<string, string> = {
  // Ficção / não-ficção genéricas
  "fiction": "Ficção",
  "non-fiction": "Não-ficção",
  "nonfiction": "Não-ficção",
  "non fiction": "Não-ficção",
  "literature": "Literatura",
  "literary collections": "Literatura",
  "literary criticism": "Crítica literária",

  // Sci-fi / Fantasia / Aventura
  "science fiction": "Ficção científica",
  "sci-fi": "Ficção científica",
  "scifi": "Ficção científica",
  "ficção científica": "Ficção científica",
  "ficcao cientifica": "Ficção científica",
  "fantasy": "Fantasia",
  "fantasia": "Fantasia",
  "high fantasy": "Fantasia",
  "epic fantasy": "Fantasia",
  "urban fantasy": "Fantasia",
  "adventure": "Aventura",
  "adventures": "Aventura",
  "action & adventure": "Aventura",
  "dystopian": "Distopia",
  "dystopia": "Distopia",

  // Romance / drama
  "romance": "Romance",
  "romance fiction": "Romance",
  "love stories": "Romance",
  "drama": "Drama",
  "dramatic": "Drama",

  // Mistério / terror
  "mystery": "Mistério",
  "mystery & detective": "Mistério",
  "detective": "Mistério",
  "thriller": "Thriller",
  "thrillers": "Thriller",
  "suspense": "Suspense",
  "horror": "Terror",
  "terror": "Terror",
  "supernatural": "Sobrenatural",

  // Quadrinhos / mangás
  "comics & graphic novels": "Quadrinhos",
  "comics and graphic novels": "Quadrinhos",
  "comics": "Quadrinhos",
  "graphic novels": "Quadrinhos",
  "graphic novel": "Quadrinhos",
  "hq": "Quadrinhos",
  "manga": "Mangá",
  "mangás": "Mangá",
  "mangas": "Mangá",
  "manhwa": "Mangá",
  "manhua": "Mangá",
  "shonen": "Mangá",
  "shōnen": "Mangá",
  "seinen": "Mangá",
  "shoujo": "Mangá",

  // Infantil / juvenil
  "juvenile fiction": "Infantojuvenil",
  "juvenile nonfiction": "Infantojuvenil",
  "young adult fiction": "Jovem adulto",
  "young adult nonfiction": "Jovem adulto",
  "young adult": "Jovem adulto",
  "children": "Infantil",
  "children's books": "Infantil",
  "kids": "Infantil",
  "infantil": "Infantil",
  "infantojuvenil": "Infantojuvenil",

  // História / biografia
  "history": "História",
  "world history": "História",
  "historical": "História",
  "historical fiction": "Ficção histórica",
  "biography": "Biografia",
  "biography & autobiography": "Biografia",
  "autobiography": "Biografia",
  "memoir": "Memórias",
  "memoirs": "Memórias",

  // Educação / técnicos
  "education": "Educação",
  "study aids": "Educação",
  "reference": "Referência",
  "language arts & disciplines": "Linguagem",
  "language": "Linguagem",
  "foreign language study": "Idiomas",
  "computers": "Tecnologia",
  "computers & internet": "Tecnologia",
  "technology & engineering": "Tecnologia",
  "tecnologia": "Tecnologia",
  "engineering": "Engenharia",
  "mathematics": "Matemática",
  "science": "Ciência",
  "medical": "Saúde",
  "health & fitness": "Saúde",
  "psychology": "Psicologia",
  "philosophy": "Filosofia",
  "religion": "Religião",
  "spirituality": "Espiritualidade",
  "self-help": "Autoajuda",
  "self help": "Autoajuda",
  "personal growth": "Autoajuda",
  "autoajuda": "Autoajuda",

  // Negócios / outros
  "business & economics": "Negócios",
  "business": "Negócios",
  "economics": "Economia",
  "finance": "Finanças",
  "law": "Direito",
  "political science": "Política",
  "politics": "Política",
  "social science": "Ciências sociais",

  // Arte / cultura
  "art": "Arte",
  "arts": "Arte",
  "music": "Música",
  "performing arts": "Artes cênicas",
  "photography": "Fotografia",
  "design": "Design",
  "architecture": "Arquitetura",
  "cooking": "Culinária",
  "cookbook": "Culinária",
  "travel": "Viagem",
  "sports & recreation": "Esportes",
  "sports": "Esportes",
  "games & activities": "Jogos",
  "humor": "Humor",
  "poetry": "Poesia",
  "short stories": "Contos",
  "essays": "Ensaios",
  "anthology": "Antologia",
  "antologia": "Antologia",
  "classics": "Clássicos",
  "clássicos": "Clássicos",
};

function key(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos para lookup
    .replace(/[\.\-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const NORMALIZED_MAP: Record<string, string> = Object.entries(RAW_MAP).reduce(
  (acc, [k, v]) => {
    acc[key(k)] = v;
    return acc;
  },
  {} as Record<string, string>,
);

/**
 * Retorna a categoria já em PT-BR (ou versão capitalizada se desconhecida).
 * Nunca retorna string vazia — fallback "Outros".
 */
export function localizeCategory(raw: string | null | undefined): string {
  if (!raw) return "Outros";
  const trimmed = raw.trim();
  if (!trimmed) return "Outros";
  const k = key(trimmed);

  // 1. Lookup direto
  if (NORMALIZED_MAP[k]) return NORMALIZED_MAP[k];

  // 2. Tenta o primeiro segmento antes de " / " (Google Books envia coisas como
  //    "Fiction / Science Fiction / General")
  if (trimmed.includes("/")) {
    const parts = trimmed.split("/").map((p) => p.trim()).filter(Boolean);
    for (const p of parts) {
      const pk = key(p);
      if (NORMALIZED_MAP[pk]) return NORMALIZED_MAP[pk];
    }
    // Fallback: primeira parte capitalizada
    return capitalize(parts[0]);
  }

  return capitalize(trimmed);
}

/**
 * Recebe a lista bruta de categorias do livro (potencialmente repetida em vários
 * idiomas) e retorna o conjunto único, já em PT-BR, ordenado.
 */
export function localizeCategories(list: (string | null | undefined)[] | null | undefined): string[] {
  if (!list) return [];
  const set = new Set<string>();
  for (const c of list) {
    const v = localizeCategory(c);
    if (v && v !== "Outros") set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function capitalize(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}
