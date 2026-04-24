import type { SpotlightStep } from "@/components/onboarding/SpotlightTutorial";

/**
 * Tutoriais contextuais — disparados na primeira visita de cada página.
 * Cada `target` é um seletor CSS opcional. Sem alvo, o card vai ao centro.
 */
export const PAGE_TUTORIALS: Record<string, SpotlightStep[]> = {
  library: [
    {
      target: '[data-tour="library-filters"]',
      title: "Filtre sua estante",
      body: "Use os filtros para ver só livros, mangás ou quadrinhos, e separar por status (lendo, lidos, desejos).",
      placement: "bottom",
    },
    {
      target: '[data-tour="library-shelf"]',
      title: "Suas prateleiras",
      body: "Toque em qualquer livro pra ver detalhes, atualizar progresso ou marcar pra troca.",
      placement: "top",
    },
    {
      title: "Prontinho!",
      body: "Quanto mais livros você adicionar, melhores serão suas recomendações e conquistas.",
    },
  ],

  trades: [
    {
      target: '[data-tour="trades-tabs"]',
      title: "Suas trocas",
      body: "Aqui você vê matches automáticos, propostas recebidas/enviadas e o histórico.",
      placement: "bottom",
    },
    {
      title: "Como dar match",
      body: "Marque livros como 'disponível pra troca' na biblioteca e adicione livros à lista de desejos. A gente conecta vocês.",
    },
  ],

  clubs: [
    {
      target: '[data-tour="clubs-create"]',
      title: "Crie ou entre em clubes",
      body: "Clubes de leitura por gênero, autor, ou tema. Discuta livros sem spoilers acidentais.",
      placement: "bottom",
    },
    {
      title: "Categorias",
      body: "Explore por categoria — fantasia, romance, técnicos/acadêmicos, mangás e mais.",
    },
  ],

  feed: [
    {
      title: "Feed social",
      body: "Veja o que seus amigos estão lendo, marcando como desejo ou disponibilizando pra troca.",
    },
    {
      target: '[data-tour="feed-stories"]',
      title: "Stories de leitores",
      body: "Compartilhe um trecho ou citação rápida — desaparece em 24h.",
      placement: "bottom",
    },
  ],

  scanner: [
    {
      title: "Aponte o scanner",
      body: "Centralize o código de barras (ISBN) na moldura e segure firme. Reconhecemos automaticamente.",
    },
    {
      target: '[data-tour="scanner-batch"]',
      title: "Modo lote",
      body: "Vai escanear vários livros? Ative o modo lote pra adicionar tudo de uma vez.",
      placement: "top",
    },
  ],

  search: [
    {
      target: '[data-tour="search-input"]',
      title: "Busca inteligente",
      body: "Procure por título, autor, ISBN ou até mesmo capa. Priorizamos resultados em português brasileiro.",
      placement: "bottom",
    },
  ],

  progress: [
    {
      title: "Sua jornada",
      body: "XP, nível, conquistas, ligas semanais e desafios. Acompanhe sua evolução como leitor.",
    },
    {
      target: '[data-tour="progress-streak"]',
      title: "Streak diário",
      body: "Leia ao menos uma página por dia pra manter o streak. Tem freeze caso esqueça um dia.",
      placement: "bottom",
    },
  ],

  ranking: [
    {
      title: "Ranking semanal",
      body: "Compare seu XP com outros leitores. Toda segunda-feira o ranking reseta e ligas mudam.",
    },
  ],

  series: [
    {
      title: "Suas séries",
      body: "Acompanhe coleções completas, volumes faltantes e próximos lançamentos.",
    },
  ],

  goals: [
    {
      title: "Meta anual",
      body: "Defina quantos livros quer ler este ano. A gente acompanha e celebra cada marco.",
    },
  ],

  stats: [
    {
      title: "Suas estatísticas",
      body: "Páginas lidas, gêneros favoritos, autores mais lidos e ritmo de leitura.",
    },
  ],

  wishlist: [
    {
      title: "Lista de desejos",
      body: "Marque livros que quer ler. Avisamos quando alguém disponibilizar pra troca um deles.",
    },
  ],
};

export function getPageTutorial(key: string): SpotlightStep[] | null {
  return PAGE_TUTORIALS[key] || null;
}
