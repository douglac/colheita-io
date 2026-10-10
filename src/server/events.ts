// Eventos sazonais no servidor (Evolução 09): qual evento está valendo (calendário ou atalho de QA), a tigela
// de doces social, a troca de doces, os visitantes e as missões do evento. Tudo validado aqui; as contas puras
// ficam em game/events.ts e o conteúdo em game/event-content.ts.
import { itemName, SEED_BY_ID } from '@/game/catalog'
import { decorName, parsePiece } from '@/game/decor'
import {
  activeEvent, bowlLook, EVENT_BY_ID, eventClockShift, missionChain, missionKey, type ActiveEvent, type BowlLook, type EventDef, type EventMissionView, type EventOverride,
} from '@/game/events'
import type { EventBannerText, EventTrade } from '@/game/event-types'
import { GameError } from '@/game/rules'
import type { Q } from './db'
import { addOwned } from './decor'
import { grantFreeSeries, grantItem, isMechAction, loadExtras, MECH_ACTIONS, mechAction, type EventExtrasView, type MechAction } from './event-mechanics'

export const OVERRIDE_KEY = 'event_override'

export async function loadOverride(q: Q): Promise<EventOverride | null> {
  const { rows } = await q.query<{ value: EventOverride }>('select value from game_flags where key = $1', [OVERRIDE_KEY])
  return rows[0]?.value ?? null
}

/** Grava (ou apaga, com null) o atalho de QA do evento. */
export async function saveOverride(q: Q, o: EventOverride | null) {
  if (!o) await q.query('delete from game_flags where key = $1', [OVERRIDE_KEY])
  else {
    await q.query(`insert into game_flags (key, value, updated_at) values ($1, $2, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()`, [OVERRIDE_KEY, JSON.stringify(o)])
  }
}

/** EVENT_NOW=2026-12-20 (QA, só em desenvolvimento): o calendário finge que hoje é esse dia. Em produção é ignorado. */
export function eventNowShift(now: number, env: Record<string, string | undefined> = process.env): number {
  if (env.NODE_ENV === 'production') return 0
  return eventClockShift(env.EVENT_NOW, now)
}

export async function currentEvent(q: Q, now: number): Promise<ActiveEvent | null> {
  return activeEvent(now, await loadOverride(q), undefined, eventNowShift(now))
}

// ---------- o que vai para a tela ----------

export type EventTradeView = EventTrade & { name: string; owned: boolean }
export type EventView = {
  id: string; name: string; tagline: string; icon: string; banner: string; bannerText: EventBannerText; dir: string; bowlArt: string
  startsAt: number; endsAt: number; seedsUntil: number; forced: boolean
  seeds: string[]; series: string[]
  currency: EventDef['currency']; candies: number // doces de quem está jogando
  bowl: {
    candies: number; capacity: number; look: BowlLook
    prizeReady: boolean // dono: os amigos esvaziaram a tigela, o prêmio espera o toque
    refillItem: string; refills: number // dono: pacotes de doces no depósito
    prize: { gold: number; xp: number; items: [string, number][] }
    canTake: boolean; takenToday: boolean; takesLeft: number // visitante
    takers: { handle: string; at: number }[] // dono: quem pegou hoje
  } | null
  critters: { left: number; kinds: { id: string; name: string; line: string }[]; gold: number; xp: number } | null
  trades: EventTradeView[]
  missions: EventMissionView[]
} & EventExtrasView

type Owner = { id: string; handle: string; is_bot: boolean }
type Me = { id: string; level: number }

const counterKind = (ev: EventDef, what: string) => `ev:${what}:${ev.id}`

async function daily(q: Q, userId: string, day: string, kind: string): Promise<number> {
  return (await q.query<{ count: number }>('select count from daily_counters where user_id = $1 and day = $2 and kind = $3', [userId, day, kind])).rows[0]?.count ?? 0
}

async function progressOf(q: Q, userId: string, ev: EventDef): Promise<Map<string, number>> {
  const { rows } = await q.query<{ kind: string; count: number }>('select kind, count from event_progress where user_id = $1 and event_id = $2', [userId, ev.id])
  return new Map(rows.map((r) => [r.kind, r.count]))
}

export async function bumpProgress(q: Q, userId: string, ev: EventDef, kind: string, by = 1): Promise<number> {
  const { rows } = await q.query<{ count: number }>(
    `insert into event_progress (user_id, event_id, kind, count) values ($1, $2, $3, $4)
     on conflict (user_id, event_id, kind) do update set count = event_progress.count + excluded.count returning count`, [userId, ev.id, kind, by])
  return rows[0].count
}

type Bowl = { candies: number; prize_ready: boolean }

/** Tigela (travada para escrita quando `lock`). A 1ª de cada fazenda já vem cheia, de graça;
 *  a do vizinho do jogo (bot) amanhece cheia todo dia. */
async function bowlOf(q: Q, owner: Owner, ev: EventDef, day: string, lock = false): Promise<Bowl> {
  if (!ev.bowl) return { candies: 0, prize_ready: false }
  await q.query(`insert into event_bowls (owner_id, event_id, candies, filled_at) values ($1, $2, $3, now()) on conflict do nothing`,
    [owner.id, ev.id, ev.bowl.capacity])
  if (owner.is_bot) {
    await q.query(`update event_bowls set candies = $3, filled_at = now() where owner_id = $1 and event_id = $2
      and (filled_at at time zone 'America/Sao_Paulo')::date < $4::date`, [owner.id, ev.id, ev.bowl.capacity, day])
  }
  const { rows } = await q.query<Bowl>(
    `select candies, prize_ready from event_bowls where owner_id = $1 and event_id = $2${lock ? ' for update' : ''}`, [owner.id, ev.id])
  return rows[0]
}

async function friendsOrBot(q: Q, meId: string, owner: Owner): Promise<boolean> {
  return owner.is_bot || (await q.query('select 1 from friendships where user_id = $1 and friend_id = $2', [meId, owner.id])).rows.length > 0
}

async function qtyOf(q: Q, userId: string, itemId: string): Promise<number> {
  return (await q.query<{ qty: number }>('select qty from inventory where user_id = $1 and item_id = $2', [userId, itemId])).rows[0]?.qty ?? 0
}

export async function loadEventView(q: Q, active: ActiveEvent | null, me: Me & { handle: string; is_bot: boolean }, owner: Owner, isOwn: boolean, day: string, now = Date.now()): Promise<EventView | null> {
  if (!active) return null
  const ev = active.def
  const candies = ev.currency ? await qtyOf(q, me.id, ev.currency.id) : 0
  let bowl: EventView['bowl'] = null
  if (ev.bowl) {
    const b = await bowlOf(q, owner, ev, day)
    const inBowl = b.candies
    const takenToday = !isOwn && (await q.query('select 1 from event_takes where event_id = $1 and owner_id = $2 and taker_id = $3 and day = $4',
      [ev.id, owner.id, me.id, day])).rows.length > 0
    const takesLeft = Math.max(0, ev.bowl.takerDaily - await daily(q, me.id, day, counterKind(ev, 'take')))
    const takers = isOwn ? (await q.query<{ handle: string; created_at: Date }>(
      `select u.handle, t.created_at from event_takes t join users u on u.id = t.taker_id
       where t.event_id = $1 and t.owner_id = $2 and t.day = $3 order by t.id desc limit 20`, [ev.id, owner.id, day])).rows : []
    bowl = {
      candies: inBowl, capacity: ev.bowl.capacity, look: bowlLook(inBowl, ev.bowl.capacity),
      prizeReady: isOwn && b.prize_ready, refillItem: ev.bowl.refillItem, refills: isOwn ? await qtyOf(q, me.id, ev.bowl.refillItem) : 0,
      prize: ev.bowl.prize,
      canTake: !isOwn && inBowl > 0 && !takenToday && takesLeft > 0 && await friendsOrBot(q, me.id, owner),
      takenToday, takesLeft,
      takers: takers.map((t) => ({ handle: t.handle, at: t.created_at.getTime() })),
    }
  }
  // Visitantes: cada fazenda tem os do dia; o dono espanta (quem visita só vê).
  const critters = ev.critters ? {
    left: Math.max(0, ev.critters.perDay - await daily(q, owner.id, day, counterKind(ev, 'shoo'))),
    kinds: ev.critters.kinds, gold: ev.critters.gold, xp: ev.critters.xp,
  } : null
  const progress = await progressOf(q, me.id, ev)
  const owned = new Set((await q.query<{ item_id: string }>('select item_id from decor_owned where user_id = $1 and qty > 0', [me.id])).rows.map((r) => r.item_id))
  return {
    id: ev.id, name: ev.name, tagline: ev.tagline, icon: ev.art.icon, banner: ev.art.banner, bannerText: ev.art.text, dir: ev.art.dir, bowlArt: ev.art.bowl ?? 'tigela',
    startsAt: active.startsAt, endsAt: active.endsAt, seedsUntil: active.seedsUntil, forced: active.forced,
    seeds: ev.seeds, series: ev.series, currency: ev.currency, candies, bowl, critters,
    trades: ev.trades.map((t) => ({ ...t, name: t.kind === 'decor' ? decorName(t.item) : itemName(t.item), owned: t.kind === 'decor' && owned.has(t.item) })),
    missions: missionChain(ev, (k) => progress.get(k) ?? 0, (i) => (progress.get(`claim:${i}`) ?? 0) > 0),
    ...await loadExtras(q, active, me, owner, isOwn, day, now),
  }
}

// ---------- ações ----------

export type EventAction =
  | { type: 'event_fill' }
  | { type: 'event_prize' }
  | { type: 'event_take'; owner: string }
  | { type: 'event_trade'; trade: string }
  | { type: 'event_claim'; idx: number }
  | { type: 'event_shoo'; n?: number }
  | MechAction

export const EVENT_ACTIONS = new Set<EventAction['type']>(['event_fill', 'event_prize', 'event_take', 'event_trade', 'event_claim', 'event_shoo', ...MECH_ACTIONS])
export const isEventAction = (a: { type: string }): a is EventAction => EVENT_ACTIONS.has(a.type as EventAction['type']) || isMechAction(a)

/** Funções de game.ts (ouro com ledger, XP com subida de nível, depósito, contador do dia e Mural). */
export type EventHelpers = {
  addGold: (delta: number, reason: string) => Promise<void>
  addXp: (xp: number) => Promise<void>
  addItem: (userId: string, itemId: string, qty: number) => Promise<void>
  takeItem: (itemId: string, qty: number, missing: string) => Promise<void>
  bumpDaily: (kind: string) => Promise<number>
  event: (userId: string, actorId: string | null, kind: string, payload: Record<string, unknown>) => Promise<void>
}
export type EventResult = { message: string; fx?: { gold?: number; xp?: number; item?: string; qty?: number }; bad?: boolean }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export async function eventAction(q: Q, me: Owner & Me, a: EventAction, day: string, now: number, h: EventHelpers): Promise<EventResult> {
  const active = await currentEvent(q, now)
  if (!active) throw new GameError('Não há evento agora')
  const ev = active.def
  if (isMechAction(a)) return mechAction(q, me, a, active, day, now, { ...h, progress: (kind, by = 1) => bumpProgress(q, me.id, ev, kind, by) })
  const curOrNull = ev.currency
  const cur = curOrNull ?? { id: '', name: '', plural: '', icon: '', emoji: '' }
  if (!curOrNull && a.type !== 'event_claim' && a.type !== 'event_shoo') throw new GameError('Este evento não tem troca nem tigela')
  switch (a.type) {
    case 'event_fill': {
      // Encher a tigela de doces consome 1 pacote de doces.
      if (!ev.bowl) throw new GameError('Este evento não tem tigela')
      const b = await bowlOf(q, me, ev, day, true)
      if (b.prize_ready) throw new GameError('Pegue primeiro o prêmio da tigela')
      if (b.candies >= ev.bowl.capacity) throw new GameError('A tigela já está cheia')
      await h.takeItem(ev.bowl.refillItem, 1, `Encher a tigela consome 1 ${itemName(ev.bowl.refillItem).toLowerCase()}: compre na loja (Ferramentas)`)
      await q.query('update event_bowls set candies = $3, filled_at = now() where owner_id = $1 and event_id = $2', [me.id, ev.id, ev.bowl.capacity])
      await bumpProgress(q, me.id, ev, 'fill')
      return { message: `Tigela cheia: ${ev.bowl.capacity} ${cur.plural} esperando os amigos ${cur.emoji}`, fx: { item: ev.bowl.refillItem, qty: -1 } }
    }
    case 'event_prize': {
      // "O amigo compartilhou o seu doce, clique na tigela de doce para obter o prêmio." Prêmio fixo (sem sorteio).
      if (!ev.bowl) throw new GameError('Este evento não tem tigela')
      const b = await bowlOf(q, me, ev, day, true)
      if (!b.prize_ready) throw new GameError(b.candies > 0 ? 'Os amigos ainda não esvaziaram a tigela' : 'Prêmio já recebido: encha a tigela de novo')
      await q.query('update event_bowls set prize_ready = false where owner_id = $1 and event_id = $2', [me.id, ev.id])
      const p = ev.bowl.prize
      if (p.gold) await h.addGold(p.gold, `event:${ev.id}:bowl`)
      if (p.xp) await h.addXp(p.xp)
      for (const [item, qty] of p.items) await h.addItem(me.id, item, qty)
      const items = p.items.map(([item, qty]) => `${qty} × ${itemName(item)}`).join(', ')
      return { message: `Os amigos esvaziaram a sua tigela! Prêmio: +${p.gold} de ouro, +${p.xp} XP, ${items}`, fx: { gold: p.gold, xp: p.xp } }
    }
    case 'event_take': {
      if (!ev.bowl) throw new GameError('Este evento não tem tigela')
      const owner = (await q.query<Owner>('select id, handle, is_bot from users where handle = $1', [String(a.owner)])).rows[0]
      if (!owner) throw new GameError('Fazenda não encontrada')
      if (owner.id === me.id) throw new GameError('Os doces da sua tigela são para os amigos')
      if (!(await friendsOrBot(q, me.id, owner))) throw new GameError('Só amigos pegam doce da tigela')
      const inBowl = (await bowlOf(q, owner, ev, day, true)).candies
      if (inBowl <= 0) throw new GameError(`A tigela de ${owner.handle} está vazia`)
      const first = await q.query(`insert into event_takes (event_id, owner_id, taker_id, day) values ($1, $2, $3, $4)
        on conflict do nothing returning id`, [ev.id, owner.id, me.id, day])
      if (!first.rows.length) throw new GameError(`Você já pegou um doce de ${owner.handle} hoje. Volte amanhã!`)
      if ((await h.bumpDaily(counterKind(ev, 'take'))) > ev.bowl.takerDaily) throw new GameError(`Limite de ${ev.bowl.takerDaily} ${cur.plural} por dia`)
      // A última bala deixa o prêmio do dono esperando (só fazenda de gente: a do vizinho do jogo se enche sozinha).
      await q.query('update event_bowls set candies = candies - 1, prize_ready = (candies = 1 and $3::boolean) where owner_id = $1 and event_id = $2',
        [owner.id, ev.id, !owner.is_bot])
      await h.addItem(me.id, cur.id, 1)
      await h.addXp(ev.bowl.takeXp)
      await bumpProgress(q, me.id, ev, 'take')
      if (!owner.is_bot) await h.event(owner.id, me.id, 'bowl_taken', { event: ev.id, left: inBowl - 1 })
      return { message: `Você pegou 1 ${cur.name.toLowerCase()} da tigela de ${owner.handle} (+${ev.bowl.takeXp} XP)`, fx: { xp: ev.bowl.takeXp, item: cur.id, qty: 1 } }
    }
    case 'event_shoo': {
      if (!ev.critters) throw new GameError('Não há visitantes neste evento')
      if ((await h.bumpDaily(counterKind(ev, 'shoo'))) > ev.critters.perDay) throw new GameError('Os visitantes de hoje já foram embora')
      await h.addGold(ev.critters.gold, `event:${ev.id}:shoo`)
      await h.addXp(ev.critters.xp)
      await bumpProgress(q, me.id, ev, 'shoo')
      return { message: `Visitante espantado! +${ev.critters.gold} de ouro, +${ev.critters.xp} XP`, fx: { gold: ev.critters.gold, xp: ev.critters.xp } }
    }
    case 'event_trade': {
      const t = ev.trades.find((x) => x.id === a.trade)
      if (!t) throw new GameError('Troca desconhecida')
      if (t.kind === 'decor') {
        if (!parsePiece(t.item)) throw new GameError('Peça desconhecida')
        if ((await q.query('select 1 from decor_owned where user_id = $1 and item_id = $2 and qty > 0', [me.id, t.item])).rows.length) {
          throw new GameError('Você já tem essa peça: equipe em Depósito > Minha decoração')
        }
      }
      await h.takeItem(cur.id, t.give, `Faltam ${cur.plural}: a troca pede ${t.give}`)
      if (t.kind === 'decor') await addOwned(q, me.id, t.item, 1)
      else await h.addItem(me.id, t.item, t.qty)
      await bumpProgress(q, me.id, ev, 'trade')
      const name = t.kind === 'decor' ? decorName(t.item) : itemName(t.item)
      return { message: `Trocou ${plural(t.give, cur.name.toLowerCase(), cur.plural)} por ${t.qty} × ${name}`, fx: { item: cur.id, qty: -t.give } }
    }
    case 'event_claim': {
      const idx = Number(a.idx)
      const m = ev.missions[idx]
      if (!Number.isInteger(idx) || !m) throw new GameError('Missão inválida')
      const progress = await progressOf(q, me.id, ev)
      for (let i = 0; i < idx; i++) if (!progress.get(`claim:${i}`)) throw new GameError('Termine a missão anterior primeiro')
      if ((progress.get(missionKey(m)) ?? 0) < m.target) throw new GameError('Missão ainda não concluída')
      if ((await bumpProgress(q, me.id, ev, `claim:${idx}`)) > 1) throw new GameError('Recompensa já recebida')
      const r = m.reward
      if (r.gold) await h.addGold(r.gold, `event:${ev.id}:mission:${idx}`)
      if (r.xp) await h.addXp(r.xp)
      if (r.candy && curOrNull) await h.addItem(me.id, cur.id, r.candy)
      for (const [item, qty] of r.items ?? []) await grantItem(q, me.id, item, qty, h.addItem)
      const parts = [r.gold && `+${r.gold} de ouro`, r.xp && `+${r.xp} XP`, r.candy && curOrNull && `+${plural(r.candy, cur.name.toLowerCase(), cur.plural)}`,
        ...(r.items ?? []).map(([item, qty]) => `+${qty} ${(parsePiece(item) ? decorName(item) : itemName(item)).toLowerCase()}`)].filter(Boolean)
      return { message: `Missão "${m.title}" cumprida: ${parts.join(', ')}`, fx: { gold: r.gold, xp: r.xp } }
    }
  }
}

// ---------- ganchos do plantio e da colheita ----------

const seedEvent = (seedId: string) => {
  const id = SEED_BY_ID[seedId]?.event
  return id ? EVENT_BY_ID[id] : undefined
}

/** Plantou: semente do evento em curso conta na missão ("plant" e "plant:<semente>"). */
export async function onEventPlant(q: Q, userId: string, seedId: string, now: number) {
  const active = await currentEvent(q, now)
  if (!active) return
  const ev = active.def
  const mine = seedEvent(seedId)?.id === ev.id
  if (mine) await bumpProgress(q, userId, ev, 'plant')
  if (mine || ev.drops?.some((d) => d.seed === seedId)) await bumpProgress(q, userId, ev, `plant:${seedId}`)
}

/** Colheu: cultura de evento dá os doces dela sempre (a semente é do evento); com o evento valendo, o material
 *  por colheita (E3, de qualquer semente da lista) e a missão ("harvest" e "harvest:<semente>"). */
export async function onEventHarvest(q: Q, userId: string, seedId: string, now: number, addItem: (itemId: string, qty: number) => Promise<void>): Promise<{ item: string; qty: number } | null> {
  const own = seedEvent(seedId)
  let got: { item: string; qty: number } | null = null
  if (own && own.harvestCandy > 0 && own.currency) {
    await addItem(own.currency.id, own.harvestCandy)
    got = { item: own.currency.id, qty: own.harvestCandy }
  }
  const active = await currentEvent(q, now)
  if (!active) return got
  const ev = active.def
  const drop = ev.drops?.find((d) => d.seed === seedId)
  if (drop && ev.currency) {
    await addItem(ev.currency.id, drop.qty)
    got = got?.item === ev.currency.id ? { item: got.item, qty: got.qty + drop.qty } : { item: ev.currency.id, qty: drop.qty }
  }
  if (own?.id === ev.id || drop) {
    await bumpProgress(q, userId, ev, 'harvest')
    await bumpProgress(q, userId, ev, `harvest:${seedId}`)
  }
  return got
}

/** Entrou na própria fazenda: série grátis do evento (E10), uma vez por ano. */
export async function onEventEnter(q: Q, me: Owner, now: number, push: EventHelpers['event']) {
  const active = await currentEvent(q, now)
  if (!active?.def.freeSeries || me.is_bot) return
  await grantFreeSeries(q, me, active, (kind) => bumpProgress(q, me.id, active.def, kind), push)
}

/** Primeira visita do dia a um amigo: conta na missão "visit" do evento em curso. */
export async function onEventVisit(q: Q, userId: string, now: number) {
  const active = await currentEvent(q, now)
  if (active) await bumpProgress(q, userId, active.def, 'visit')
}
