# Testes E2E (Playwright)

Testes end-to-end que abrem um navegador real e simulam o usuário.
Complementam os testes unitários (`bun run test`) cobrindo fluxos críticos.

## Setup (uma vez)

```bash
bun add -D @playwright/test
bunx playwright install chromium
```

## Variáveis de ambiente

Crie `.env.test` (ou exporte no shell):

```bash
E2E_BASE_URL=http://localhost:5173      # ou https://readifybook.lovable.app
E2E_TEST_EMAIL=teste@readify.dev
E2E_TEST_PASSWORD=SenhaForte123!
```

> ⚠️ Crie um usuário **dedicado para testes** em `/auth`. Não use sua conta real.

## Rodando

```bash
bun run dev                          # terminal 1: app rodando
bunx playwright test                 # terminal 2: roda todos
bunx playwright test --ui            # modo interativo (vê o browser)
bunx playwright test auth            # filtra por nome
bunx playwright show-report          # abre relatório HTML
```

## Estrutura

- `auth.spec.ts` — login, logout, signup
- `library.spec.ts` — adicionar livro, mudar status
- `club.spec.ts` — entrar em clube, mandar mensagem

## CI (opcional)

Veja `.github/workflows/e2e.yml`. Habilita rodar em PR/push.
Configure os secrets `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`,
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Limitações conhecidas

- Não roda no preview do Lovable (precisa de runtime Node + browser)
- Push notifications não testáveis em headless
- Câmera (scanner ISBN) precisa flag `--use-fake-device-for-media-stream`
