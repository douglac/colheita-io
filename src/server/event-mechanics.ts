// Mecânicas da Evolução 13 (campos E3–E14): construção com materiais dos amigos,
// presentes pendurados e trancados até a data, objeto que só se completa com ajuda de amigos, calendário de presença,
// oficina com receitas, cartões para amigos, série grátis e bichos de evento. Tudo validado aqui; o conteúdo vem de
// game/event-content.ts e as contas puras de game/events.ts.
import { itemName } from '@/game/catalog'
import { decorName, parsePiece, SLOTS } from '@/game/decor'
import {
  dayOfEvent, EVENT_DEFS, friendItemFor, giftsUnlockAt, seasonOf, type ActiveEvent, type EventDef,
} from '@/game/events'
import type { EventPet, EventReward } from '@/game/event-types'
import { GameError } from '@/game/rules'
import type { Q } from './db'
import { addOwned } from './decor'

type Owner = { id: string; handle: string; is_bot: boolean }

/** Funções de game.ts que as mecânicas usam (ouro com ledger, XP com subida de nível, depósito, Mural). */
export type MechHelpers = {
  addGold: (delta: number, reason: string) => Promise<void>
  addXp: (xp: number) => Promise<void>
  addItem: (userId: string, itemId: string, qty: number) => Promise<void>
  takeItem: (itemId: string, qty: number, missing: string) => Promise<void>
  bumpDaily: (kind: string) => Promise<number>
  event: (userId: string, actorId: string | null, kind: string, payload: Record<string, unknown>) => Promise<void>
  progress: (kind: string, by?: number) => Promise<number>
}

// ---------- prêmios ----------

const PET_BY_ID: Record<string, EventPet & { dir: string }> = Object.fromEntries(
  EVENT_DEFS.flatMap((e) => (e.pets ?? []).map((p) => [p.id, { ...p, dir: e.art.dir }])))

/** Dá um item de prêmio: peça de decoração (decor_owned), bicho de evento (`pet:<id>`) ou item do depósito. */
export async function grantItem(q: Q, userId: string, item: string, qty: number, addItem: MechHelpers['addItem']) {
  if (parsePiece(item)) {
    // Peça repetida não acumula (a decoração é "tem ou não tem").
    const has = (await q.query('select 1 from decor_owned where user_id = $1 and item_id = $2 and qty > 0', [userId, item])).rows.length
    if (!has) await addOwned(q, userId, item, 1)
  } else if (item.startsWith('bicho:') && PET_BY_ID[item.slice(6)]) {
    await addOwned(q, userId, `pet:${item.slice(6)}`, qty)
  } else await addItem(userId, item, qty)
}

export const rewardName = (item: string) =>
  parsePiece(item) ? decorName(item) : item.startsWith('bicho:') && PET_BY_ID[item.slice(6)] ? PET_BY_ID[item.slice(6)].name : itemName(item)

/** Paga um prêmio fixo (sem sorteio) e devolve o texto ("+100 de ouro, +40 XP, 2 × Adubo forte"). */
export async function payReward(q: Q, me: Owner, ev: EventDef, r: EventReward, reason: string, h: MechHelpers): Promise<string> {
  if (r.gold) await h.addGold(r.gold, reason)
  if (r.xp) await h.addXp(r.xp)
  if (r.candy && ev.currency) await h.addItem(me.id, ev.currency.id, r.candy)
  for (const [item, qty] of r.items ?? []) await grantItem(q, me.id, item, qty, h.addItem)
  return rewardText(ev, r)
}

export function rewardText(ev: EventDef, r: EventReward): string {
  return [r.gold && `+${r.gold} de ouro`, r.xp && `+${r.xp} XP`, r.candy && ev.currency && `+${r.candy} ${r.candy === 1 ? ev.currency.name.toLowerCase() : ev.currency.plural}`,
    ...(r.items ?? []).map(([item, qty]) => `${qty} × ${rewardName(item)}`)].filter(Boolean).join(', ')
}

// ---------- leitura ----------

async function friendsOrBot(q: Q, meId: string, owner: Owner): Promise<boolean> {
  return owner.is_bot || (await q.query('select 1 from friendships where user_id = $1 and friend_id = $2', [meId, owner.id])).rows.length > 0
}

async function qtyOf(q: Q, userId: string, itemId: string): Promise<number> {
  return (await q.query<{ qty: number }>('select qty from inventory where user_id = $1 and item_id = $2', [userId, itemId])).rows[0]?.qty ?? 0
}

async function progressCount(q: Q, userId: string, ev: EventDef, kind: string): Promise<number> {
  return (await q.query<{ count: number }>('select count from event_progress where user_id = $1 and event_id = $2 and kind = $3', [userId, ev.id, kind])).rows[0]?.count ?? 0
}

type ObjRow = { level: number; cycle: number; started_at: Date | null; claimed: boolean }

async function objectOf(q: Q, ownerId: string, ev: ActiveEvent, object: string, lock = false): Promise<ObjRow> {
  const season = seasonOf(ev)
  await q.query(`insert into event_objects (owner_id, event_id, season, object, started_at) values ($1, $2, $3, $4, now()) on conflict do nothing`,
    [ownerId, ev.def.id, season, object])
  return (await q.query<ObjRow>(`select level, cycle, started_at, claimed from event_objects where owner_id = $1 and event_id = $2 and season = $3 and object = $4${lock ? ' for update' : ''}`,
    [ownerId, ev.def.id, season, object])).rows[0]
}

/** Estado do objeto com ajuda (E4), já com o prazo vencido tratado: sem ajuda suficiente, recomeça do zero ("O monte de
 *  neve está derretendo"); o diário (`daily`) recomeça a cada dia do evento. */
async function helpState(q: Q, ownerId: string, ev: ActiveEvent, now: number, lock = false) {
  const help = ev.def.help!
  const season = seasonOf(ev)
  let o = await objectOf(q, ownerId, ev, help.id, lock)
  const today = dayOfEvent(ev, now)
  const started = o.started_at?.getTime() ?? now
  const helpsIn = async (cycle: number) => Number((await q.query<{ n: number }>(
    `select count(*)::int as n from event_helps where event_id = $1 and season = $2 and owner_id = $3 and object = $4 and turn = $5`,
    [ev.def.id, season, ownerId, help.id, `c:${cycle}`])).rows[0].n)
  let reset: number | null = null
  if (help.daily && o.cycle !== today) reset = today
  else if (!help.daily && (o.claimed || (now > started + help.days * 86400_000 && (await helpsIn(o.cycle)) < help.friends))) reset = o.cycle + 1
  if (reset != null) {
    await q.query(`update event_objects set cycle = $5, started_at = now(), claimed = false where owner_id = $1 and event_id = $2 and season = $3 and object = $4`,
      [ownerId, ev.def.id, season, help.id, reset])
    o = { ...o, cycle: reset, started_at: new Date(now), claimed: false }
  }
  const helps = await helpsIn(o.cycle)
  const deadline = help.daily ? ev.startsAt + today * 86400_000 : (o.started_at?.getTime() ?? now) + help.days * 86400_000
  return { cycle: o.cycle, helps, deadline: Math.min(deadline, ev.endsAt), claimed: o.claimed, turn: `c:${o.cycle}` }
}

async function opened(q: Q, userId: string, ev: EventDef) {
  return progressCount(q, userId, ev, 'opened')
}

export type EventExtrasView = {
  build: {
    level: number; max: number
    next: { item: string; name: string; need: number; have: number }[] | null // o que falta no próximo nível
    prize: EventReward | null
    myItem: string | null; myItemName: string | null // o material que eu mando aos amigos
    canGive: boolean; givenToday: boolean
  } | null
  gifts: {
    unlockAt: number; locked: boolean; slots: number; hung: number; unopened: number
    kinds: { id: string; name: string }[]
    canHang: boolean; hungToday: boolean
    list: { id: number; kind: string; from: string | null; opened: boolean }[]
  } | null
  help: {
    id: string; name: string; friends: number; helps: number; deadline: number; daily: boolean
    locked: boolean; unlockAt: number; ready: boolean; claimed: boolean
    canHelp: boolean; helpedNow: boolean; prize: EventReward
    helpers: string[]
  } | null
  advent: {
    days: number; today: number; signed: number[]; signedToday: boolean; missed: number[]; recoverGold: number
    milestones: { at: number; reward: EventReward; done: boolean }[]
  } | null
  workshop: {
    npc: string; opened: number; diplomaAt: number; hasDiploma: boolean
    recipes: { id: string; name: string; needs: { item: string; name: string; qty: number; have: number }[]; minutes: number; unlockAt: number; unlocked: boolean; eggs: number }[]
    oven: { id: number; recipe: string; readyAt: number } | null
    pieces: { recipe: string; nth: number; piece: string; name: string; owned: boolean }[]
    setDone: boolean
  } | null
  send: { id: string; name: string; charm: number; free: boolean; have: number; sentToday: string[] }[] // sentToday: apelidos que já receberam hoje (item grátis)
  freeSeries: boolean
}

export async function loadExtras(q: Q, ev: ActiveEvent, me: Owner, owner: Owner, isOwn: boolean, day: string, now: number): Promise<EventExtrasView> {
  const def = ev.def
  const season = seasonOf(ev)
  const friend = !isOwn && await friendsOrBot(q, me.id, owner)
  let build: EventExtrasView['build'] = null
  if (def.build) {
    const b = def.build
    const o = await objectOf(q, owner.id, ev, 'build')
    const lvl = b.levels[o.level]
    const next = lvl ? await Promise.all(lvl.needs.map(async ([item, need]) => ({ item, name: itemName(item), need, have: isOwn ? await qtyOf(q, owner.id, item) : 0 }))) : null
    const myItem = friendItemFor(def, me.id)
    const givenToday = !isOwn && (await q.query(`select 1 from event_helps where event_id = $1 and season = $2 and owner_id = $3 and helper_id = $4 and object = 'build' and turn = $5`,
      [def.id, season, owner.id, me.id, `d:${day}`])).rows.length > 0
    build = {
      level: o.level, max: b.levels.length, next, prize: lvl?.prize ?? null,
      myItem, myItemName: myItem ? itemName(myItem) : null,
      canGive: friend && !owner.is_bot && !givenToday && o.level < b.levels.length, givenToday,
    }
  }
  let gifts: EventExtrasView['gifts'] = null
  if (def.gifts && def.build) {
    const g = def.gifts
    const level = (await objectOf(q, owner.id, ev, 'build')).level
    const rows = (await q.query<{ id: number; kind: string; handle: string | null; opened_at: Date | null; day: string }>(
      `select g.id, g.kind, u.handle, g.opened_at, g.day::text as day from event_gifts g left join users u on u.id = g.giver_id
       where g.event_id = $1 and g.season = $2 and g.owner_id = $3 order by g.id`, [def.id, season, owner.id])).rows
    const unlockAt = giftsUnlockAt(ev)
    const hungToday = !isOwn && (await q.query(`select 1 from event_gifts where event_id = $1 and season = $2 and owner_id = $3 and giver_id = $4 and day = $5`,
      [def.id, season, owner.id, me.id, day])).rows.length > 0
    const slots = g.perLevel * level
    gifts = {
      unlockAt, locked: now < unlockAt, slots, hung: rows.length, unopened: rows.filter((r) => !r.opened_at).length,
      kinds: g.kinds.map((k) => ({ id: k, name: itemName(`presente:${k}`) })),
      canHang: friend && !owner.is_bot && !hungToday && rows.length < slots, hungToday,
      list: rows.map((r) => ({ id: Number(r.id), kind: r.kind, from: r.handle, opened: !!r.opened_at })),
    }
  }
  let help: EventExtrasView['help'] = null
  if (def.help) {
    const hp = def.help
    const unlockAt = hp.unlockAt ?? 0
    const locked = unlockAt > 0 && (await opened(q, owner.id, def)) < unlockAt
    const s = await helpState(q, owner.id, ev, now)
    const helpers = (await q.query<{ handle: string }>(
      `select u.handle from event_helps h join users u on u.id = h.helper_id where h.event_id = $1 and h.season = $2 and h.owner_id = $3 and h.object = $4 and h.turn = $5 order by h.id`,
      [def.id, season, owner.id, hp.id, s.turn])).rows.map((r) => r.handle)
    const helpedNow = !isOwn && helpers.includes(me.handle)
    help = {
      id: hp.id, name: hp.name, friends: hp.friends, helps: s.helps, deadline: s.deadline, daily: !!hp.daily,
      locked, unlockAt, ready: s.helps >= hp.friends, claimed: s.claimed,
      canHelp: friend && !locked && !helpedNow && s.helps < hp.friends, helpedNow, prize: hp.prize, helpers,
    }
  }
  let advent: EventExtrasView['advent'] = null
  if (def.advent && isOwn) {
    const a = def.advent
    const today = dayOfEvent(ev, now)
    const signed = (await q.query<{ day: number }>('select day from event_checkins where user_id = $1 and event_id = $2 and season = $3 order by day',
      [me.id, def.id, season])).rows.map((r) => r.day)
    const set = new Set(signed)
    const missed = Array.from({ length: Math.min(a.days, today - 1) }, (_, i) => i + 1).filter((d) => !set.has(d))
    advent = {
      days: a.days, today, signed, signedToday: set.has(today), missed, recoverGold: a.recoverGold,
      milestones: a.milestones.map(([at, reward]) => ({ at, reward, done: signed.length >= at })),
    }
  }
  let workshop: EventExtrasView['workshop'] = null
  if (def.workshop && isOwn) {
    const w = def.workshop
    const n = await opened(q, me.id, def)
    const oven = (await q.query<{ id: number; recipe: string; ready_at: Date }>(
      `select id, recipe, ready_at from event_crafts where user_id = $1 and event_id = $2 and season = $3 and collected_at is null order by id limit 1`,
      [me.id, def.id, season])).rows[0]
    const owned = new Set((await q.query<{ item_id: string }>('select item_id from decor_owned where user_id = $1 and qty > 0', [me.id])).rows.map((r) => r.item_id))
    workshop = {
      npc: w.npc, opened: n, diplomaAt: w.diplomaAt, hasDiploma: (await progressCount(q, me.id, def, 'diploma')) > 0,
      recipes: await Promise.all(w.recipes.map(async (r) => ({
        id: r.id, name: itemName(r.id), minutes: r.minutes, unlockAt: r.unlockAt, unlocked: n >= r.unlockAt, eggs: await qtyOf(q, me.id, r.id),
        needs: await Promise.all(r.needs.map(async ([item, qty]) => ({ item, name: itemName(item), qty, have: await qtyOf(q, me.id, item) }))),
      }))),
      oven: oven ? { id: Number(oven.id), recipe: oven.recipe, readyAt: oven.ready_at.getTime() } : null,
      pieces: w.pieces.map(([recipe, nth, piece]) => ({ recipe, nth, piece, name: decorName(piece), owned: owned.has(piece) })),
      setDone: (await progressCount(q, me.id, def, 'setprize')) > 0,
    }
  }
  // Item grátis: 1 por amigo por dia (o mesmo contador do event_send), para a janela apagar o "Mandar" de quem já recebeu.
  const sentToday = async (sid: string) => (await q.query<{ handle: string }>(
    `select u.handle from daily_counters d join users u on d.kind = $3 || u.id::text where d.user_id = $1 and d.day = $2`,
    [me.id, day, `ev:send:${def.id}:${sid}:`])).rows.map((r) => r.handle)
  const send = await Promise.all((def.send ?? []).map(async (s) => ({
    id: s.id, name: s.name, charm: s.charm, free: !!s.free, have: await qtyOf(q, me.id, s.id), sentToday: s.free ? await sentToday(s.id) : [],
  })))
  return { build, gifts, help, advent, workshop, send, freeSeries: !!def.freeSeries }
}

/** Bichos de evento (E14) de uma fazenda: passeiam o ano todo, como a decoração. */
export async function petsOf(q: Q, ownerId: string): Promise<(EventPet & { dir: string })[]> {
  const { rows } = await q.query<{ item_id: string }>(`select item_id from decor_owned where user_id = $1 and qty > 0 and item_id like 'pet:%'`, [ownerId])
  return rows.map((r) => PET_BY_ID[r.item_id.slice(4)]).filter(Boolean)
}

// ---------- ações ----------

export type MechAction =
  | { type: 'event_build_give'; owner: string } // amigo manda o material dele (1 por dia)
  | { type: 'event_build_up' } // dono sobe um nível
  | { type: 'event_gift_hang'; owner: string; kind: string } // amigo pendura um presente (1 por dia)
  | { type: 'event_gift_open' } // dono abre o próximo presente (só a partir da data)
  | { type: 'event_help'; owner: string } // amigo ajuda o objeto (1 por ciclo)
  | { type: 'event_help_claim' } // dono pega o prêmio com a ajuda completa
  | { type: 'event_checkin' } // assina o dia
  | { type: 'event_checkin_recover' } // recupera o dia perdido mais antigo com ouro
  | { type: 'event_craft'; recipe: string } // põe uma receita na oficina
  | { type: 'event_craft_collect' } // pega o item pronto
  | { type: 'event_open_egg'; recipe: string } // abre um item feito na oficina
  | { type: 'event_send'; to: string; item: string } // manda cartão/presente a um amigo

export const MECH_ACTIONS = new Set<MechAction['type']>(['event_build_give', 'event_build_up', 'event_gift_hang', 'event_gift_open', 'event_help',
  'event_help_claim', 'event_checkin', 'event_checkin_recover', 'event_craft', 'event_craft_collect', 'event_open_egg', 'event_send'])
export const isMechAction = (a: { type: string }): a is MechAction => MECH_ACTIONS.has(a.type as MechAction['type'])

export type MechResult = { message: string; fx?: { gold?: number; xp?: number; item?: string; qty?: number } }

async function ownerByHandle(q: Q, handle: string): Promise<Owner> {
  const o = (await q.query<Owner>('select id, handle, is_bot from users where handle = $1', [String(handle)])).rows[0]
  if (!o) throw new GameError('Fazenda não encontrada')
  return o
}

/** Amigo de verdade (ou vizinho do jogo, quando `bots`): as mecânicas sociais só valem entre amigos. */
async function friendOrThrow(q: Q, me: Owner, owner: Owner, what: string, bots = false) {
  if (owner.id === me.id) throw new GameError(`${what}: isso é para os amigos fazerem na sua fazenda`)
  if (owner.is_bot && !bots) throw new GameError('O vizinho do jogo não participa: chame um amigo de verdade')
  if (!(await friendsOrBot(q, me.id, owner))) throw new GameError(`${what}: só entre amigos. Adicione ${owner.handle} como amigo`)
}

export async function mechAction(q: Q, me: Owner & { level: number }, a: MechAction, ev: ActiveEvent, day: string, now: number, h: MechHelpers): Promise<MechResult> {
  const def = ev.def
  const season = seasonOf(ev)
  switch (a.type) {
    case 'event_build_give': {
      const b = def.build
      if (!b) throw new GameError('Este evento não tem construção')
      const owner = await ownerByHandle(q, a.owner)
      await friendOrThrow(q, me, owner, 'Mandar material')
      const o = await objectOf(q, owner.id, ev, 'build', true)
      if (o.level >= b.levels.length) throw new GameError(`A ${buildName(def)} de ${owner.handle} já está completa`)
      const item = friendItemFor(def, me.id)!
      const first = await q.query(`insert into event_helps (event_id, season, owner_id, helper_id, object, turn, item) values ($1, $2, $3, $4, 'build', $5, $6)
        on conflict do nothing returning id`, [def.id, season, owner.id, me.id, `d:${day}`, item])
      if (!first.rows.length) throw new GameError(`Você já mandou material para ${owner.handle} hoje. Volte amanhã!`)
      await h.addItem(owner.id, item, b.perFriend)
      await h.addXp(2) // prêmio de quem manda
      await h.event(owner.id, me.id, 'event_material', { event: def.id, item, qty: b.perFriend })
      return { message: `Você mandou ${b.perFriend} × ${itemName(item)} para a ${buildName(def)} de ${owner.handle} (+2 XP)`, fx: { xp: 2 } }
    }
    case 'event_build_up': {
      const b = def.build
      if (!b) throw new GameError('Este evento não tem construção')
      const o = await objectOf(q, me.id, ev, 'build', true)
      const lvl = b.levels[o.level]
      if (!lvl) throw new GameError(`Sua ${buildName(def)} já está completa`)
      for (const [item, need] of lvl.needs) {
        if ((await qtyOf(q, me.id, item)) < need) {
          throw new GameError(b.friendItems.includes(item)
            ? `Faltam ${itemName(item).toLowerCase()}s (${need}): peça mais materiais de decoração para seus amigos`
            : `Falta ${itemName(item).toLowerCase()}: consiga na Troca do evento`)
        }
      }
      for (const [item, need] of lvl.needs) await h.takeItem(item, need, `Falta ${itemName(item)}`)
      await q.query(`update event_objects set level = level + 1 where owner_id = $1 and event_id = $2 and season = $3 and object = 'build'`, [me.id, def.id, season])
      await h.progress('build')
      const prize = await payReward(q, me, def, lvl.prize, `event:${def.id}:build:${o.level + 1}`, h)
      const more = def.gifts && o.level + 1 < b.levels.length ? ` Você receberá mais ${def.gifts.perLevel} presentes após aprimorar.` : ''
      return { message: `${buildName(def)} no nível ${o.level + 1}! ${prize}.${more}`, fx: { gold: lvl.prize.gold, xp: lvl.prize.xp } }
    }
    case 'event_gift_hang': {
      const g = def.gifts
      if (!g) throw new GameError('Este evento não tem presentes')
      if (!g.kinds.includes(a.kind)) throw new GameError('Presente desconhecido')
      const owner = await ownerByHandle(q, a.owner)
      await friendOrThrow(q, me, owner, 'Pendurar presente')
      const level = (await objectOf(q, owner.id, ev, 'build', true)).level
      if (level < 1) throw new GameError(`${owner.handle} ainda não montou a ${buildName(def)}: com a árvore pronta, ela recebe presentes`)
      const hung = Number((await q.query<{ n: number }>('select count(*)::int as n from event_gifts where event_id = $1 and season = $2 and owner_id = $3',
        [def.id, season, owner.id])).rows[0].n)
      if (hung >= g.perLevel * level) throw new GameError(`A ${buildName(def)} de ${owner.handle} está cheia de presentes até ela aprimorar`)
      const ins = await q.query(`insert into event_gifts (event_id, season, owner_id, giver_id, kind, day) values ($1, $2, $3, $4, $5, $6)
        on conflict do nothing returning id`, [def.id, season, owner.id, me.id, a.kind, day])
      if (!ins.rows.length) throw new GameError(`Você já pendurou um presente para ${owner.handle} hoje. Volte amanhã!`)
      await h.addXp(2)
      await h.event(owner.id, me.id, 'event_gift', { event: def.id, kind: a.kind })
      return { message: `Você pendurou ${itemName(`presente:${a.kind}`)} na ${buildName(def)} de ${owner.handle}. Abre no Natal! (+2 XP)`, fx: { xp: 2 } }
    }
    case 'event_gift_open': {
      const g = def.gifts
      if (!g) throw new GameError('Este evento não tem presentes')
      if (now < giftsUnlockAt(ev)) throw new GameError('Você não pode abrir os presentes até o Natal.')
      const gift = (await q.query<{ id: number; kind: string; handle: string | null }>(
        `select g.id, g.kind, u.handle from event_gifts g left join users u on u.id = g.giver_id
         where g.event_id = $1 and g.season = $2 and g.owner_id = $3 and g.opened_at is null order by g.id limit 1 for update of g`,
        [def.id, season, me.id])).rows[0]
      if (!gift) throw new GameError('Nenhum presente fechado na árvore. Peça aos amigos para pendurar!')
      await q.query('update event_gifts set opened_at = now() where id = $1', [gift.id])
      await h.progress('open')
      const prize = await payReward(q, me, def, g.prize, `event:${def.id}:gift`, h)
      return { message: `Você abriu ${itemName(`presente:${gift.kind}`)}${gift.handle ? ` de ${gift.handle}` : ''}: ${prize}`, fx: { gold: g.prize.gold, xp: g.prize.xp } }
    }
    case 'event_help': {
      const hp = def.help
      if (!hp) throw new GameError('Este evento não tem ajuda de amigos')
      const owner = await ownerByHandle(q, a.owner)
      await friendOrThrow(q, me, owner, 'Ajudar', true)
      if (hp.unlockAt && (await opened(q, owner.id, def)) < hp.unlockAt) throw new GameError(`O ${hp.name.toLowerCase()} de ${owner.handle} ainda não apareceu`)
      await objectOf(q, owner.id, ev, hp.id, true)
      const s = await helpState(q, owner.id, ev, now)
      if (s.helps >= hp.friends) throw new GameError(`O ${hp.name.toLowerCase()} de ${owner.handle} já tem ajuda suficiente`)
      const ins = await q.query(`insert into event_helps (event_id, season, owner_id, helper_id, object, turn) values ($1, $2, $3, $4, $5, $6)
        on conflict do nothing returning id`, [def.id, season, owner.id, me.id, hp.id, s.turn])
      if (!ins.rows.length) throw new GameError(`Você já ajudou o ${hp.name.toLowerCase()} de ${owner.handle}`)
      await h.addXp(5)
      await h.progress('help')
      if (!owner.is_bot) await h.event(owner.id, me.id, 'event_help', { event: def.id, object: hp.id, helps: s.helps + 1, friends: hp.friends })
      return { message: `Você ajudou o ${hp.name.toLowerCase()} de ${owner.handle} (${s.helps + 1}/${hp.friends}) · +5 XP`, fx: { xp: 5 } }
    }
    case 'event_help_claim': {
      const hp = def.help
      if (!hp) throw new GameError('Este evento não tem ajuda de amigos')
      await objectOf(q, me.id, ev, hp.id, true)
      const s = await helpState(q, me.id, ev, now)
      if (s.claimed) throw new GameError('Prêmio já recebido')
      if (s.helps < hp.friends) throw new GameError(`Você precisa da ajuda de ${hp.friends} amigos (${s.helps}/${hp.friends})`)
      await q.query(`update event_objects set claimed = true where owner_id = $1 and event_id = $2 and season = $3 and object = $4`, [me.id, def.id, season, hp.id])
      await h.progress('help:abrir')
      const prize = await payReward(q, me, def, hp.prize, `event:${def.id}:help`, h)
      return { message: `${hp.name} pronto com a ajuda dos amigos! ${prize}`, fx: { gold: hp.prize.gold, xp: hp.prize.xp } }
    }
    case 'event_checkin':
    case 'event_checkin_recover': {
      const adv = def.advent
      if (!adv) throw new GameError('Este evento não tem calendário')
      const today = dayOfEvent(ev, now)
      let target = today
      if (a.type === 'event_checkin_recover') {
        const signed = new Set((await q.query<{ day: number }>('select day from event_checkins where user_id = $1 and event_id = $2 and season = $3',
          [me.id, def.id, season])).rows.map((r) => r.day))
        const miss = Array.from({ length: Math.min(adv.days, today - 1) }, (_, i) => i + 1).find((d) => !signed.has(d))
        if (!miss) throw new GameError('Nenhum dia perdido para recuperar')
        target = miss
        await h.addGold(-adv.recoverGold, `event:${def.id}:recover`)
      } else if (today > adv.days) throw new GameError(`O calendário tem ${adv.days} dias: já acabou`)
      const ins = await q.query(`insert into event_checkins (user_id, event_id, season, day, paid) values ($1, $2, $3, $4, $5) on conflict do nothing returning day`,
        [me.id, def.id, season, target, a.type === 'event_checkin_recover'])
      if (!ins.rows.length) throw new GameError('Você já assinou hoje. Volte amanhã!')
      await h.progress('checkin')
      const count = Number((await q.query<{ n: number }>('select count(*)::int as n from event_checkins where user_id = $1 and event_id = $2 and season = $3',
        [me.id, def.id, season])).rows[0].n)
      const ms = adv.milestones.find(([at]) => at === count)
      const next = adv.milestones.find(([at]) => at > count)
      let msg = a.type === 'event_checkin_recover' ? `Dia ${target} recuperado (−${adv.recoverGold} de ouro). ` : ''
      msg += `Você já assinou ${count}.`
      if (ms) msg += ` Prêmio das ${ms[0]} meias: ${await payReward(q, me, def, ms[1], `event:${def.id}:advent:${ms[0]}`, h)}`
      else if (next) msg += ` Ainda falta ${next[0] - count} ${next[0] - count === 1 ? 'vez' : 'vezes'}, e você poderá retirar.`
      return { message: msg, fx: ms ? { gold: ms[1].gold, xp: ms[1].xp } : a.type === 'event_checkin_recover' ? { gold: -adv.recoverGold } : undefined }
    }
    case 'event_craft': {
      const w = def.workshop
      const r = w?.recipes.find((x) => x.id === a.recipe)
      if (!w || !r) throw new GameError('Receita desconhecida')
      const n = await opened(q, me.id, def)
      if (n < r.unlockAt) throw new GameError(`${itemName(r.id)} libera com ${r.unlockAt} ovos abertos (você abriu ${n})`)
      const busy = (await q.query(`select 1 from event_crafts where user_id = $1 and event_id = $2 and season = $3 and collected_at is null`, [me.id, def.id, season])).rows.length
      if (busy) throw new GameError('A oficina já está fazendo um item: pegue esse primeiro')
      for (const [item, qty] of r.needs) {
        if ((await qtyOf(q, me.id, item)) < qty) throw new GameError(`Traga materiais e eu criarei Ovos de Páscoa! Falta ${itemName(item).toLowerCase()} (${qty})`)
      }
      for (const [item, qty] of r.needs) await h.takeItem(item, qty, `Falta ${itemName(item)}`)
      await q.query('insert into event_crafts (user_id, event_id, season, recipe, ready_at) values ($1, $2, $3, $4, $5)',
        [me.id, def.id, season, r.id, new Date(now + r.minutes * 60_000)])
      return { message: `${itemName(r.id)} na oficina: fica pronto em ${r.minutes} min` }
    }
    case 'event_craft_collect': {
      const c = (await q.query<{ id: number; recipe: string; ready_at: Date }>(
        `select id, recipe, ready_at from event_crafts where user_id = $1 and event_id = $2 and season = $3 and collected_at is null order by id limit 1 for update`,
        [me.id, def.id, season])).rows[0]
      if (!c) throw new GameError('Nada na oficina')
      if (c.ready_at.getTime() > now) throw new GameError(`Ainda não ficou pronto: faltam ${Math.ceil((c.ready_at.getTime() - now) / 60_000)} min`)
      await q.query('update event_crafts set collected_at = now() where id = $1', [c.id])
      await h.addItem(me.id, c.recipe, 1)
      await h.progress('craft')
      await h.progress(`craft:${c.recipe}`)
      return { message: `Pronto: 1 × ${itemName(c.recipe)}. Abra para ganhar o prêmio!`, fx: { item: c.recipe, qty: 1 } }
    }
    case 'event_open_egg': {
      const w = def.workshop
      const r = w?.recipes.find((x) => x.id === a.recipe)
      if (!w || !r) throw new GameError('Receita desconhecida')
      await h.takeItem(r.id, 1, `Você não tem ${itemName(r.id)}: faça na oficina`)
      const total = await h.progress('opened')
      const mine = await h.progress(`opened:${r.id}`)
      await h.progress('open')
      const parts = [await payReward(q, me, def, r.open, `event:${def.id}:open:${r.id}`, h)]
      // Peça de decoração no N-ésimo ovo daquele nível (sem sorte).
      for (const [rid, nth, piece] of w.pieces) {
        if (rid === r.id && nth === mine) {
          await grantItem(q, me.id, piece, 1, h.addItem)
          await h.progress('open:peca')
          parts.push(`ganhou ${decorName(piece)}!`)
        }
      }
      const owned = new Set((await q.query<{ item_id: string }>('select item_id from decor_owned where user_id = $1 and qty > 0', [me.id])).rows.map((x) => x.item_id))
      if (w.pieces.every(([, , p]) => owned.has(p)) && (await h.progress('setprize')) === 1) {
        parts.push(`conjunto completo: ${await payReward(q, me, def, w.setPrize, `event:${def.id}:set`, h)}`)
      }
      if (total === w.diplomaAt) {
        await h.progress('diploma')
        await h.addItem(me.id, `diploma_${def.id}`, 1)
        parts.push('você ganhou o diploma! Os amigos não conseguem ver o diploma.')
      }
      const unlocked = w.recipes.find((x) => x.unlockAt === total && x.unlockAt > 0)
      if (unlocked) parts.push(`Parabéns! Você abriu ${total} ovos. Você pode fazer ${itemName(unlocked.id)} agora!`)
      if (def.help?.unlockAt === total) parts.push(`O ${def.help.name} apareceu: peça ajuda aos amigos!`)
      return { message: `Abriu ${itemName(r.id)}: ${parts.join(' · ')}`, fx: { gold: r.open.gold, xp: r.open.xp } }
    }
    case 'event_send': {
      const s = def.send?.find((x) => x.id === a.item)
      if (!s) throw new GameError('Esse item não se manda')
      const to = await ownerByHandle(q, a.to)
      await friendOrThrow(q, me, to, 'Mandar', true)
      if (s.free) {
        if ((await h.bumpDaily(`ev:send:${def.id}:${s.id}:${to.id}`)) > 1) throw new GameError(`Você já mandou ${s.name.toLowerCase()} para ${to.handle} hoje`)
      } else await h.takeItem(s.id, 1, `Você não tem ${s.name.toLowerCase()}: consiga na Troca do evento`)
      if (s.charm > 0) await q.query('update users set popularity = popularity + $2 where id = $1', [to.id, s.charm])
      else await h.addItem(to.id, s.id, 1)
      await h.progress('send')
      if (!to.is_bot) await h.event(to.id, me.id, 'event_card', { event: def.id, item: s.id, name: s.name, charm: s.charm })
      return { message: `${s.name} entregue a ${to.handle}${s.charm > 0 ? `: +${s.charm} de popularidade para ${to.handle}` : ''}`, fx: s.free ? undefined : { item: s.id, qty: -1 } }
    }
  }
}

const buildName = (def: EventDef) => (def.id === 'natal' ? 'árvore de Natal' : 'construção')

// ---------- ganchos ----------

/** Entrou na própria fazenda no evento com série grátis (E10): ganha as peças que faltam, uma vez por ano. */
export async function grantFreeSeries(q: Q, me: Owner, ev: ActiveEvent, progress: (kind: string) => Promise<number>, event: MechHelpers['event']): Promise<boolean> {
  if (!ev.def.freeSeries) return false
  if ((await progress(`free_series:${seasonOf(ev)}`)) !== 1) return false
  for (const series of ev.def.series) for (const slot of SLOTS) await grantItem(q, me.id, `${slot}:${series}`, 1, async () => {})
  await event(me.id, null, 'event_free_series', { event: ev.def.id, series: ev.def.series })
  return true
}
