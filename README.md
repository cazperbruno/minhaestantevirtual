# 📚 Readify

> Rede social gamificada para leitores: catalogue sua biblioteca, escaneie ISBN/capa com IA, participe de clubes de leitura, e acompanhe seu progresso com XP, conquistas e ranking semanal.

[![CI](https://github.com/_/_/actions/workflows/ci.yml/badge.svg)](https://github.com/_/_/actions/workflows/ci.yml)
[![Stack](https://img.shields.io/badge/stack-React%2018%20%7C%20Vite%205%20%7C%20Tailwind-blue)](https://vitejs.dev)
[![Backend](https://img.shields.io/badge/backend-Lovable%20Cloud-purple)](https://docs.lovable.dev/features/cloud)

---

## ✨ O que faz

- **Biblioteca pessoal** com prateleiras inteligentes (lendo agora, próximos volumes de série, leituras rápidas, masterpieces 5★, etc.)
- **Scanner de ISBN** via câmera (ZXing) + reconhecimento de capa e página por IA (Gemini Vision)
- **Banco inteligente de livros** com auto-enriquecimento assíncrono via Google Books, Open Library, AniList
- **Consolidação automática de séries** com normalização de títulos e detecção de volumes
- **Clubes de leitura** com chat em tempo real, sprints de leitura, leaderboard, votação de livro do mês
- **Buddy reads** — leituras em dupla com chat, progresso compartilhado e sistema de spoilers por página
- **Gamificação completa**: XP, níveis, conquistas, streaks, freezes, ranking semanal por liga, surpresa diária
- **Feed social** com stories, reviews, recomendações, follow, curtidas e comentários
- **PWA instalável** com push notifications, offline queue e atalhos nativos
- **Painel admin** com 4 camadas de proteção anti-CSRF (JWT + role + Origin trust + token rotacionado)

---

## 🛠 Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 · Vite 5 · TypeScript 5 · Tailwind CSS · shadcn/ui |
| Estado/Cache | TanStack Query · Realtime cross-tab invalidation |
| Animação | Framer Motion · view transitions · confetti customizado |
| Backend | Lovable Cloud (Supabase) — Postgres + Realtime + Edge Functions + Storage |
| Auth | Email/senha + Google OAuth + HIBP password check |
| IA | Lovable AI Gateway (Gemini 2.5 Flash/Pro · GPT-5 Mini) — sem chave de API necessária |
| Mobile | Capacitor (build nativo opcional iOS/Android) |
| PWA | Service worker · Web Push · Offline queue |
| Testes | Vitest · Testing Library · CI no GitHub Actions |

---

## 🏗 Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                    React App (PWA)                          │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │   Pages     │  │  Components  │  │  Hooks (Query)   │    │
│  └─────────────┘  └──────────────┘  └────────┬─────────┘    │
│                                              │              │
│                              ┌───────────────┼──────────────┐
│                              │   Supabase Client (CSR)      │
│                              └───────┬───────┬──────────────┘
└──────────────────────────────────────┼───────┼──────────────┘
                                       │       │
                  ┌────────────────────┘       └──────────────┐
                  ▼                                            ▼
        ┌───────────────────┐                      ┌──────────────────────┐
        │  Postgres + RLS   │ ◄──── pg_net ──────► │   Edge Functions     │
        │  ─────────────    │                      │  ────────────────    │
        │  • books          │                      │  • lookup-isbn       │
        │  • user_books     │                      │  • enrich-book       │
        │  • activities     │                      │  • recognize-cover   │
        │  • clubs / chat   │                      │  • search-books      │
        │  • achievements   │                      │  • recommend-feed    │
        │  • app_events     │                      │  • club-report-pdf   │
        │  • enrichment_q   │                      │  • admin-* (CSRF)    │
        └─────────┬─────────┘                      └──────────┬───────────┘
                  │                                           │
                  │   ┌───────────────────────────────────────┘
                  ▼   ▼
        ┌───────────────────┐         ┌──────────────────────┐
        │  Cron / Triggers  │         │  External APIs       │
        │  ─────────────    │         │  ────────────────    │
        │  • drain queues   │         │  • Google Books      │
        │  • streak risk    │         │  • Open Library      │
        │  • weekly league  │         │  • AniList (manga)   │
        │  • surpresa box   │         │  • Lovable AI Gateway│
        └───────────────────┘         └──────────────────────┘
```

### Padrões-chave

- **CinematicShelf** é a única abstração de scroll horizontal de livros no app (todas as prateleiras a usam)
- **dedupeByIsbn** garante que o mesmo livro nunca apareça duas vezes na mesma prateleira
- **trackEvent** (`src/lib/track.ts`) fire-and-forget para telemetria em `app_events`
- **Auto-enriquecimento async** — livro novo entra na `enrichment_queue` e é completado por cron+IA sem bloquear UX
- **Anti-CSRF em 4 camadas** em toda edge function admin (`supabase/functions/_shared/admin-guard.ts`)

---

## 🚀 Setup local

### Pré-requisitos

- [Bun](https://bun.sh) (recomendado) ou Node 20+
- Acesso ao projeto Lovable (clone via GitHub integration)

### Rodar

```bash
bun install
bun run dev          # http://localhost:5173
```

### Comandos úteis

```bash
bun run dev           # Dev server com HMR
bun run build         # Build de produção
bun run preview       # Servir build localmente
bun run test          # Vitest em watch mode
bun run test:run      # Vitest single run (CI)
bun run lint          # ESLint
```

### Variáveis de ambiente

O `.env` é gerado automaticamente pelo Lovable Cloud e contém **somente chaves públicas**:

| Variável | Descrição |
|---|---|
| `VITE_SUPABASE_URL` | Endpoint público do Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon key (pública por design — vai no bundle) |
| `VITE_SUPABASE_PROJECT_ID` | ID do projeto |

> ⚠️ **A `service_role` key NUNCA está no `.env`.** Ela vive como secret nas Edge Functions e nunca toca o cliente.

---

## 🔒 Segurança

- **RLS** habilitado em todas as tabelas com dados de usuário
- **Roles** em tabela separada (`user_roles`) com função `has_role()` SECURITY DEFINER — previne escalation
- **CSRF** em 4 camadas no admin: JWT + role + Origin trust + token rotacionado (SHA-256, timing-safe compare)
- **Auditoria** em `book_audit_log` para ações administrativas
- **HIBP** password check ativado (rejeita senhas vazadas)
- **Service role** isolado nas edge functions, nunca exposto ao cliente

---

## 📂 Estrutura

```
src/
├── components/        # UI components (presentation only)
│   ├── ui/            # shadcn primitives
│   ├── books/         # CinematicShelf, BookCard, BookHero, ...
│   ├── clubs/         # ChatPanel, Sprint, Leaderboard, ...
│   ├── social/        # Feed, Stories, Reviews, ...
│   ├── gamification/  # XP burst, achievements, surprise box
│   └── layout/        # AppShell, BottomNav, Sidebar
├── hooks/             # TanStack Query hooks (1 hook = 1 query)
├── pages/             # Route components
├── lib/               # Pure helpers, API wrappers, utilities
├── integrations/
│   └── supabase/      # Auto-generated client + types (NÃO EDITAR)
└── types/             # Shared TypeScript types

supabase/
├── functions/         # Edge Functions (Deno)
│   └── _shared/       # Reusable: admin-guard, automation-runs, isbn-intelligence
├── migrations/        # Database migrations (NÃO EDITAR — geradas via UI)
└── config.toml        # Supabase config

.lovable/memory/       # Memórias persistentes do projeto (regras de negócio, padrões)
```

---

## 🧪 Testes

```bash
bun run test          # watch mode
bun run test:run      # CI mode
```

Cobertos:
- Lógica pura: `dedupe`, `series-normalize`, `amazon`, `profile-path`, `track`, `utils`
- Integração: invalidação de cache, realtime cross-tab, atividades sem duplicatas

---

## 🌐 Deploy

O projeto é deployado automaticamente pelo Lovable em:
- **Preview**: gerado em cada mudança
- **Produção**: [readifybook.lovable.app](https://readifybook.lovable.app)

GitHub sync é bidirecional — push pra main reflete na preview, mudanças no Lovable refletem no GitHub.

---

## 📜 Licença

Privado — todos os direitos reservados.
