'use client'
// Janela do evento sazonal (Evolução 09): banner, tigela de doces, troca de doces e missões em cadeia.
// Evolução 13: uma aba por mecânica que o evento tiver (árvore com presentes, ajuda de amigos, meias, oficina, envio).
import { useState } from 'react'
import { itemIcon, itemName } from '@/game/catalog'
import { bowlSrc, brDateTime, buildSrc, endsInText, HELP_EMOJI, helpSrc } from '@/game/events'
import type { EventReward } from '@/game/event-types'
import type { EventView } from '@/server/events'
import type { Act } from './Dialogs'
import { Empty } from './Dialogs'
import { EventBanner } from './EventBanner'
import { Dialog } from './ui/Dialog'
import { Icon } from './ui/Icon'
import { Badge, PrimaryButton } from './ui/kit'

export type EventTab = 'tigela' | 'arvore' | 'ajuda' | 'meias' | 'oficina' | 'enviar' | 'troca' | 'missoes'

const BOWL_NAME: Record<string, string> = { tigela: 'Tigela', saco: 'Saco de confete', pipoqueira: 'Pipoqueira' }

/** Abas que este evento tem, nesta ordem: o objeto principal primeiro, missões no fim. */
export function eventTabs(ev: EventView): { id: EventTab; name: string }[] {
  return [
    ev.bowl && { id: 'tigela' as const, name: BOWL_NAME[ev.bowlArt] ?? 'Tigela' },
    ev.build && { id: 'arvore' as const, name: ev.id === 'natal' ? 'Árvore' : 'Construção' },
    ev.help && !ev.help.locked && { id: 'ajuda' as const, name: ev.help.name },
    ev.advent && { id: 'meias' as const, name: 'Meias' },
    ev.workshop && { id: 'oficina' as const, name: 'Oficina' },
    // Ovo gigante trancado (E8: aparece depois de N ovos abertos) vai para depois da oficina.
    ev.help?.locked && { id: 'ajuda' as const, name: ev.help.name },
    ev.send.length > 0 && { id: 'enviar' as const, name: 'Enviar' },
    ev.trades.length > 0 && { id: 'troca' as const, name: 'Troca' },
    { id: 'missoes' as const, name: 'Missões' },
  ].filter((t): t is { id: EventTab; name: string } => !!t)
}

const Coin = ({ size = 16 }: { size?: number }) => <Icon name="coin" emoji="🪙" size={size} />

type Common = { ev: EventView; isOwn: boolean; owner: string; now: number; busy: boolean; act: Act; onShare: (text: string) => void }

export function EventDialog({ ev, isOwn, owner, now, busy, act, at, friends, onShare, onClose }: {
  ev: EventView; isOwn: boolean; owner: string; now: number; busy: boolean; act: Act; at?: EventTab
  friends: string[] // apelidos dos amigos (para mandar cartão ou presente da própria fazenda)
  onShare: (text: string) => void; onClose: () => void
}) {
  const all = eventTabs(ev)
  const [tab, setTab] = useState<EventTab>(at && all.some((t) => t.id === at) ? at : all[0].id)
  const cur = ev.currency
  const ready = ev.missions.filter((m) => !m.claimed && m.open && m.progress >= m.target).length
  const tabs = all.map((t) => (t.id === 'missoes' && ready ? { ...t, name: `Missões (${ready})` } : t))
  const c: Common = { ev, isOwn, owner, now, busy, act, onShare }
  return (
    <Dialog title={ev.name} subtitle={`${endsInText(ev.endsAt, now)} · até ${brDateTime(ev.endsAt - 60_000)}`} className="event-dialog"
      icon={<Icon name={ev.icon} emoji="🎉" size={40} />} tabs={tabs} tab={tab} onTab={setTab} onClose={onClose}
      footer={cur ? <span className="wallet"><span className="t-label">Seus {cur.plural}</span> <Icon name={cur.icon} emoji={cur.emoji} size={22} /> <b className="t-num" data-testid="event-candies">{ev.candies}</b></span> : undefined}>
      <EventBanner src={ev.banner} text={ev.tagline} box={ev.bannerText} />
      {tab === 'tigela' && <BowlTab {...c} />}
      {tab === 'arvore' && <BuildTab {...c} />}
      {tab === 'ajuda' && <HelpTab {...c} />}
      {tab === 'meias' && <AdventTab {...c} />}
      {tab === 'oficina' && <WorkshopTab {...c} />}
      {tab === 'enviar' && <SendTab {...c} friends={friends} />}
      {tab === 'troca' && <TradeTab {...c} />}
      {tab === 'missoes' && <MissionsTab {...c} />}
    </Dialog>
  )
}

function Reward({ ev, r }: { ev: EventView; r: EventReward }) {
  return (
    <>
      {r.gold ? <Badge tone="plain"><Coin size={14} /> {r.gold}</Badge> : null}
      {r.xp ? <Badge tone="plain">⭐ {r.xp} XP</Badge> : null}
      {r.candy && ev.currency ? <Badge tone="plain">{ev.currency.emoji} {r.candy}</Badge> : null}
      {(r.items ?? []).map(([i, n]) => <Badge key={i} tone="plain">{n} × {rewardLabel(i)}</Badge>)}
    </>
  )
}

const rewardLabel = (item: string) => (item.includes(':') && !item.startsWith('semente:') && !item.startsWith('presente:') ? item.split(':').reverse().join(' ').replace(/_/g, ' ') : itemName(item))

/** Botão de chamar amigos (WhatsApp/compartilhar) onde a mecânica precisa deles. */
function AskFriends({ text, label, onShare }: { text: string; label: string; onShare: (t: string) => void }) {
  return <button className="btn small" onClick={() => onShare(text)}><Icon name="invite" emoji="💌" size={20} /> {label}</button>
}

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <span className="m-progress">
      <span className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
        <i style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%` }} />
      </span>
      <span className="t-label">{value}/{max}</span>
    </span>
  )
}

function BowlTab({ ev, isOwn, owner, now, busy, act }: Common) {
  const b = ev.bowl
  const cur = ev.currency
  if (!b || !cur) return <Empty icon="🍬" text="Este evento não tem tigela." />
  const name = (BOWL_NAME[ev.bowlArt] ?? 'Tigela').toLowerCase()
  const seedsOpen = now < ev.seedsUntil
  return (
    <div className="event-bowl">
      <img className="bowl-img" src={bowlSrc(ev.dir, ev.bowlArt, b.look)} alt={`${name} ${b.look}`} width={144} height={132} />
      <div className="bowl-info">
        <p className="big"><b data-testid="bowl-candies">{b.candies}</b>/{b.capacity} {cur.plural} na {name}{isOwn ? '' : ` de ${owner}`}</p>
        {isOwn ? (
          <>
            {b.prizeReady ? (
              <>
                <p>Os amigos esvaziaram a {name}: pegue o prêmio!</p>
                <PrimaryButton disabled={busy} onClick={() => act({ type: 'event_prize' })}>Pegar o prêmio</PrimaryButton>
              </>
            ) : b.candies < b.capacity ? (
              <>
                <p>Encher a {name} consome 1 {itemName(b.refillItem).toLowerCase()} (você tem {b.refills}).</p>
                <PrimaryButton disabled={busy || b.refills < 1} onClick={() => act({ type: 'event_fill' })}>Encher a {name}</PrimaryButton>
              </>
            ) : <p>{name[0].toUpperCase() + name.slice(1)} cheia: cada amigo que visitar pega 1 {cur.name.toLowerCase()} por dia.</p>}
            <p className="muted small">
              Quando os amigos esvaziam a {name}, você ganha +{b.prize.gold} de ouro, +{b.prize.xp} XP e {b.prize.items.map(([i, n]) => `${n} × ${itemName(i)}`).join(', ')}.
            </p>
            <h4>Quem pegou hoje</h4>
            {b.takers.length ? (
              <ul className="list bowl-takers">{b.takers.map((t) => (
                <li key={`${t.handle}${t.at}`}>{cur.emoji} <b>{t.handle}</b> pegou um {cur.name.toLowerCase()} <small className="t-label">{new Date(t.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small></li>
              ))}</ul>
            ) : <p className="muted">Ninguém ainda. Convide os amigos para visitar!</p>}
          </>
        ) : (
          <>
            {b.takenToday ? <p>Você já pegou um {cur.name.toLowerCase()} de {owner} hoje. Volte amanhã!</p>
              : b.candies <= 0 ? <p>A {name} está vazia.</p>
              : b.takesLeft <= 0 ? <p>Você já pegou {cur.plural} demais hoje.</p>
              : <p>Pegue 1 {cur.name.toLowerCase()} (+XP). Hoje ainda dá para pegar {b.takesLeft}.</p>}
            <PrimaryButton disabled={busy || !b.canTake} onClick={() => act({ type: 'event_take', owner })}>Pegar 1 {cur.name.toLowerCase()}</PrimaryButton>
          </>
        )}
      </div>
      <p className="muted small event-note">
        {seedsOpen
          ? `Semente do evento na loja até ${brDateTime(ev.seedsUntil)}: depois disso ela não daria tempo de amadurecer antes do fim.`
          : 'A semente do evento já saiu da loja (não daria tempo de amadurecer). Quem tem continua plantando.'}
      </p>
    </div>
  )
}

/** E7 + E5: árvore de Natal com materiais dos amigos e os presentes pendurados, trancados até o dia 25. */
function BuildTab({ ev, isOwn, owner, now, busy, act, onShare }: Common) {
  const b = ev.build!
  const g = ev.gifts
  const src = buildSrc(ev.dir, ev.id, b.level)
  const canUp = isOwn && b.next && b.next.every((n) => n.have >= n.need)
  const [kind, setKind] = useState(g?.kinds[0]?.id ?? '')
  return (
    <div className="event-obj">
      <div className="obj-art">
        {src ? <img src={src} alt={`Árvore nível ${b.level}`} width={128} height={160} /> : <span className="obj-emoji">🎄</span>}
        <b>Nível {b.level}/{b.max}</b>
      </div>
      <div className="obj-info">
        {isOwn ? (
          b.next ? (
            <>
              <p className="big">Complete sua árvore de Natal (nível {b.level + 1})</p>
              <ul className="list obj-needs">
                {b.next.map((n) => {
                  const ic = itemIcon(n.item)
                  return <li key={n.item}><Icon name={ic.name} emoji={ic.emoji} size={32} /> <span className="feed-text">{n.name}</span> <Bar value={Math.min(n.have, n.need)} max={n.need} label={n.name} /></li>
                })}
              </ul>
              {b.prize && <p className="m-reward"><span className="t-label">Prêmio do nível</span> <Reward ev={ev} r={b.prize} /></p>}
              <PrimaryButton disabled={busy || !canUp} onClick={() => act({ type: 'event_build_up' })}>Aprimorar a árvore</PrimaryButton>
              <p className="muted small">Cada amigo manda 1 material por dia, sempre do mesmo tipo. A estrela sai na Troca.</p>
              <AskFriends onShare={onShare} label="Pedir materiais" text={`Me ajuda a montar minha árvore de Natal na fazenda? Cada amigo manda 1 material por dia 🎄`} />
            </>
          ) : <p className="big">Árvore completa! 🎄 Agora é esperar os presentes dos amigos.</p>
        ) : (
          <>
            <p>Mande o seu material para a árvore de {owner}: você manda sempre <b>{b.myItemName}</b>.</p>
            <PrimaryButton disabled={busy || !b.canGive} onClick={() => act({ type: 'event_build_give', owner })}>
              {b.givenToday ? 'Já mandou hoje' : b.level >= b.max ? 'Árvore completa' : `Mandar 1 × ${b.myItemName}`}
            </PrimaryButton>
          </>
        )}
      </div>
      {g && (
        <div className="obj-gifts">
          <h4>Presentes na árvore ({g.hung}/{g.slots} vagas)</h4>
          {g.locked && <p className="muted small">🔒 Você não pode abrir os presentes até o Natal ({brDateTime(g.unlockAt)}).</p>}
          {g.slots === 0 && <p className="muted small">Aprimore a árvore para ter vagas: 10 presentes por nível.</p>}
          <ul className="gift-grid">
            {g.list.map((x) => (
              <li key={x.id} title={`${itemName(`presente:${x.kind}`)}${x.from ? ` de ${x.from}` : ''}`}>
                <img src={`${ev.dir}/presente_${x.opened ? 'aberto' : 'fechado'}.png`} alt={x.opened ? 'Presente aberto' : 'Presente fechado'} width={44} height={44} />
                <small>{x.from ?? '—'}</small>
              </li>
            ))}
          </ul>
          {isOwn ? (
            <PrimaryButton disabled={busy || g.locked || g.unopened < 1} onClick={() => act({ type: 'event_gift_open' })}>
              {g.locked ? 'Abre no Natal' : `Abrir presente (${g.unopened})`}
            </PrimaryButton>
          ) : (
            <>
              <p className="small">Pendure 1 presente por dia na árvore de {owner} (abre no Natal):</p>
              <div className="gift-kinds" role="radiogroup" aria-label="Presente">
                {g.kinds.map((k) => {
                  const ic = itemIcon(`presente:${k.id}`)
                  return (
                    <button key={k.id} role="radio" aria-checked={kind === k.id} className={`gift-kind ${kind === k.id ? 'on' : ''}`} onClick={() => setKind(k.id)} title={k.name}>
                      <Icon name={ic.name} emoji={ic.emoji} size={36} />
                    </button>
                  )
                })}
              </div>
              <PrimaryButton disabled={busy || !g.canHang} onClick={() => act({ type: 'event_gift_hang', owner, kind })}>
                {g.hungToday ? 'Já pendurou hoje' : g.hung >= g.slots ? 'Sem vaga na árvore' : `Pendurar ${g.kinds.find((k) => k.id === kind)?.name ?? ''}`}
              </PrimaryButton>
            </>
          )}
        </div>
      )}
      {now < 0 && null}
    </div>
  )
}

/** E4: objeto que só se completa com a ajuda de amigos diferentes no prazo (boneco de neve, baú, ovo gigante). */
function HelpTab({ ev, isOwn, owner, now, busy, act, onShare }: Common) {
  const h = ev.help!
  const src = helpSrc(ev.dir, h.id, h.helps, h.friends, h.claimed)
  return (
    <div className="event-obj">
      <div className="obj-art">
        {src ? <img src={src} alt={h.name} width={128} height={128} /> : <span className="obj-emoji">{HELP_EMOJI[h.id] ?? '🤝'}</span>}
      </div>
      <div className="obj-info">
        <p className="big">{h.name}{isOwn ? '' : ` de ${owner}`}</p>
        {h.locked ? (
          <p>🔒 Aparece depois de {h.unlockAt} ovos abertos na oficina.</p>
        ) : (
          <>
            <p>Precisa da ajuda de {h.friends} amigos{h.daily ? ' (recomeça todo dia)' : ''}. {h.claimed ? 'Prêmio já recebido.' : `Prazo: ${endsInText(h.deadline, now)}.`}</p>
            <Bar value={h.helps} max={h.friends} label="Ajudas" />
            {!h.daily && !h.claimed && h.helps < h.friends && <p className="muted small">Sem ajuda suficiente no prazo, recomeça do zero{h.id === 'boneco_neve' ? ': o monte de neve está derretendo.' : '.'}</p>}
            {h.helpers.length > 0 && <p className="small">Ajudaram: {h.helpers.join(', ')}</p>}
            <p className="m-reward"><span className="t-label">Prêmio</span> <Reward ev={ev} r={h.prize} /></p>
            {isOwn ? (
              h.ready && !h.claimed
                ? <PrimaryButton disabled={busy} onClick={() => act({ type: 'event_help_claim' })}>Pegar o prêmio</PrimaryButton>
                : !h.claimed && <AskFriends onShare={onShare} label="Pedir ajuda" text={`Me ajuda com o ${h.name.toLowerCase()} na minha fazenda? Faltam ${h.friends - h.helps} amigos!`} />
            ) : (
              <PrimaryButton disabled={busy || !h.canHelp} onClick={() => act({ type: 'event_help', owner })}>
                {h.helpedNow ? 'Você já ajudou' : h.helps >= h.friends ? 'Já está completo' : 'Ajudar'}
              </PrimaryButton>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** E6: calendário de presença (as 24 meias do Natal). */
function AdventTab({ ev, busy, act }: Common) {
  const a = ev.advent!
  const signed = new Set(a.signed)
  const missed = new Set(a.missed)
  return (
    <div className="event-advent">
      <p>Você já assinou <b>{a.signed.length}</b> de {a.days} dias.{a.today > a.days ? ' O calendário terminou.' : ''}</p>
      <ul className="advent-grid">
        {Array.from({ length: a.days }, (_, i) => i + 1).map((d) => (
          <li key={d} className={`${d === a.today ? 'today' : ''}`} title={`Dia ${d}`}>
            <img src={`${ev.dir}/meia_${signed.has(d) ? 'cheia' : missed.has(d) ? 'perdida' : 'vazia'}.png`} alt={signed.has(d) ? 'assinada' : missed.has(d) ? 'perdida' : 'vazia'} width={40} height={40} />
            <small>{d}</small>
          </li>
        ))}
      </ul>
      <div className="row-btns">
        <PrimaryButton disabled={busy || a.signedToday || a.today > a.days} onClick={() => act({ type: 'event_checkin' })}>{a.signedToday ? 'Assinado hoje' : 'Assinar hoje'}</PrimaryButton>
        {a.missed.length > 0 && (
          <button className="btn small" disabled={busy} onClick={() => act({ type: 'event_checkin_recover' })}>Recuperar assinatura (<Coin size={14} /> {a.recoverGold})</button>
        )}
      </div>
      <ul className="list advent-milestones">
        {a.milestones.map((m) => (
          <li key={m.at} className={m.done ? 'done' : ''}><b>{m.at} dias</b> <span className="m-reward"><Reward ev={ev} r={m.reward} /></span> {m.done ? <span className="ok">✓</span> : null}</li>
        ))}
      </ul>
    </div>
  )
}

/** E8: oficina do Coelho Mágico (receitas que destravam por ovos abertos; peças de decoração sem sorte). */
function WorkshopTab({ ev, now, busy, act }: Common) {
  const w = ev.workshop!
  const oven = w.oven
  return (
    <div className="event-workshop">
      <p className="big">🐇 “Traga materiais e eu criarei Ovos de Páscoa!”</p>
      <p>Ovos abertos: <b>{w.opened}</b>{w.hasDiploma ? ' · 📜 Você já tem o diploma' : ` · diploma com ${w.diplomaAt}`}</p>
      {oven && (
        <p className="oven">
          {itemName(oven.recipe)}: {now >= oven.readyAt ? 'pronto!' : `fica pronto ${endsInText(oven.readyAt, now).replace(/^termina /, '')}`}{' '}
          <PrimaryButton disabled={busy || now < oven.readyAt} onClick={() => act({ type: 'event_craft_collect' })}>Pegar</PrimaryButton>
        </p>
      )}
      <ul className="list event-recipes">
        {w.recipes.map((r) => {
          const ic = itemIcon(r.id)
          const can = r.unlocked && !oven && r.needs.every((n) => n.have >= n.qty)
          return (
            <li key={r.id} className={r.unlocked ? '' : 'locked'}>
              <Icon name={ic.name} emoji={ic.emoji} size={44} />
              <span className="feed-text">
                <b>{r.name}</b> <small className="muted">{r.minutes} min</small>
                <small>{r.unlocked ? r.needs.map((n) => `${n.qty} × ${n.name} (tem ${n.have})`).join(' + ') : `🔒 destrava com ${r.unlockAt} ovos abertos`}</small>
              </span>
              <button className="btn small green" disabled={busy || !can} onClick={() => act({ type: 'event_craft', recipe: r.id })}>Fazer</button>
              <button className="btn small" disabled={busy || r.eggs < 1} onClick={() => act({ type: 'event_open_egg', recipe: r.id })}>Abrir ({r.eggs})</button>
            </li>
          )
        })}
      </ul>
      <h4>Decoração de Páscoa {w.setDone ? '✓' : ''}</h4>
      <ul className="list event-pieces">
        {w.pieces.map((p) => (
          <li key={p.piece} className={p.owned ? 'done' : ''}>{p.owned ? '✓' : '○'} {p.name} <small className="muted">· {p.nth}º {itemName(p.recipe).toLowerCase()} aberto</small></li>
        ))}
      </ul>
    </div>
  )
}

/** E9: cartão ou presente do evento para um amigo (popularidade para quem recebe). */
function SendTab({ ev, isOwn, owner, busy, act, onShare, friends }: Common & { friends: string[] }) {
  const [to, setTo] = useState(isOwn ? friends[0] ?? '' : owner)
  return (
    <div className="event-send">
      {isOwn ? (
        friends.length ? (
          <label className="send-to">Mandar para{' '}
            <select value={to} onChange={(e) => setTo(e.target.value)}>{friends.map((f) => <option key={f} value={f}>{f}</option>)}</select>
          </label>
        ) : <p>Você ainda não tem amigos para mandar.</p>
      ) : <p>Mandar para <b>{owner}</b></p>}
      <ul className="list event-trades">
        {ev.send.map((s) => {
          const ic = itemIcon(s.id)
          const sent = s.free && s.sentToday.includes(to)
          return (
            <li key={s.id}>
              <Icon name={ic.name} emoji={ic.emoji} size={44} />
              <span className="feed-text"><b>{s.name}</b>
                <small className="muted">{s.charm > 0 ? ` · +${s.charm} de popularidade para o amigo` : ' · vai para o depósito do amigo'}{s.free ? (sent ? ` · já mandou para ${to} hoje` : ' · grátis, 1 por amigo por dia') : ` · você tem ${s.have}`}</small>
              </span>
              <button className="btn small green" disabled={busy || !to || sent || (!s.free && s.have < 1)} onClick={() => act({ type: 'event_send', to, item: s.id })}>Mandar</button>
            </li>
          )
        })}
      </ul>
      <AskFriends onShare={onShare} label="Chamar amigos" text={`Vem pro ${ev.name} na minha fazenda! Tenho um presente pra você 🎁`} />
    </div>
  )
}

function TradeTab({ ev, busy, act }: Common) {
  const cur = ev.currency
  if (!cur) return <Empty icon="🎁" text="Este evento não tem troca." />
  return (
    <>
      <p className="muted">Troque {cur.plural} por prêmios do evento. {cur.plural[0].toUpperCase() + cur.plural.slice(1)} vêm das colheitas, dos amigos e das missões.</p>
      <ul className="list event-trades">
        {ev.trades.map((t) => {
          const icon = t.kind === 'decor' ? { name: `deco/${t.item.split(':')[1]}/${t.item.split(':')[0]}`, emoji: '🎁' } : itemIcon(t.item)
          return (
            <li key={t.id}>
              <Icon name={icon.name} emoji={icon.emoji} size={44} />
              <span className="feed-text"><b>{t.qty > 1 ? `${t.qty} × ` : ''}{t.name}</b>{t.kind === 'decor' ? <small className="muted"> · decoração</small> : null}</span>
              <Badge tone="plain"><Icon name={cur.icon} emoji={cur.emoji} size={16} /> {t.give}</Badge>
              {t.owned ? <Badge tone="green">Já tem</Badge> : (
                <button className="btn small green" disabled={busy || ev.candies < t.give} onClick={() => act({ type: 'event_trade', trade: t.id })}>Trocar</button>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

function MissionsTab({ ev, busy, act }: Common) {
  return (
    <ul className="missions event-missions">
      {ev.missions.map((m) => {
        const ready = m.open && !m.claimed && m.progress >= m.target
        const locked = !m.open && !m.claimed
        return (
          <li key={m.idx} className={`${m.claimed ? 'done' : ''} ${ready ? 'ready' : ''} ${locked ? 'locked' : ''}`}>
            <div>
              <b>{m.idx + 1}. {m.title}</b>
              <span className="muted">{locked ? 'Próxima missão' : m.text}</span>
              {!locked && <Bar value={m.progress} max={m.target} label={m.text} />}
              <span className="m-reward">
                <span className="t-label">Recompensa da missão</span>
                <Reward ev={ev} r={m.reward} />
              </span>
            </div>
            {m.claimed ? <span className="ok" role="img" aria-label="Recebida">✓</span>
              : locked ? <span className="ok" aria-label="Trancada">🔒</span>
              : ready && <span className="claim"><PrimaryButton disabled={busy} onClick={() => act({ type: 'event_claim', idx: m.idx })}>Receber</PrimaryButton></span>}
          </li>
        )
      })}
    </ul>
  )
}
