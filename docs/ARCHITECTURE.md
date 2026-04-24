# 🏗 Arquitetura do Readify

> Documento vivo. Atualize sempre que a arquitetura evoluir significativamente.

## Visão geral

Readify é uma **PWA single-page** (React + Vite) servida estaticamente, com um backend totalmente serverless via **Lovable Cloud** (Supabase gerenciado). Não há servidor Node próprio — toda lógica de servidor roda em **Postgres (RLS, triggers, funções)** e **Edge Functions (Deno)**.

```
┌──────────────────────────────────────────────────────────────┐
│                       Browser (PWA)                          │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────┐        │
│  │  React UI  │→ │ TanStack Q │→ │ Supabase Client  │        │
│  └────────────┘  └────────────┘  └────────┬─────────┘        │
│         ▲              ▲                  │                  │
│         │              │ Realtime         │                  │
│         │              │ invalidation     │                  │
│         │       ┌──────┴────────┐         │                  │
│         │       │ Service Worker │        │                  │
│         │       │  (Workbox)     │        │                  │
│         │       └────────────────┘        │                  │
└─────────┼───────────────────────────────────────┬─────────────┘
          │                                       │
   Push notifications                       HTTPS / WSS
          │                                       │
          ▼                                       ▼
┌──────────────────────┐         ┌──────────────────────────────┐
│   Lovable Cloud (Supabase)                                    │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Postgres + RLS + Realtime                              │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐ │  │
│  │  │  books   │ │ user_books│ │ activities│ │ club_messages│ │  │
│  │  └────┬─────┘ └──────────┘ └──────────┘ └─────────────┘ │  │
│  │       │                                                 │  │
│  │       ▼ pg_net (HTTP)                                   │  │
│  │  ┌──────────────────────────────────────────────────┐   │  │
│  │  │  Cron jobs (pg_cron):                            │   │  │
│  │  │  • drain enrichment_queue (cada 1min)            │   │  │
│  │  │  • drain normalization_queue                     │   │  │
│  │  │  • notify-streak-risk (diário)                   │   │  │
│  │  │  • notify-league-finale (semanal)                │   │  │
│  │  └──────────┬───────────────────────────────────────┘   │  │
│  └─────────────┼─────────────────────────────────────────┘    │
│                ▼                                              │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Edge Functions (Deno)                                  │  │
│  │  • Catálogo:  search-books, lookup-isbn, enrich-book    │  │
│  │  • IA:        recognize-cover, recognize-page,          │  │
│  │               recommend-feed, book-chat, classify-clubs │  │
│  │  • Manutenção: consolidate-series, fix-book-covers,     │  │
│  │                merge-duplicate-books, clean-database    │  │
│  │  • Push:       send-push                                │  │
│  │  • Admin:      admin-csrf-token, admin-user-action      │  │
│  └─────────────┬───────────────────────────────────────────┘  │
└────────────────┼──────────────────────────────────────────────┘
                 │
                 ▼ Outbound HTTP
       ┌────────────────────────────────────────────────┐
       │  APIs externas                                 │
       │  • Google Books      • Open Library            │
       │  • AniList           • Lovable AI Gateway      │
       │  • iTunes/Wikimedia  • Web Push (VAPID)        │
       └────────────────────────────────────────────────┘
```

---

## Camadas

### 1. UI (`src/pages`, `src/components`)

- **Páginas** (`src/pages/`) são *route components* finos. Toda lógica fica em hooks.
- **Componentes apresentacionais** (`src/components/`) recebem props e disparam callbacks. Não falam com Supabase diretamente.
- **Design system**: tokens semânticos em `src/index.css` + `tailwind.config.ts`. Nenhuma cor crua nos componentes.
- **Padrão de prateleiras**: toda lista horizontal usa `CinematicShelf` + `ShelfItem`. Nunca recriamos scroll cru.

### 2. Estado e cache (`src/hooks`)

- **TanStack Query** é a fonte de verdade do cache cliente.
- **Regra:** 1 hook = 1 query. `useLibrary`, `useBookDetail`, `useFeed` etc.
- **Realtime invalidation** (`useRealtimeInvalidation`): assina canais Postgres Changes e chama `queryClient.invalidateQueries` quando dados mudam.
- **Cross-tab sync**: BroadcastChannel propaga invalidações entre abas abertas.
- **Stale-while-revalidate**: UI mostra cache imediatamente, refetch em background.

### 3. Helpers puros (`src/lib`)

Funções sem side-effects, totalmente testáveis com Vitest:
- `dedupe.ts` — deduplicação por ISBN/UUID
- `series-normalize.ts` — normalização de títulos para agrupar volumes
- `xp.ts` — cálculo de XP, níveis, streak
- `track.ts` — telemetria fire-and-forget para `app_events`
- `import-book.ts` — pipeline de importação de livro externo
- `gamification.ts` — regras de conquistas

### 4. Backend (`supabase/`)

- **Migrations** (`supabase/migrations/`): toda mudança de schema versionada. **Nunca editar diretamente** — geradas pela UI.
- **RLS** habilitado em **todas** as tabelas com dados de usuário. Roles em tabela separada (`user_roles`) com função `has_role()` SECURITY DEFINER (previne escalation recursiva).
- **Edge Functions** (`supabase/functions/`): código Deno, deploy automático. Compartilham helpers em `_shared/` (ex.: `admin-guard.ts`, `automation-runs.ts`).
- **Cron**: agendado via `pg_cron`, dispara edge functions via `pg_net` (HTTP).

---

## Fluxos críticos

### Fluxo: adicionar livro por ISBN

```
1. Usuário digita ISBN → ScannerPage
2. Cliente chama edge function `lookup-isbn`
3. Edge function:
   a. Procura no Postgres (busca trigram)
   b. Se não encontrou: consulta Google Books → Open Library → AniList
   c. Insere o livro na tabela `books`
   d. Enfileira em `enrichment_queue` para completar metadados
   e. Retorna o livro pro cliente
4. Cliente adiciona em `user_books`
5. Trigger `app_events` registra `book_added`
6. Cron drena `enrichment_queue` em background, completa cover/sinopse via IA
7. Realtime invalida cache → biblioteca atualiza sem refresh
```

### Fluxo: chat de clube

```
1. Usuário escreve mensagem → INSERT em `club_messages`
2. RLS valida que usuário é membro do clube
3. Trigger insere registro em `activities` (kind='club_message')
4. Realtime publica em todos os clientes inscritos no canal do clube
5. `useClubMessages` recebe via subscription, atualiza UI sem fetch
6. `useTypingIndicator` usa Presence API do Realtime (não toca o banco)
```

### Fluxo: ranking semanal

```
1. Cron 'notify-league-finale' roda no fim da semana
2. Edge function calcula XP da semana por usuário
3. Promove/rebaixa usuários entre ligas (Bronze → Prata → ... → Diamante)
4. Insere notificações em `notifications`
5. Cliente recebe push via Web Push (send-push edge function)
```

---

## Segurança

### Camadas de defesa

| Camada | Mecanismo | Onde |
|---|---|---|
| Network | HTTPS + HSTS | Lovable Cloud |
| Browser | CSP + X-Content-Type-Options | `index.html` |
| App | JWT + auth state | `useAuth` |
| Banco | RLS por linha | Migrations |
| Roles | `has_role()` SECURITY DEFINER | Função SQL |
| Admin | 4-camadas anti-CSRF | `admin-guard.ts` |
| Senhas | HIBP check | Supabase Auth |
| Tokens admin | SHA-256 + timing-safe + TTL | `admin_csrf_tokens` |
| Auditoria | `book_audit_log`, `admin_audit_log` | Edge functions |

### Anti-CSRF do painel admin

Toda edge function admin valida 4 condições antes de executar:
1. **JWT válido** no header `Authorization`
2. **Role admin** via RPC `has_role()`
3. **Origin/Referer** em lista de origens confiáveis (`*.lovable.app`, `localhost`)
4. **Token CSRF** no header `X-CSRF-Token`, hash SHA-256 batendo com `admin_csrf_tokens`, dentro do TTL

Service role (chamadas server-to-server de cron) ignora 3 e 4.

---

## Performance

- **Lazy loading** de rotas (`React.lazy` + `Suspense`)
- **Manual chunks** no Vite: vendor splitting (react, query, supabase, pdf, scanner, radix)
- **ZXing** carregado dinamicamente só quando câmera abre (~115KB economizado no bundle inicial)
- **Capas pré-carregadas** com `<link rel="preload">` para LCP rápido
- **Service Worker** com cache estratégico:
  - HTML: NetworkFirst (timeout 3s)
  - JS/CSS: StaleWhileRevalidate
  - Capas: CacheFirst (60 dias)
  - API Supabase: NetworkFirst (timeout 5s)

---

## Convenções de código

- **TypeScript estrito**: `noImplicitAny`, sem `any` desnecessário
- **Nomes em PT-BR** para código orientado a usuário (mensagens, labels)
- **Nomes em EN** para tipos, hooks, utilitários
- **Sem comentários óbvios**. Comentários explicam *por quê*, não *o quê*.
- **JSDoc** em hooks/funções públicas com lógica não-trivial
- **Testes** em `src/**/*.test.ts(x)` colados ao arquivo testado

---

## Referências cruzadas

- [Edge Functions](./edge-functions.md) — índice de todas as funções
- [Changelog](../CHANGELOG.md) — histórico de mudanças
- [README](../README.md) — overview e setup
