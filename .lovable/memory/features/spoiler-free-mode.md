---
name: spoiler-free-mode
description: Toggle por clube de "modo sem spoiler" no chat — esconde TODA mensagem com spoiler_page até o usuário revelar individualmente. Persiste em localStorage por clube.
type: feature
---
# Modo sem spoiler no chat

- Hook: `src/hooks/useSpoilerFreeMode.ts` — persiste em `localStorage` chave `readify:spoiler-free:<clubId>`, sincroniza entre abas via `storage` event.
- `SpoilerWrapper` ganhou prop `forceHide?: boolean` que força o blur mesmo se o leitor já passou da página marcada.
- Toggle aparece no topo do chat de `ClubDetailPage` SOMENTE quando há mensagens com `spoiler_page > 0` (evita poluição visual).
- Mensagens próprias (`mine`) nunca são ocultadas, mesmo com modo ligado.
- Reveal manual continua sendo por mensagem (estado local do `SpoilerWrapper`).
