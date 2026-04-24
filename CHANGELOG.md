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

### Corrigido
- **Linter Supabase**: `pg_trgm` movido de schema `public` para `extensions` (zero warnings agora)
- **Função `is_epic_saturday`**: search_path explícito (`SET search_path = public`)

### Performance
- **ZXing lazy load**: scanner carrega `@zxing/browser` e `@zxing/library` dinamicamente. Bundle inicial -115KB gzip.

### Segurança
- **HIBP password check**: ativado no Supabase Auth (rejeita senhas vazadas conhecidas)
- **CSP restritivo**: defesa adicional contra XSS injetado

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
