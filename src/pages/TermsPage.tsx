import { Link } from "react-router-dom";
import { ArrowLeft, FileText } from "lucide-react";

const UPDATED_AT = "8 de setembro de 2026";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground px-5 py-8 sm:px-8">
      <article className="mx-auto max-w-3xl">
        <Link to="/auth" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>

        <header className="mt-8 mb-10">
          <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FileText className="h-5 w-5" />
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Termos de Uso</h1>
          <p className="mt-3 text-sm text-muted-foreground">Última atualização: {UPDATED_AT}</p>
        </header>

        <div className="space-y-9 text-[15px] leading-7 text-muted-foreground">
          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">1. Serviço</h2>
            <p className="mt-2">
              O Readify é uma plataforma para organizar leituras, descobrir livros, registrar progresso, participar de recursos
              sociais e utilizar ferramentas relacionadas à experiência de leitura. Funcionalidades podem evoluir ao longo do tempo,
              desde que alterações relevantes sejam comunicadas de forma adequada.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">2. Conta e segurança</h2>
            <p className="mt-2">
              O usuário é responsável por manter seguras as credenciais da conta e por informar dados verdadeiros quando necessários
              para o funcionamento do serviço. Contas não podem ser usadas para acessar dados de terceiros, explorar falhas, contornar
              controles de segurança, automatizar abuso ou prejudicar a disponibilidade do Readify.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">3. Conteúdo do usuário</h2>
            <p className="mt-2">
              Reviews, comentários, mensagens, stories e outros conteúdos publicados permanecem de responsabilidade de quem os criou.
              Ao publicar conteúdo em uma área pública ou compartilhada, o usuário autoriza sua exibição dentro das funcionalidades do
              Readify. Conteúdo ilegal, abusivo, discriminatório, fraudulento, que viole direitos de terceiros ou tente explorar outros
              usuários pode ser moderado ou removido.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">4. Catálogo e informações de livros</h2>
            <p className="mt-2">
              Metadados, capas, sinopses, disponibilidade e outras informações bibliográficas podem ser obtidos de fontes de terceiros
              e podem conter diferenças entre edições. O Readify pode corrigir ou normalizar o catálogo, mas não garante que todo dado
              bibliográfico externo esteja sempre completo ou isento de erro.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">5. Recomendações e gamificação</h2>
            <p className="mt-2">
              Recomendações são sugestões automatizadas baseadas em sinais de leitura e não constituem garantia de preferência. XP,
              streaks, rankings, desafios e conquistas são elementos de experiência do produto, não possuem valor monetário e podem
              ser recalculados quando houver correção de fraude, erro técnico ou regra de negócio.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">6. Trocas e ofertas entre usuários</h2>
            <p className="mt-2">
              Recursos de troca ou oferta servem para aproximar leitores. Na arquitetura atual, o Readify não processa pagamento, não
              guarda valores em custódia, não atua como instituição financeira e não garante entrega, estado físico do livro ou
              cumprimento de acordo entre usuários. As partes devem avaliar com quem estão negociando e nunca compartilhar senhas ou
              códigos de autenticação.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">7. Recursos de câmera e IA</h2>
            <p className="mt-2">
              Scanner de código, reconhecimento de capa/página e recursos assistidos por modelos automatizados podem produzir resultado
              incorreto. O usuário deve revisar informações relevantes antes de tomar decisões ou alterar dados importantes. Permissões
              de dispositivo são solicitadas apenas quando necessárias à funcionalidade correspondente.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">8. Disponibilidade e atualizações</h2>
            <p className="mt-2">
              O Readify busca manter o serviço disponível e seguro, mas manutenção, falhas de rede, serviços de terceiros ou atualização
              podem causar indisponibilidade temporária. Versões antigas podem deixar de ser suportadas quando isso for necessário para
              segurança, integridade de dados ou compatibilidade com as plataformas de distribuição.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">9. Encerramento da conta</h2>
            <p className="mt-2">
              O usuário pode excluir a própria conta pelas configurações do Readify. O serviço também pode restringir ou encerrar conta
              em caso de abuso grave, fraude, violação destes termos, risco à segurança ou obrigação legal, observadas as regras
              aplicáveis e o direito de acesso aos próprios dados quando cabível.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-foreground">10. Privacidade e versões futuras</h2>
            <p className="mt-2">
              O tratamento de dados é descrito na Política de Privacidade. Antes da distribuição comercial na Google Play, estes Termos
              receberão revisão jurídica final e as informações oficiais do responsável pelo serviço, sem reduzir os direitos previstos
              na legislação aplicável.
            </p>
          </section>
        </div>

        <footer className="mt-12 border-t border-border/60 pt-6 text-sm text-muted-foreground">
          <Link to="/privacidade" className="text-primary hover:underline">Ver Política de Privacidade</Link>
        </footer>
      </article>
    </main>
  );
}
