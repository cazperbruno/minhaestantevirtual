---
name: Shelf system architecture
description: Pipeline unificado de qualidade/diversidade + lazy mount + dedupe cross-shelf para todas as prateleiras do app
type: feature
---
Sistema de prateleiras refinado (2026-04):

**Pipeline central** — `src/lib/shelf-quality.ts`
- `bookQualityScore(book)` 0-100: capa (+35), PT-BR (+25), descrição, ano, páginas, editora, autor, categorias
- `rankByQuality(items, getBook, getBaseScore)`: respeita score original e usa quality como boost/tiebreaker
- `diversifyByAuthor(items, getBook, max=2)`: empurra autores repetidos pra baixo
- `pushNoCoverDown`: livros sem capa nunca no topo
- `refineShelf` = pipeline completo (usar em TODA prateleira de descoberta nova)

**SmartShelves** (`useSmartShelves`)
- Teto duro de 10 prateleiras (era ilimitado)
- Dedupe cross-shelf via `topUsed` Set: livros das prateleiras top-priority não reaparecem em gênero/autor/década/lançamentos/clássicos
- Top genres: 3 (era 5), threshold 4 itens (era 3)
- Top authors: 2 (era 4)
- Apenas 1 prateleira de tipo (era todos)
- Removidas: editora, idioma, livros curtos, livros longos, década (eram ruído)
- "Porque você leu X" exige ≥4 candidatos (era 3)

**CinematicShelf** — chip de contagem no header, scroll horizontal persistido em `sessionStorage` por `shelfId`, suporte a teclado ←/→, ARIA region/label

**Lazy mount** — `LazyShelf` + `useInView` (rootMargin 400px). FollowingReads e Discovery na Library só montam ao chegar perto da viewport — economiza 2 RPCs no carregamento inicial.

**Hooks de descoberta** (`useDiscoveryShelf`, `useFollowingReads`, `useBecauseYouRead`, `BookSuggestions`) agora pedem 2x do limite e aplicam `refineShelf` antes de fatiar.
