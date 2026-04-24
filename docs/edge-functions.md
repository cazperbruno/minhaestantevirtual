# 📡 Edge Functions — índice

> Todas as funções vivem em `supabase/functions/` e fazem deploy automático ao salvar.

## Convenções

- **Auth**: `public` (sem JWT), `user` (JWT obrigatório), `admin` (JWT + role + CSRF), `service` (cron interno via service_role)
- **Idempotente**: `✅` se chamadas repetidas têm o mesmo efeito que uma única
- Funções compartilham helpers em `supabase/functions/_shared/`

---

## 📚 Catálogo de livros

| Função | Auth | Idempotente | O que faz |
|---|---|---|---|
| `search-books` | public | ✅ | Busca livros no banco local (trigram) + fallback em Google Books/Open Library/AniList |
| `lookup-isbn` | public | ✅ | Resolve ISBN para livro completo. Insere no banco se não existir, enfileira enriquecimento |
| `enrich-book` | service | ✅ | Completa campos faltantes de um livro via APIs externas + IA |
| `process-enrichment-queue` | service | ✅ | Drena `enrichment_queue` em batch (cron 1min) |
| `process-normalization-queue` | service | ✅ | Drena `metadata_normalization_queue` (cron 1min) |
| `normalize-book-meta` | service | ✅ | Normaliza title/authors/series via Lovable AI |
| `consolidate-series` | service | ✅ | Agrupa livros em séries por título normalizado |
| `enrich-series` | service | ✅ | Completa metadados de uma série (cover, total_volumes, autor canônico) |
| `backfill-series` | admin | ❌ | Roda consolidate-series em batch sobre todo o banco |
| `merge-duplicate-books` | admin | ❌ | Funde dois livros duplicados (preserva user_books, activities) |
| `validate-isbns` | admin | ✅ | Audita ISBNs malformados no banco |
| `clean-book-database` | admin | ❌ | Remove livros órfãos, fix encoding, normaliza arrays |
| `seed-book-database` | admin | ❌ | Importa lote de ISBNs via planilha |
| `import-books-by-isbn` | admin | ✅ | Importa N livros via lista de ISBNs |
| `refresh-book` | user | ✅ | Force refresh de metadados de um livro |

## 🤖 IA / reconhecimento

| Função | Auth | Idempotente | O que faz |
|---|---|---|---|
| `recognize-cover` | user | ✅ | Identifica livro a partir de foto da capa (Gemini Vision) |
| `recognize-page` | user | ✅ | Identifica livro a partir de foto de página interna |
| `cover-search` | user | ✅ | Busca capas alternativas para um livro |
| `fix-book-covers` | admin | ✅ | Tenta substituir capas quebradas/ruins (cron diário) |
| `book-chat` | user | ❌ | Chat com IA sobre o livro (atualmente oculto da UI) |
| `generate-synopsis` | service | ✅ | Gera sinopse via Lovable AI quando faltante |
| `recommend-books` | user | ✅ | Recomendações personalizadas baseadas em biblioteca |
| `recommend-feed` | user | ✅ | Sugestões para o feed inicial |
| `anilist-search` | public | ✅ | Wrapper sobre AniList GraphQL para mangás |
| `classify-clubs` | admin | ✅ | Classifica clubes em categorias via IA |
| `generate-challenges` | admin | ✅ | Gera desafios sazonais |

## 👥 Social / clubes

| Função | Auth | Idempotente | O que faz |
|---|---|---|---|
| `club-report-pdf` | user | ✅ | Gera relatório PDF de um clube (jspdf isolado aqui) |
| `send-push` | service | ✅ | Envia Web Push para subscriptions VAPID |
| `notify-streak-risk` | service | ✅ | Notifica usuários com streak em risco (cron diário) |
| `notify-league-finale` | service | ✅ | Promove/rebaixa ligas e notifica (cron semanal) |

## 🛡 Admin

| Função | Auth | Idempotente | O que faz |
|---|---|---|---|
| `admin-csrf-token` | admin (JWT+role) | ✅ | Emite token CSRF rotacionado para o painel admin |
| `admin-user-action` | admin | ❌ | Ações administrativas sobre usuários (ban, role, delete) |

---

## Padrões transversais

### CORS

Todas as funções definem CORS no topo:
```ts
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-csrf-token",
};
```

### Tratamento de erros

```ts
try {
  // ...
  return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
} catch (e) {
  console.error("[fn-name] error:", e);
  return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
}
```

### Telemetria

Funções importantes registram em `automation_runs` via helper `_shared/automation-runs.ts`:
```ts
const runId = await startRun(sb, { job_type: "enrich-book", source: "edge" });
try {
  // ...
  await finishRun(sb, runId, { status: "ok", result });
} catch (e) {
  await finishRun(sb, runId, { status: "error", error: String(e) });
  throw e;
}
```

### Auth de cron drainers

`process-*-queue` aceita tanto service_role quanto chamadas internas com header `x-cron-source: readify-internal`. Validação em `_shared/admin-guard.ts → requireAdminOrCron()`.

---

## Como adicionar uma nova função

1. Criar diretório `supabase/functions/<nome>/index.ts`
2. Se admin: importar `requireAdmin` de `_shared/admin-guard.ts` no topo
3. Se precisa segredo (API key externa): adicionar via UI do Lovable Cloud, **nunca commitar**
4. Adicionar entrada nesta tabela
5. Se for chamada do cliente: criar wrapper em `src/lib/<nome>.ts` que invoca `supabase.functions.invoke()`

Deploy é automático ao salvar — não há comando manual.
