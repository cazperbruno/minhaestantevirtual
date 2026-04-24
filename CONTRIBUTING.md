# Contribuindo para o Readify

Obrigado pelo interesse! Este guia descreve o fluxo de trabalho.

## 🚀 Setup local

```bash
bun install
bun run dev          # http://localhost:5173
```

Pré-requisitos: [Bun](https://bun.sh) ou Node 20+.

## 📐 Padrões de código

### Estrutura

- `src/pages/` — route components finos. Nada de business logic aqui.
- `src/components/` — componentes apresentacionais. Recebem props, disparam callbacks.
- `src/hooks/` — TanStack Query hooks. **Regra: 1 hook = 1 query.**
- `src/lib/` — funções puras, totalmente testáveis.
- `supabase/functions/` — edge functions Deno.

### Style

- **TypeScript estrito**. Sem `any` injustificado.
- **Tokens semânticos**: nunca usar cores cruas (`text-white`, `bg-black`). Sempre `text-foreground`, `bg-background`.
- **CinematicShelf** é a única abstração de scroll horizontal de livros.
- **dedupeByIsbn** em qualquer prateleira que possa conter livros repetidos.
- **trackEvent** para eventos críticos de produto.

### Commits

Seguimos [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: adiciona prateleira "leituras rápidas"
fix: corrige overflow horizontal na biblioteca mobile
docs: atualiza ARCHITECTURE.md com fluxo de buddy reads
refactor: extrai useShelfData de LibraryPage
test: adiciona cobertura para series-normalize edge cases
chore: bump dependências
```

## 🧪 Testes

```bash
bun run test                    # roda todos os testes
bun run test --coverage         # com relatório de cobertura
```

**Threshold mínimo**: 35% lines, 60% branches em `src/lib` e `src/hooks`.

Testes ficam ao lado do arquivo: `src/lib/dedupe.ts` ↔ `src/lib/dedupe.test.ts`.

## 🔒 Segurança

- **Nunca** colocar API keys ou segredos no código. Use o gerenciador de Secrets do Lovable Cloud.
- **Nunca** desabilitar RLS em uma tabela sem revisão.
- **Sempre** validar inputs em edge functions.
- Edge functions admin **devem** chamar `requireAdmin()` no topo.

## 🐛 Reportando bugs

Inclua:
1. O que você esperava
2. O que aconteceu
3. Passos para reproduzir
4. Screenshot/console log
5. Versão do app (rodapé do Settings)

## 📝 Pull Requests

1. Branch a partir de `main`
2. Commits pequenos e atômicos
3. Atualize `CHANGELOG.md` com sua mudança em `[Unreleased]`
4. Adicione testes se mudou lógica em `src/lib`
5. Rode `bun run lint && bun run test` antes de abrir o PR

## 📚 Documentação

Atualize sempre que aplicável:
- `docs/ARCHITECTURE.md` — mudanças estruturais
- `docs/edge-functions.md` — nova função, mudança de auth, descontinuação
- `CHANGELOG.md` — toda mudança visível ao usuário ou desenvolvedor
- `.lovable/memory/` — regras de negócio persistentes (consultadas pela IA)
