---
name: PT-BR priority on book ingestion
description: Toda entrada de livros no banco (busca, ISBN, lote, seed, enrich) prioriza edições em português brasileiro
type: feature
---
Prioridade global PT-BR ao adicionar livros ao catálogo:

- `_shared/isbn-intelligence.ts`: novos helpers `langPriorityScore`, `hasPortugueseHints`, `rerankByPortuguese`, `shouldStopCascade`. `isPortuguese` aceita `pt`, `pt-BR`, `pt_BR`, `por`, `ptbr`.
- `search-books` (busca textual): chama OL `language=por` + Google `langRestrict=pt` em paralelo; só complementa com busca global quando vier <8 resultados; aplica `rerankByPortuguese` no final.
- `search-books` (cascade ISBN): já tinha early-stop em PT-BR ≥80 — mantido.
- `enrich-book`: tenta Google `langRestrict=pt` ANTES da busca global. Se descobrir publisher BR ou ≥3 acentos PT no texto, marca `language="pt"` automaticamente.
- `import-books-by-isbn`: já fazia early-stop em PT-BR (mantido).
- `seed-book-database`: lista PT expandida (12 subjects, era 4); modo `mixed` agora usa 3 subjects PT + 2 popular + 1 manga (50% PT, era 25%).

Sempre que possível adicionar uma fonte nova de livros, usar `rerankByPortuguese(list, computeQualityScore)` no resultado.
