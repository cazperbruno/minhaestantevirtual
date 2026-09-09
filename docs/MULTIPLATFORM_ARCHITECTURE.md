# Readify — Arquitetura Multiplataforma

Status: arquitetura normativa de reativação

## Alvos oficiais

O Readify mantém uma única base de produto e três alvos de execução:

1. Web/PWA
2. Android (Google Play)
3. iOS/iPadOS (App Store/TestFlight)

A aplicação React/TypeScript, regras de produto, validações, modelos e backend Supabase são compartilhados. Diferenças de sistema operacional ficam isoladas em `src/platform/`.

## Regra principal

Componentes, páginas e hooks de domínio não devem importar plugins Capacitor diretamente.

Acesso a recursos dependentes da plataforma deve ocorrer através de adaptadores:

- `platform/runtime` — detecção de Web/Android/iOS e capabilities;
- `platform/auth` — OAuth, deep links e retorno de autenticação;
- `platform/push` — Web Push no PWA, FCM/APNs nos containers nativos;
- `platform/scanner` — câmera/scanner web ou scanner nativo;
- `platform/share` — Web Share ou share sheet nativa;
- `platform/storage` — preferências locais isoladas por usuário;
- `platform/files` — exportações/downloads/arquivos;
- `platform/links` — deep links, universal links e app links.

## Segurança

- Nunca armazenar `service_role`, chaves privadas, APNs private key ou FCM server credentials no bundle do app.
- O cliente não escolhe destinatário/conteúdo de notificações privilegiadas.
- O cliente não concede XP nem altera dados globais do catálogo.
- Tokens locais devem ser armazenados apenas pelas bibliotecas de autenticação suportadas e nunca logados.
- Links recebidos do sistema operacional devem ser allowlisted antes de virar navegação interna.
- Dados privados de API autenticada não entram em Service Worker cache genérico.

## Web/PWA

- Um único Service Worker para precache, offline público e Web Push.
- Nenhum cache genérico de respostas autenticadas Supabase.
- Offline mutations isoladas por `user_id` e removidas apenas após confirmação do servidor.

## Android

- Distribuição final em Android App Bundle (AAB).
- Play App Signing.
- Target SDK conforme requisito vigente do Google Play.
- Deep links através de Android App Links quando houver domínio definitivo.
- Push nativo através de FCM/Capacitor Push Notifications.
- Scanner nativo para ISBN/códigos de barras; câmera nativa para captura de capa/página quando aplicável.
- Permissões solicitadas no momento da ação, com explicação contextual.

## iOS/iPadOS

- Distribuição por TestFlight e App Store.
- Universal Links quando houver domínio definitivo; scheme `readify://` apenas como fallback/controlado.
- Push nativo através de APNs via adapter Capacitor.
- Sign in with Apple quando os provedores sociais estiverem habilitados no app publicado.
- `PrivacyInfo.xcprivacy` e Usage Descriptions auditados contra o código realmente utilizado.
- Permissões de câmera/fotos solicitadas somente quando o usuário inicia uma ação que precisa delas.

## Autenticação

A identidade Readify é única entre plataformas. O mesmo usuário pode entrar no PWA, Android e iOS e acessar os mesmos dados.

OAuth nativo deve usar browser seguro + deep-link callback. Não usar WebView embutida para capturar senha de Google/Apple.

O callback nativo reservado é `readify://auth/callback` até que Universal Links/App Links com domínio próprio sejam ativados.

## Notificações

O backend é a fonte de verdade para a notificação. O cliente solicita ações; o servidor determina destinatário, título, corpo e link.

Transportes:

- Web/PWA: Web Push/VAPID;
- Android: FCM;
- iOS: APNs.

Todos convergem para o mesmo modelo lógico de `notifications` no Supabase.

## Scanner

O domínio do scanner não depende do mecanismo de câmera.

Fluxo lógico compartilhado:

1. obter código/imagem;
2. normalizar ISBN/código;
3. consultar catálogo;
4. confirmar livro;
5. persistir ação;
6. somente após sucesso do servidor mostrar confirmação/XP.

A captura pode ser web ou nativa sem duplicar as etapas 2–6.

## Navegação e links

Rotas internas continuam React Router. O adaptador de links converte:

- URL web do Readify;
- Android App Link;
- iOS Universal Link;
- `readify://...` controlado;

em uma rota interna allowlisted.

## CI obrigatório

PRs devem validar:

- lint;
- testes unitários;
- build de produção/PWA;
- smoke E2E desktop Chromium;
- smoke E2E Android-class Chromium;
- smoke E2E iOS-class WebKit;
- trust-boundary tests de segurança.

Quando os projetos nativos forem gerados, adicionar também:

- Android Gradle build / lint;
- iOS Xcode build em runner macOS;
- verificação de permissões e manifests;
- smoke do container Capacitor.

## Identificadores e publicação

O `appId` atual é provisório e não deve chegar à primeira publicação em loja. Antes do primeiro build de distribuição será escolhido o package/bundle ID definitivo e estável. Depois da publicação, ele deve ser tratado como imutável.

## Princípio de evolução

Implementar primeiro no domínio compartilhado. Criar divergência por plataforma somente quando a API do sistema operacional realmente exigir. Se Android e iOS precisarem de comportamentos diferentes, ambos devem implementar o mesmo contrato TypeScript exposto ao restante do Readify.
