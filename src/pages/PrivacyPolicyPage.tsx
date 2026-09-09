import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";

const UPDATED_AT = "8 de setembro de 2026";

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground px-5 py-8 sm:px-8">
      <article className="mx-auto max-w-3xl">
        <Link to="/auth" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>

        <header className="mt-8 mb-10">
          <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Política de Privacidade</h1>
          <p className="mt-3 text-sm text-muted-foreground">Última atualização: {UPDATED_AT}</p>
        </header>

        <div className="space-y-9 text-[15px] leading-7 text-muted-foreground">
          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">1. Escopo</h2>
            <p className="mt-2">
              Esta política descreve como o Readify trata dados pessoais necessários para autenticação, biblioteca de leitura,
              recursos sociais, gamificação, scanner, notificações e segurança do serviço. Ela se aplica ao aplicativo web/PWA e
              às futuras distribuições móveis do Readify que utilizem a mesma conta e backend.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">2. Dados que tratamos</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li><strong className="text-foreground">Conta:</strong> identificador da conta, e-mail, nome de exibição, nome de usuário e avatar quando fornecidos.</li>
              <li><strong className="text-foreground">Leitura:</strong> livros da biblioteca, lista de desejos, avaliações, progresso, metas, empréstimos, séries, notas privadas e histórico relacionado.</li>
              <li><strong className="text-foreground">Comunidade:</strong> reviews, comentários, curtidas, seguidores, clubes, mensagens, reações, stories, buddy reads, convites, trocas e ofertas iniciadas pelo usuário.</li>
              <li><strong className="text-foreground">Gamificação:</strong> XP, nível, streak, desafios, conquistas e eventos que comprovam essas recompensas.</li>
              <li><strong className="text-foreground">Notificações:</strong> notificações in-app e, quando autorizadas, dados técnicos da inscrição Web Push necessários para entregar notificações ao dispositivo.</li>
              <li><strong className="text-foreground">Uso e segurança:</strong> eventos técnicos e de produto, informações de sessão e registros necessários para diagnóstico, prevenção de abuso e segurança.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">3. Câmera e scanner</h2>
            <p className="mt-2">
              A câmera é solicitada somente quando o usuário utiliza recursos de scanner. A leitura de código de barras pode ser
              processada no dispositivo. Quando o usuário escolhe reconhecimento de capa ou página, a imagem selecionada/capturada
              pode ser enviada ao backend para identificação do livro. O Readify não usa a permissão de câmera para monitoramento em
              segundo plano.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">4. Finalidades</h2>
            <p className="mt-2">
              Usamos os dados para autenticar a conta, manter a biblioteca, sincronizar dispositivos, personalizar recomendações,
              operar recursos sociais e de gamificação, entregar notificações solicitadas, prevenir fraude/abuso, diagnosticar falhas
              e atender solicitações de privacidade. Não usamos uma identificação fornecida pelo usuário para conceder privilégios
              administrativos sem validação no servidor.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">5. Prestadores e dados externos</h2>
            <p className="mt-2">
              O Readify pode utilizar provedores de infraestrutura, autenticação, banco de dados, entrega de notificações, catálogos
              bibliográficos e processamento de reconhecimento/IA estritamente para prestar as funcionalidades solicitadas. Dados de
              catálogo de livros também podem vir de fontes públicas ou licenciadas de terceiros. O Readify não foi projetado para
              vender dados pessoais de usuários a anunciantes.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">6. Conteúdo público e privado</h2>
            <p className="mt-2">
              Alguns recursos permitem tornar biblioteca, perfil, reviews ou atividades visíveis a outros leitores. Notas privadas,
              credenciais de autenticação e chaves técnicas de push não são tratadas como conteúdo público. Configurações de
              privacidade devem ser respeitadas pelo servidor e não apenas pela interface do aplicativo.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">7. Segurança</h2>
            <p className="mt-2">
              O Readify aplica autenticação, controle de acesso no banco, segregação entre usuários, validação de operações
              privilegiadas e restrições de escrita para reduzir acesso indevido. Nenhum sistema conectado à internet pode garantir
              risco zero; controles e dependências são revistos continuamente.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">8. Retenção, exportação e exclusão</h2>
            <p className="mt-2">
              Os dados ativos são mantidos enquanto forem necessários para a conta e as funcionalidades utilizadas. O usuário pode
              solicitar uma exportação de seus dados e excluir a conta pelo próprio aplicativo. A exclusão remove os dados associados
              do banco ativo e encerra a conta; recursos compartilhados não devem ser apagados de forma a destruir dados pertencentes
              a terceiros. Cópias técnicas de infraestrutura, quando existentes, seguem os ciclos de retenção dos respectivos
              provedores e não são utilizadas como base ativa do produto.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">9. Direitos do titular</h2>
            <p className="mt-2">
              Conforme a legislação aplicável, incluindo a LGPD, o usuário pode solicitar confirmação de tratamento, acesso,
              correção, portabilidade, informação sobre compartilhamentos, revogação de consentimento quando aplicável e eliminação
              de dados nos limites legais. Os controles de exportação e exclusão ficam disponíveis nas configurações da conta.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">10. Alterações e contato</h2>
            <p className="mt-2">
              Esta política pode ser atualizada quando funcionalidades, fornecedores ou obrigações legais mudarem. Antes da publicação
              comercial na Google Play, esta página receberá o canal oficial de contato do responsável pelo Readify e a revisão final
              das informações exigidas pela loja.
            </p>
          </section>
        </div>

        <footer className="mt-12 border-t border-border/60 pt-6 text-sm text-muted-foreground">
          <Link to="/termos" className="text-primary hover:underline">Ver Termos de Uso</Link>
        </footer>
      </article>
    </main>
  );
}
