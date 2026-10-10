import Link from 'next/link'
import { LegalPage } from '@/components/LegalPage'
import { GAME_NAME } from '@/game/config'
import { LEGAL } from '@/game/legal'

export const metadata = { title: `Termos de Uso · ${GAME_NAME}` }

// Controlador e contatos em src/game/legal.ts.
export default function Termos() {
  const contact = <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
  return (
    <LegalPage title="Termos de Uso">
      <p>Estes Termos regem o uso do {GAME_NAME}. Ao criar a conta, você declara que leu e aceita estes Termos e a <Link href="/privacidade">Política de Privacidade</Link>.</p>

      <h2>1. Quem somos</h2>
      <p>O {GAME_NAME} é um jogo de fazenda gratuito, jogado no navegador, oferecido por {LEGAL.controller} (“nós”). Contato: {contact}.</p>
      <p>O {GAME_NAME} é uma obra independente, inspirada nos jogos de fazenda das redes sociais dos anos 2010. Não é ligado, patrocinado nem aprovado por nenhuma rede social nem pelos autores de jogos daquela época.</p>

      <h2>2. Conta</h2>
      <ul>
        <li>Você entra com o seu e-mail, sem senha: a cada entrada mandamos um código de uso único. Cuide do acesso ao seu e-mail, porque quem o controla controla a fazenda.</li>
        <li>Cada pessoa pode ter uma conta. O apelido não pode imitar outra pessoa, ofender ninguém nem conter dados pessoais de terceiros.</li>
        <li>É preciso ter <b>13 anos ou mais</b>. Entre 13 e 15 anos, só com autorização do pai, da mãe ou do responsável legal, que responde pelo uso da conta.</li>
      </ul>

      <h2>3. Como o jogo funciona</h2>
      <p>“Roubar” da horta de amigos, jogar pragas e outras brincadeiras são <b>regras do jogo</b>, sem relação com bens reais. O ouro, as sementes, os bichos e os demais itens são virtuais, não têm valor fora do jogo, não podem ser trocados por dinheiro nem transferidos para fora da sua conta.</p>

      <h2>4. Moedas do jogo</h2>
      <p>Esta edição não oferece compras com dinheiro real. O ouro é obtido jogando e pode ser usado na loja de sementes, bichos e decoração.</p>

      <h2>5. Regras de convivência</h2>
      <p>Não é permitido: usar robôs, scripts ou falhas para ganhar vantagem; criar contas em massa; vender contas ou itens; ofender, ameaçar ou perseguir outros jogadores; tentar invadir ou sobrecarregar o serviço. Podemos suspender ou encerrar contas que descumprirem estas regras, avisando o motivo sempre que possível.</p>

      <h2>6. Disponibilidade e mudanças</h2>
      <p>O jogo é oferecido “como está” e pode ficar fora do ar para manutenção. Podemos ajustar regras, preços em ouro e itens para equilibrar o jogo. Mudanças importantes nestes Termos serão avisadas no jogo e, quando for o caso, pediremos um novo aceite.</p>

      <h2>7. Encerramento</h2>
      <p>Você pode excluir sua conta quando quiser, em <Link href="/conta">Minha conta</Link>. Os dados são apagados como explica a <Link href="/privacidade">Política de Privacidade</Link>.</p>

      <h2>8. Responsabilidade</h2>
      <p>Respondemos pelos nossos serviços nos termos do Código de Defesa do Consumidor. Não respondemos por perdas causadas por acesso indevido ao seu e-mail ou por uso contrário a estes Termos.</p>

      <h2>9. Lei e foro</h2>
      <p>Valem as leis do Brasil. Fica eleito o foro do domicílio do consumidor.</p>
    </LegalPage>
  )
}
