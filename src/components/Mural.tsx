'use client'
// Mural (registro da fazenda), "Enquanto você estava fora" e Dúvidas (menu do app:
// Presente, Convidar amigos, Comunidade e Dúvidas).
import Link from 'next/link'
import { awaySummary, goBack, GO_LABEL, type AwayLine, type FeedEvent } from '@/game/away'
import { CARE, DOG_LEVEL, GAME_NAME, LOVE, POPULARITY_CAP, STEAL } from '@/game/config'
import type { EventBannerText } from '@/game/event-types'
import { Dialog } from './ui/Dialog'
import { Icon } from './ui/Icon'
import { Empty } from './Dialogs'
import { EventBanner } from './EventBanner'
import { PrimaryButton } from './ui/kit'

const GoLink = ({ actor, go, onGo }: { actor: string; go: AwayLine['go']; onGo?: () => void }) => (
  <Link className={`btn small ${go === 'revenge' ? 'red' : 'green'}`} href={`/fazenda/${actor}`} onClick={onGo}
    aria-label={`${GO_LABEL[go]}: ir à fazenda de ${actor}`}>{GO_LABEL[go]}</Link>
)

export function MuralDialog({ events, seenId, text, extra, banner, onClose }: {
  events: FeedEvent[]; seenId: number; text: (e: FeedEvent) => string; extra?: (e: FeedEvent) => React.ReactNode
  banner?: { src: string; text: string; box: EventBannerText; onOpen: () => void } // evento sazonal valendo (Evolução 09)
  onClose: () => void
}) {
  return (
    <Dialog title="Mural" icon={<Icon name="board" emoji="📜" size={36} />} onClose={onClose}>
      {banner && (
        <EventBanner src={banner.src} text={banner.text} box={banner.box} onOpen={banner.onOpen} />
      )}
      {events.length === 0 && <Empty icon="📜" text="Nada aconteceu ainda. Aqui aparecem visitas, presentes, ajudas e quem pegou da sua horta." />}
      <ul className="list feed">
        {events.map((e) => {
          const go = goBack(e)
          return (
            <li key={e.id} className={e.id > seenId ? 'new' : undefined}>
              <span className="feed-text">{e.id > seenId && <b className="feed-new">novo</b>}{text(e)}</span>
              {extra?.(e)}
              {go && e.actor && <GoLink actor={e.actor} go={go} />}
              <small className="t-label">{new Date(e.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small>
            </li>
          )
        })}
      </ul>
    </Dialog>
  )
}

/** Ao voltar para a fazenda: o que os amigos fizeram nela, com o atalho para revidar ou retribuir. */
export function AwayDialog({ events, seenId, onMural, onClose }: { events: FeedEvent[]; seenId: number; onMural: () => void; onClose: () => void }) {
  const lines = awaySummary(events, seenId)
  return (
    <Dialog title="Enquanto você estava fora" icon={<Icon name="board" emoji="📜" size={36} />} onClose={onClose}>
      <ul className="list feed away">
        {lines.map((l) => (
          <li key={`${l.actor}|${l.text}`}>
            <span className="away-ic" aria-hidden>{l.icon}</span>
            <span className="feed-text">{l.text}</span>
            <GoLink actor={l.actor} go={l.go} onGo={onClose} />
          </li>
        ))}
      </ul>
      <div className="center row">
        <PrimaryButton onClick={onClose}>Ver minha fazenda</PrimaryButton>
        <button className="btn" onClick={onMural}>Abrir o Mural</button>
      </div>
    </Dialog>
  )
}

const FAQ: { q: string; a: string }[] = [
  { q: 'Como eu planto?', a: 'Toque num lote vazio com a seta e escolha a semente em "Seus pertences". Sem semente, a Loja vende. A planta cresce mesmo com o jogo fechado.' },
  { q: 'Como pego da horta dos amigos?', a: `Visite um amigo (faixa de baixo ou janela Amigos) e toque no lote maduro com a mão: cada toque leva 1 unidade. O dono sempre fica com uma parte da safra (perto de 60% nas sementes comuns, até 80% no melão e no kiwi, bem menos no cacau, na noz e no caviar; dos bichos de corte ninguém pega nada): quando chega nisso, aparece "Não seja tão ganancioso!". Dá para pegar até ${STEAL.dailyUnits} unidades por dia.` },
  { q: 'E o cachorro?', a: 'Cachorro acordado pode morder quem pega da horta, e a mordida custa ouro. Quando ele está de costas para o lote, a chance cai muito. Sem ração ele dorme. Ossos sobem o nível dele.' },
  { q: 'Como ajudo um amigo?', a: `Na horta dele, regue a terra seca e tire pragas e ervas: +${CARE.helpXp} XP e +${CARE.helpGold} de ouro por ajuda (até ${CARE.helpDaily} por dia), e ${DOG_LEVEL.helpEvery} ajudas dão 1 osso. O Fertilizante do Amor é grátis: ${LOVE.daily} por dia, só na horta de amigos.` },
  { q: 'Dá para aprontar?', a: `Dá: até ${CARE.throwDaily} pragas e ${CARE.throwDaily} ervas por dia, no máximo ${CARE.maxPerPlot} de cada por lote. Cada uma estraga um pouco a colheita do dono até alguém tirar.` },
  { q: 'Para que serve o adubo?', a: 'Adianta a planta: comum, rápido ou super. Só 1 adubo por estágio; para usar outro, espere a planta crescer sozinha até o próximo estágio.' },
  { q: 'Popularidade?', a: `Cada ponto dá +1% em toda venda no Depósito, até ${POPULARITY_CAP}%. Ganhe recebendo flores dos amigos.` },
  { q: 'Como ganho mais terra?', a: 'Toque na placa "À venda" ao lado da roça. Cada terreno novo pede um nível mínimo e ouro; dá para chegar a 24 lotes.' },
  { q: 'O que ganho por entrar todo dia?', a: 'Ouro que aumenta a cada dia seguido (até o 7º), uma semente grátis e 1 osso. Há também 3 missões por dia.' },
]

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Dúvidas" icon={<Icon name="help_book" emoji="❓" size={26} />} onClose={onClose} wide>
      <div className="faq">
        {FAQ.map((f) => (
          <details key={f.q}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
      <p className="muted small center">Não achou? Pergunte para quem te chamou para o {GAME_NAME}: a turma sempre sabe um truque.</p>
    </Dialog>
  )
}
