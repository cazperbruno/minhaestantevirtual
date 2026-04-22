---
name: Tutorial cinemático de boas-vindas
description: WelcomeTutorial full-screen abre no primeiro login (profiles.tutorial_completed_at == null) e pode ser reaberto via openTutorial() event bus.
type: feature
---
- Componente: `src/components/onboarding/WelcomeTutorial.tsx` — 6 telas full-screen, gradientes via tokens, swipe mobile, dots, atalhos de teclado.
- Hook: `src/hooks/useTutorial.ts` — verifica `profiles.tutorial_completed_at`. Marca conclusão no banco. Sessão atual: `sessionStorage["tutorial_dismissed_session"]` evita reabrir após Skip.
- Event bus: `openTutorial()` dispara `CustomEvent("tutorial:open")`. AppShell escuta e mostra. Use de qualquer página.
- Mount global: `AppShell` (uma única instância).
- Reabrir: botão em `SettingsPage` chama `openTutorial()`.
- Migration: coluna `tutorial_completed_at timestamptz` em `public.profiles`.
