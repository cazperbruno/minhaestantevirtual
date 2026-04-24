# Changelog

Todas as mudanças notáveis deste projeto serão documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
e este projeto adota [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Adicionado
- **Documentação completa**: `docs/ARCHITECTURE.md`, `docs/edge-functions.md`, `CHANGELOG.md`, README reescrito
- **Coverage no CI**: vitest configurado com thresholds (35% lines, 60% branches) e relatórios v8
- **Content Security Policy**: meta tags CSP + X-Content-Type-Options + Permissions-Policy no `index.html`
- **Tabela `admin_audit_log`**: log expandido de ações administrativas sensíveis (login, role, ações destrutivas) com RLS de leitura só para admins
- **LGPD — portabilidade**: edge function `export-user-data` + botão "Exportar meus dados (JSON)" em /configuracoes
- **LGPD — eliminação**: edge function `delete-user-account` + diálogo "Excluir minha conta" com confirmação dupla
- **Sanitização XSS**: `src/lib/sanitize.ts` com DOMPurify (`sanitizeText`, `sanitizeRichText`, `safeExternalUrl`) aplicado em bio do perfil e conteúdo de resenhas
- **E2E tests (Playwright)**: `playwright.config.ts` + specs (`e2e/auth.spec.ts`, `library.spec.ts`, `club.spec.ts`) + workflow opcional `.github/workflows/e2e.yml` + `e2e/README.md` com instruções

### Corrigido
- **Linter Supabase**: `pg_trgm` movido de schema `public` para `extensions` (zero warnings agora)
- **Função `is_epic_saturday`**: search_path explícito (`SET search_path = public`)

### Performance
- **ZXing lazy load**: scanner carrega `@zxing/browser` e `@zxing/library` dinamicamente. Bundle inicial -115KB gzip.
- **Bundle visualizer**: `rollup-plugin-visualizer` gera `dist/stats.html` no build de produção

### Acessibilidade
- **Focus rings reforçados**: ring de 3px com 80% opacidade no Button (alto contraste em qualquer fundo)
- **Disabled states**: opacidade 60% + saturação reduzida (mantém contraste WCAG AA)

### Segurança
- **HIBP password check**: ativado no Supabase Auth (rejeita senhas vazadas conhecidas)
- **CSP restritivo**: defesa adicional contra XSS injetado
- **DOMPurify**: defesa em profundidade contra XSS armazenado em campos livres

---

## [0.1.0] — Lançamento inicial

### Funcionalidades base

- **Biblioteca pessoal** com prateleiras inteligentes (CinematicShelf padrão único)
- **Scanner ISBN** via câmera com ZXing
- **Reconhecimento de capa e página** por IA (Gemini Vision)
- **Auto-enriquecimento async** via Google Books, Open Library, AniList
- **Consolidação de séries** com normalização de títulos
- **Clubes de leitura** com chat realtime, sprints, leaderboard, votação
- **Buddy reads** com chat, progresso compartilhado e spoilers por página
- **Gamificação**: XP, níveis, conquistas, streaks, freezes, ligas semanais, surpresa diária
- **Feed social**: stories, reviews, recomendações, follow, likes, comentários
- **PWA instalável** com push notifications e offline queue
- **Painel admin** com 4 camadas anti-CSRF

### Stack
- React 18 · Vite 5 · TypeScript 5 · Tailwind · shadcn/ui
- TanStack Query · Framer Motion · Capacitor (mobile opcional)
- Lovable Cloud (Postgres + Realtime + Edge Functions + Storage)
- Lovable AI Gateway (Gemini 2.5 · GPT-5 Mini)

[Unreleased]: ../../compare/v0.1.0...HEAD
[0.1.0]: ../../releases/tag/v0.1.0
