import Link from 'next/link'
import { LegalPage } from '@/components/LegalPage'
import { GAME_NAME } from '@/game/config'
import { LEGAL } from '@/game/legal'

export const metadata = { title: `Política de Privacidade · ${GAME_NAME}` }

// Reflete o que o código guarda hoje (src/server/db.ts). Controlador e contatos em src/game/legal.ts.
export default function Privacidade() {
  const dpo = <a href={`mailto:${LEGAL.dpoEmail}`}>{LEGAL.dpoEmail}</a>
  return (
    <LegalPage title="Política de Privacidade">
      <p>Esta política explica, em linguagem simples, quais dados o {GAME_NAME} trata, para quê e como você controla isso, conforme a Lei Geral de Proteção de Dados Pessoais (LGPD, Lei 13.709/2018), o Marco Civil da Internet (Lei 12.965/2014) e o ECA Digital (Lei 15.211/2025).</p>

      <h2>1. Quem é o controlador</h2>
      <p>Quem decide sobre o tratamento dos seus dados (controlador, na LGPD) são {LEGAL.controller} (“nós”). Contato geral: <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.</p>
      <p>Encarregado de dados: {dpo}.</p>

      <h2>2. Quais dados tratamos e por quê</h2>
      <table className="legal-table">
        <thead><tr><th>Dado</th><th>Finalidade</th><th>Base legal (LGPD)</th></tr></thead>
        <tbody>
          <tr><td>E-mail</td><td>Entrar na conta (código sem senha) e avisos sobre a conta</td><td>Execução de contrato (art. 7º, V)</td></tr>
          <tr><td>Apelido e avatar</td><td>Mostrar você aos amigos e vizinhos no jogo</td><td>Execução de contrato (art. 7º, V)</td></tr>
          <tr><td>Iniciais do apelido, rosto, nível, moedas ou popularidade e a fazenda (sem o apelido)</td><td>Vitrine pública da página inicial (“Fazendas em destaque”): quem não joga vê as iniciais e uma prévia da fazenda, sem poder entrar nela. Menores de 18 anos não aparecem. Você desliga em Minha conta</td><td>Legítimo interesse (art. 7º, IX), com oposição a qualquer momento</td></tr>
          <tr><td>Data de nascimento ou faixa de idade; autorização do responsável</td><td>Cumprir as regras de idade e o ECA Digital</td><td>Cumprimento de obrigação legal (art. 7º, II)</td></tr>
          <tr><td>Fazenda, celeiro, ouro, amizades, mural e convites</td><td>Fazer o jogo funcionar</td><td>Execução de contrato (art. 7º, V)</td></tr>
          <tr><td>Endereço IP, aparelho (navegador) e horários de acesso</td><td>Segurança, limites contra abuso e “Sair de todos os aparelhos”</td><td>Legítimo interesse (art. 7º, IX) e obrigação legal (Marco Civil, art. 15)</td></tr>
          <tr><td>Inscrição de notificações do navegador</td><td>Avisar que a horta está pronta (só se você ligar)</td><td>Consentimento (art. 7º, I)</td></tr>
        </tbody>
      </table>
      <p>Não pedimos nome completo, CPF, telefone, foto nem localização. Não vendemos dados e não fazemos publicidade direcionada.</p>

      <h2>3. Cookies</h2>
      <p>Usamos só cookies essenciais: o da sessão (para você continuar conectado), o do cadastro em andamento e o do convite de um amigo. Não usamos cookies de publicidade nem de rastreamento.</p>

      <h2>4. Com quem compartilhamos</h2>
      <p>Só com os fornecedores que operam o jogo para nós, e apenas o necessário para cada serviço:</p>
      <ul>
        <li><b>Hospedagem</b>: o serviço escolhido por quem opera esta instalação;</li>
        <li><b>E-mail</b>: o provedor configurado nesta instalação, se habilitado, recebe o destinatário e a mensagem;</li>
        <li><b>Serviço de notificações do seu navegador</b> (por exemplo, Google, Apple ou Mozilla): entrega os avisos, se você os ligar.</li>
      </ul>
      <p>Algumas dessas empresas têm sede ou servidores fora do Brasil. Nesses casos, a transferência segue o art. 33 da LGPD. Também podemos compartilhar dados quando uma lei ou ordem judicial exigir.</p>

      <h2>5. Por quanto tempo guardamos</h2>
      <ul>
        <li>Dados da conta e do jogo: enquanto a conta existir. Ao excluir a conta, apagamos a conta e os dados ligados a ela.</li>
        <li>Registros de acesso (IP e horário): 6 meses, como determina o Marco Civil da Internet.</li>
        <li>Códigos de entrada: 15 minutos, e guardamos só uma versão cifrada (hash).</li>
      </ul>

      <h2>6. Seus direitos (LGPD, art. 18)</h2>
      <p>Você pode pedir, a qualquer momento:</p>
      <ul>
        <li>confirmação de que tratamos seus dados e acesso a eles;</li>
        <li>correção de dados incompletos, inexatos ou desatualizados;</li>
        <li>anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desacordo com a LGPD;</li>
        <li>portabilidade dos dados;</li>
        <li>eliminação dos dados tratados com o seu consentimento e revogação desse consentimento;</li>
        <li>informação sobre com quem compartilhamos seus dados e sobre a possibilidade de não dar consentimento.</li>
      </ul>
      <p>Várias dessas ações estão em <Link href="/conta">Minha conta</Link>: <b>baixar seus dados</b> num arquivo, <b>excluir a conta</b> (com confirmação pelo e-mail) e sair de todos os aparelhos. Para os demais pedidos, dúvidas ou reclamações, escreva ao encarregado em {dpo}, a partir do e-mail da sua conta. Você também pode procurar a Autoridade Nacional de Proteção de Dados (ANPD).</p>

      <h2>7. Crianças e adolescentes</h2>
      <p>O jogo não é destinado a menores de 13 anos. Entre 13 e 15 anos, a conta só é criada com autorização do responsável. Esta edição não oferece compras com dinheiro. Não usamos dados de crianças e adolescentes para publicidade nem para perfis de comportamento.</p>

      <h2>8. Exclusão da conta e amigos</h2>
      <p>Quando você exclui a conta, as amizades somem dos dois lados e, nos murais dos amigos, o que você fez aparece como “Alguém”. Quem você convidou continua com a própria fazenda.</p>

      <h2>9. Segurança</h2>
      <p>Conexão criptografada (HTTPS), sessões em cookie protegido, códigos e sessões guardados só como hash e limites de tentativas contra adivinhação.</p>

      <h2>10. Mudanças nesta política</h2>
      <p>Quando esta política mudar, a data de “Última atualização” no topo desta página muda junto.</p>
    </LegalPage>
  )
}
