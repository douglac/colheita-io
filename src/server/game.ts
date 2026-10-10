// Ações autoritativas. Cada uma roda numa transação e trava as linhas que altera.
import { flowerItem, itemName, SEED_BY_ID, SEEDS, sellPriceOf, SHOP_BY_ID, seedItem, stageFracs } from '@/game/catalog'
import {
  CARE, CHEST, DOG, DOG_BREEDS, DOG_LEVEL, type StealMode, FERTILIZERS, fertCutMs, GIFT_SEEDS, INVITE, landPrice, LOVE, origHoursMs, PLANT_XP,
  LOGIN_BONUS, MAX_PLOTS, POPULARITY_CAP, SHARE_XP, START_GOLD, START_PLOTS, START_SEEDS, STEAL,
} from '@/game/config'
import {
  careAt, dailyMissions, dailySeed, dogLevel, dogNextLevel, dogPower, effectiveYield, fertilizedNow, GameError, gameDay, growMs, harvestKey, levelForXp,
  plotState, prevDay, nextSeason, salePrice, scheduleCare, seedOrThrow, stageAt, stealDailyCap, stealQty, tapBiteChance, tutorialGrow, viewPlot,
  type MissionKind, type PlotRow, type PlotView,
} from '@/game/rules'
import { DEFAULT_HERD, defaultArea, dropCheck, herdIds, isAnimalId, type AnimalId, type Herd, type HerdKind, type Spots } from '@/game/pasture'
import { dogLooksAway, type Spot } from '@/game/patrol'
import {
  type AnimalRow, type AnimalView, FOOD, feedPortion, feedUntil, foodAt, growTotalMs, isFeed, kindOfSlot, LIVESTOCK, nothingHere, settle,
  foodFullMs, viewAnimal, wrongFood, ACCESSORY_BY_ID, ACCESSORIES, accItem,
} from '@/game/livestock'
import { DOG_AREA, plotPos } from '@/scene/layout'
import type { ScenePlot } from '@/scene/FarmScene'
import { randomBytes } from 'node:crypto'
import { getDb, ms, tx, type Q } from './db'
import { publish } from './hub'
import { notify, type Note } from './push'
import { kickRipe } from './ripe'
import { trackAll, type MetricNote, type SignupOrigin } from './metrics'
import { DECOR_ACTIONS, decorAction, isDecorAction, loadDecor, loadMyDecor, type DecorAction, type DecorView, type MyDecor } from './decor'
import { animalOnOrnament, type Placed } from '@/game/decor-grid'
import { avatarOf, isAvatar, type AvatarId } from '@/game/avatar'
import { bonusEventSeeds, seriesOnSale, shopOpenFor } from '@/game/events'
import { petsOf } from './event-mechanics'
import { currentEvent, EVENT_ACTIONS, eventAction, isEventAction, loadEventView, onEventEnter, onEventHarvest, onEventPlant, onEventVisit, type EventAction, type EventView } from './events'

type UserRow = {
  id: string; handle: string; is_bot: boolean; level: number; xp: number; gold: number; credits: number
  popularity: number; dog: string | null; dog_fed_until: Date | null
  dog_expires_at: Date | null; dog_hungry_warned: Date | null; dog_leaving_warned: boolean; login_day: string | Date | null; login_streak: number
  invite_code: string | null; last_seen_at: Date; created_at: Date; dog_bones: number; herd: Herd | null
  avatar: string | null
}
type AnimalDb = {
  id: string; owner_id: string; slot: string; kind: string; fed_until: Date | null; fed_ms: number | bigint; settled_at: Date
  cycle_from: number | bigint; batch_seq: number; taken: number
}
const toAnimal = (a: AnimalDb): AnimalRow => ({
  id: a.id, slot: a.slot, kind: a.kind, fed_until: ms(a.fed_until), fed_ms: Number(a.fed_ms), settled_at: a.settled_at.getTime(),
  cycle_from: Number(a.cycle_from), batch_seq: a.batch_seq, taken: a.taken,
})
type PlotDb = {
  id: string; idx: number; seed_id: string | null; planted_at: Date | null; ready_at: Date | null
  yield_total: number | null; yield_left: number | null; withered: boolean; sow_seq: number
  season: number; pests: number; weeds: number; dry_at: Date | null; dry_ms: number | bigint; nat_pest_at: Date | null; nat_weed_at: Date | null
  fert_seq: number; fert_stage: number
}

const toRow = (p: PlotDb): PlotRow => ({
  ...p, planted_at: ms(p.planted_at), ready_at: ms(p.ready_at), dry_at: ms(p.dry_at), dry_ms: Number(p.dry_ms),
  nat_pest_at: ms(p.nat_pest_at), nat_weed_at: ms(p.nat_weed_at),
})
const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))
const dayStr = (d: string | Date | null) => (d == null ? null : typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10))

export const HANDLE_RE = /^[a-z0-9_]{3,20}$/

async function lockUser(q: Q, id: string, mode: 'update' | 'no key update' = 'update'): Promise<UserRow> {
  const { rows } = await q.query<UserRow>(`select * from users where id = $1 for ${mode}`, [id])
  if (!rows[0]) throw new GameError('Jogador não encontrado')
  return rows[0]
}

async function lockPlot(q: Q, ownerId: string, idx: number): Promise<PlotDb> {
  const { rows } = await q.query<PlotDb>('select * from plots where owner_id = $1 and idx = $2 for update', [ownerId, idx])
  if (!rows[0]) throw new GameError('Lote inexistente')
  return rows[0]
}

async function addGold(q: Q, user: UserRow, delta: number, reason: string) {
  const balance = user.gold + delta
  // Gasto nunca deixa o saldo negativo. Ganho sempre entra, mesmo com saldo negativo (estorno de compra de ouro).
  if (delta < 0 && balance < 0) throw new GameError(user.gold < 0 ? 'Seu saldo de ouro está negativo por um estorno' : 'Ouro insuficiente', 'no_gold')
  await q.query('update users set gold = $2 where id = $1', [user.id, balance])
  await q.query(
    "insert into ledger (user_id, currency, delta, balance_after, reason, kind) values ($1, 'gold', $2, $3, $4, $5)",
    [user.id, delta, balance, reason, delta < 0 ? 'gasto' : 'ganho'],
  )
  user.gold = balance
}

async function addXp(q: Q, user: UserRow, xp: number) {
  const total = user.xp + xp
  const level = levelForXp(total)
  await q.query('update users set xp = $2, level = $3 where id = $1', [user.id, total, level])
  if (level > user.level) await pushEvent(q, user.id, null, 'level_up', { level })
  user.xp = total
  user.level = level
}

async function addItem(q: Q, userId: string, itemId: string, qty: number) {
  await q.query(
    `insert into inventory (user_id, item_id, qty) values ($1, $2, $3)
     on conflict (user_id, item_id) do update set qty = inventory.qty + excluded.qty`,
    [userId, itemId, qty],
  )
}

async function takeItem(q: Q, userId: string, itemId: string, qty: number, missing: string, code?: string) {
  const { rows } = await q.query<{ qty: number }>(
    'update inventory set qty = qty - $3 where user_id = $1 and item_id = $2 and qty >= $3 returning qty', [userId, itemId, qty])
  if (!rows.length) throw new GameError(missing, code)
}

/** Soma 1 num contador diário e devolve o novo valor. */
async function bumpDaily(q: Q, userId: string, day: string, kind: string, by = 1): Promise<number> {
  const { rows } = await q.query<{ count: number }>(
    `insert into daily_counters (user_id, day, kind, count) values ($1, $2, $3, $4)
     on conflict (user_id, day, kind) do update set count = daily_counters.count + excluded.count returning count`,
    [userId, day, kind, by])
  return rows[0].count
}

const mission = (q: Q, userId: string, day: string, kind: MissionKind) => bumpDaily(q, userId, day, `m:${kind}`)

/** `live`: o que vai no aviso em tempo real, se diferente do que fica no mural. `phone: false`: sem notificação no celular. */
async function pushEvent(q: Q, userId: string, actorId: string | null, kind: string, payload: Record<string, unknown>,
  opts: { live?: Record<string, unknown>; phone?: boolean } = {}) {
  await q.query('insert into events (user_id, actor_id, kind, payload) values ($1, $2, $3, $4)', [userId, actorId, kind, payload])
  const actor = actorId ? (await q.query<{ handle: string }>('select handle from users where id = $1', [actorId])).rows[0]?.handle : null
  const live = opts.live ?? payload
  // Publica só depois do commit seria o ideal; no MVP o atraso é desprezível e o cliente refaz o GET.
  queueMicrotask(() => publish(userId, { kind, payload: actor ? { ...live, actor } : live }))
  if (opts.phone === false) return
  // Notificação no celular para quem não está jogando agora.
  const note = noteFor(kind, actor ?? 'Alguém', payload)
  if (note) queueMicrotask(() => void notify(userId, note).catch(() => {}))
}

/** Aviso de roubo ao dono: todo toque que leva algo aparece em tempo real e no mural. Toques seguidos no mesmo lote
 *  (até STEAL.groupMs) somam numa linha só, que volta ao topo do mural como nova (id novo); depois disso, linha nova.
 *  Antes, o 2º toque num lote já roubado só somava na linha antiga: sem aviso e sem "novo" no mural. */
async function stolenNotice(q: Q, victimId: string, thiefId: string, payload: { key: string; qty: number } & Record<string, unknown>, now: number) {
  const prev = (await q.query<{ payload: { qty?: number } }>(
    `delete from events where id = (select id from events where user_id = $1 and actor_id = $2 and kind = 'stolen' and payload->>'key' = $3
       and created_at > $4 order by id desc limit 1) returning payload`,
    [victimId, thiefId, payload.key, new Date(now - STEAL.groupMs)])).rows[0]
  const total = payload.qty + Number(prev?.payload.qty ?? 0)
  // Celular: 1 notificação por sequência de toques (não a cada unidade).
  await pushEvent(q, victimId, thiefId, 'stolen', { ...payload, qty: total }, { live: payload, phone: !prev })
}

/** Texto da notificação de cada evento (null = não notifica). */
function noteFor(kind: string, who: string, p: Record<string, unknown>): Note | null {
  const seed = SEED_BY_ID[String(p.seedId)]?.name ?? ''
  switch (kind) {
    case 'stolen': return { title: `${who} está roubando sua horta! 😱`, body: `Levou ${p.qty} ${seed}. Corre lá colher o resto (e se vingar).`, tag: 'stolen' }
    case 'sabotaged': return { title: `${who} aprontou na sua horta`, body: p.kind === 'pest' ? 'Soltou uma praga. Tira antes que estrague a colheita!' : 'Plantou erva daninha. Arranca antes que estrague a colheita!', tag: 'sabotaged' }
    case 'bitten': return { title: 'Seu cachorro mordeu um ladrão! 🐕', body: `${who} tentou roubar e deixou ${p.gold} de ouro pra trás.`, tag: 'bitten' }
    case 'gift': return { title: `${who} te mandou um presente 🎁`, body: `1 semente de ${seed}. Planta e manda um de volta!`, tag: 'gift' }
    case 'dog_hungry': return { title: `Seu ${p.breed} está com fome 🦴`, body: p.hours ? `A ração acaba em ${p.hours} h. Sem ração ele dorme e não morde ladrão.` : 'A ração acabou: ele dormiu e não guarda mais a horta.', tag: 'dog' }
    case 'dog_leaving': return { title: `Seu ${p.breed} vai embora logo`, body: `Faltam ${p.hours} h do prazo dele. Depois a horta fica sem guarda.`, tag: 'dog' }
    case 'dog_left': return { title: `Seu ${p.breed} foi embora 🐕`, body: 'O prazo acabou. A loja tem cachorros na aba Animais.', tag: 'dog' }
    case 'flower': return { title: `${who} te deu uma flor 🌻`, body: `+${p.charm ?? 1} de popularidade: suas vendas rendem mais.`, tag: 'flower' }
    case 'friend_joined': return { title: `${who} entrou pelo seu convite! 🎉`, body: `+${p.gold} de ouro pra você${p.dog ? ' e um Vira-lata para guardar a horta' : ''}.`, tag: 'friend' }
    case 'helped': return { title: `${who} ajudou na sua horta`, body: 'Passa lá e retribui a visita 😉', tag: 'helped' }
    case 'event_material': return { title: `${who} mandou material para a sua árvore 🎄`, body: `+${p.qty} × ${itemName(String(p.item))}. Junte e aprimore a árvore!`, tag: 'event' }
    case 'event_gift': return { title: `${who} pendurou um presente na sua árvore 🎁`, body: 'Os presentes abrem no Natal.', tag: 'event' }
    case 'event_help': return { title: `${who} ajudou no seu evento 🤝`, body: `${p.helps}/${p.friends} ajudas.${Number(p.helps) >= Number(p.friends) ? ' Pronto: pegue o prêmio!' : ''}`, tag: 'event' }
    case 'event_card': return { title: `${who} te mandou ${String(p.name).toLowerCase()} 💌`, body: Number(p.charm) > 0 ? `+${p.charm} de popularidade.` : 'Está no seu depósito.', tag: 'event' }
    case 'bowl_taken': return { title: `${who} pegou um doce da sua tigela 🍬`, body: p.left ? `Ainda tem ${p.left} na tigela.` : 'A tigela esvaziou: encha de novo amanhã!', tag: 'event' }
    case 'loved': return { title: `${who} adubou sua horta com carinho 💚`, body: 'Sua planta cresceu mais rápido. Retribui o carinho!', tag: 'loved' }
    default: return null
  }
}

/** Fração da safra que fica com o dono (reserva protegida), por cultura. */
const keepOf = (seedId: string | null) => (seedId ? SEED_BY_ID[seedId]?.ownerKeep : undefined)

async function plantRaw(q: Q, plot: PlotDb, seedId: string, plantedAt: number, tutorial = false) {
  const seed = seedOrThrow(seedId)
  const y = randInt(seed.yieldMin, seed.yieldMax)
  const grow = growMs(seed, tutorial)
  const care = scheduleCare(plantedAt, grow)
  const d = (t: number | null) => (t == null ? null : new Date(t))
  await q.query(
    `update plots set seed_id = $2, planted_at = $3, ready_at = $4, yield_total = $5, yield_left = $5, withered = false,
       sow_seq = sow_seq + 1, season = 1, pests = 0, weeds = 0, dry_at = $6, dry_ms = 0, nat_pest_at = $7, nat_weed_at = $8
     where id = $1`,
    [plot.id, seed.id, new Date(plantedAt), new Date(plantedAt + grow), y, d(care.dry_at), d(care.nat_pest_at), d(care.nat_weed_at)],
  )
}

// ---------- contas ----------

export async function loginOrCreate(handle: string, inviteCode?: string): Promise<string> {
  if (!HANDLE_RE.test(handle)) throw new GameError('Apelido: 3 a 20 letras minúsculas, números ou _')
  await ensureBots()
  return tx(async (q) => {
    const found = await q.query<{ id: string; is_bot: boolean; email: string | null }>('select id, is_bot, email from users where handle = $1', [handle])
    if (found.rows[0]) {
      if (found.rows[0].is_bot) throw new GameError('Esse apelido é de um vizinho do jogo')
      // Conta com e-mail só entra pelo e-mail: o login de teste não pode servir de porta dos fundos.
      if (found.rows[0].email) throw new GameError('Essa fazenda é protegida por e-mail. Entre com o e-mail.')
      return found.rows[0].id
    }
    const id = await createUser(q, handle, false)
    if (inviteCode) await acceptInvite(q, id, inviteCode)
    return id
  })
}

export type AccountProfile = {
  email: string; birthDate: string | null; ageBand: string; guardianConsent: boolean; termsVersion: string
  avatar?: AvatarId | null // rosto escolhido no primeiro acesso (lote Q, A9)
}

/** Cadastro por e-mail (primeiro acesso): apelido único + dados de idade e aceite dos termos. */
export async function registerAccount(handle: string, profile: AccountProfile, inviteCode?: string,
  origin: SignupOrigin = inviteCode ? 'convite' : 'direto',
  finalize?: (q: Q, userId: string) => Promise<void>): Promise<string> {
  if (!HANDLE_RE.test(handle)) throw new GameError('Apelido: 3 a 20 letras minúsculas, números ou _')
  await ensureBots()
  let inviter: string | null = null
  const id = await tx(async (q) => {
    if ((await q.query('select 1 from users where email = $1', [profile.email])).rows.length) {
      throw new GameError('Esse e-mail já tem uma fazenda. Entre com ele.')
    }
    if ((await q.query('select 1 from users where handle = $1', [handle])).rows.length) {
      throw new GameError('Esse apelido já tem dono. Tente outro.', 'handle_taken')
    }
    const id = await createUser(q, handle, false)
    await q.query(
      `update users set email = $2, birth_date = $3, age_band = $4, guardian_consent_at = case when $5 then now() end,
         terms_version = $6, terms_accepted_at = now(), avatar = $7 where id = $1`,
      [id, profile.email, profile.birthDate, profile.ageBand, profile.guardianConsent, profile.termsVersion, profile.avatar ?? null])
    if (inviteCode) inviter = await acceptInvite(q, id, inviteCode)
    // O cadastro por e-mail pode consumir o token e criar a sessão na mesma transação.
    await finalize?.(q, id)
    return id
  })
  // Métricas (server/metrics.ts): a origem da conta e, se o convite valeu, quem convidou.
  // Convite que não valeu (código de ninguém) conta como entrada direta.
  const origem = (origin === 'convite' || origin === 'compartilhar') && !inviter ? 'direto' : origin
  await trackAll(id, [
    { kind: 'signup', ref: inviter, meta: { origem } },
    ...(inviter ? [{ kind: 'invite_accepted' as const, ref: inviter }] : []),
  ])
  return id
}

const newInviteCode = () => Array.from(randomBytes(6), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('')

async function befriend(q: Q, a: string, b: string, via: 'invite' | 'add') {
  const ins = await q.query(
    `insert into friendships (user_id, friend_id, via) values ($1, $2, $3), ($2, $1, $3) on conflict do nothing returning user_id`, [a, b, via])
  return ins.rows.length > 0
}

/** Quem chega por convite vira amigo de quem convidou; os dois ganham bônus. Devolve o id de quem convidou (null: não valeu). */
async function acceptInvite(q: Q, newId: string, code: string): Promise<string | null> {
  const inviter = (await q.query<UserRow>('select * from users where invite_code = $1 and not is_bot for update', [code.toLowerCase()])).rows[0]
  if (!inviter || inviter.id === newId) return null
  if (!(await befriend(q, inviter.id, newId, 'invite'))) return null
  const me = await lockUser(q, newId)
  await addGold(q, me, INVITE.gold, 'invite')
  await addGold(q, inviter, INVITE.gold, 'invite')
  for (const [seedId, qty] of Object.entries(INVITE.seeds)) await addItem(q, newId, seedItem(seedId), qty)
  const invites = Number((await q.query<{ n: number }>(
    "select count(*)::int as n from friendships where user_id = $1 and via = 'invite'", [inviter.id])).rows[0].n)
  const dog = invites === 1 && !inviter.dog
  if (dog) await q.query('update users set dog = $2, dog_fed_until = $3 where id = $1', [inviter.id, 'vira_lata', new Date(Date.now() + DOG.feedMs)])
  await pushEvent(q, inviter.id, newId, 'friend_joined', { gold: INVITE.gold, dog })
  return inviter.id
}

async function createUser(q: Q, handle: string, isBot: boolean): Promise<string> {
  const { rows } = await q.query<UserRow>(
    'insert into users (handle, is_bot, invite_code) values ($1, $2, $3) returning *', [handle, isBot, isBot ? null : newInviteCode()])
  const user = rows[0]
  for (let i = 0; i < START_PLOTS; i++) await q.query('insert into plots (owner_id, idx) values ($1, $2)', [user.id, i])
  await addGold(q, user, START_GOLD, 'start')
  if (!isBot) for (const [seedId, qty] of Object.entries(START_SEEDS)) await addItem(q, user.id, seedItem(seedId), qty)
  await ensureAnimals(q, user.id, Date.now())
  return user.id
}

/** Cada bicho do rebanho (`users.herd`, frente D) tem a sua linha produtiva. Os de produção que faltarem chegam
 *  adultos e de barriga cheia (são os bichos que sempre passearam pela fazenda); os de corte chegam filhotes. */
async function ensureAnimals(q: Q, ownerId: string, now: number, herd?: Herd | null) {
  const h = herd !== undefined ? herd : (await q.query<{ herd: Herd | null }>('select herd from users where id = $1', [ownerId])).rows[0]?.herd
  for (const slot of herdIds(h)) {
    const kind = kindOfSlot(slot)
    if (!kind) continue
    const l = LIVESTOCK[kind]
    const grown = l.meat ? 0 : growTotalMs(l)
    await q.query(
      `insert into animals (owner_id, slot, kind, fed_until, fed_ms, settled_at, cycle_from) values ($1, $2, $3, $4, $5, $6, $5)
       on conflict (owner_id, slot) do nothing`,
      [ownerId, slot, l.kind, new Date(now + foodFullMs()), grown, new Date(now)])
  }
}

/** Bicho de corte colhido sai do rebanho. Se não era a última cópia, a última cópia assume o lugar dele
 *  (os ids do rebanho são "pig", "pig2"…, contados pelo número). */
async function leaveHerd(q: Q, user: UserRow, slot: string) {
  const kind = kindOfSlot(slot) as HerdKind
  const h: Herd = { ...(user.herd ?? DEFAULT_HERD) }
  const n = h[kind] ?? 0
  if (n <= 0) return
  const last = n === 1 ? kind : `${kind}${n}`
  h[kind] = n - 1
  await q.query('update users set herd = $2 where id = $1', [user.id, JSON.stringify(h)])
  user.herd = h
  if (last !== slot) {
    await q.query('update animals set slot = $3 where owner_id = $1 and slot = $2', [user.id, last, slot])
    await q.query('update animal_spots set animal = $3 where owner_id = $1 and animal = $2', [user.id, last, slot])
    await q.query('update wear set animal = $3 where owner_id = $1 and animal = $2', [user.id, last, slot])
  }
}

async function loadAnimals(q: Q, ownerId: string, lock = false): Promise<AnimalDb[]> {
  return (await q.query<AnimalDb>(`select * from animals where owner_id = $1 order by created_at, slot${lock ? ' for update' : ''}`, [ownerId])).rows
}

async function lockAnimal(q: Q, ownerId: string, slot: string): Promise<AnimalDb> {
  const { rows } = await q.query<AnimalDb>('select * from animals where owner_id = $1 and slot = $2 for update', [ownerId, String(slot)])
  if (!rows[0]) throw new GameError('Bicho não encontrado')
  return rows[0]
}

/** Começa o próximo lote: o tempo alimentado de agora vira o começo do ciclo. */
async function restartBatch(q: Q, a: AnimalDb, now: number) {
  const st = settle(toAnimal(a), now)
  await q.query('update animals set fed_ms = $2, settled_at = $3, cycle_from = $2, batch_seq = batch_seq + 1, taken = 0 where id = $1',
    [a.id, st.fed_ms, new Date(st.settled_at)])
}

async function wearOf(q: Q, ownerId: string): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {}
  for (const r of (await q.query<{ animal: string; acc: string }>('select animal, acc from wear where owner_id = $1 order by acc', [ownerId])).rows) {
    (out[r.animal] ??= []).push(r.acc)
  }
  return out
}

/** Bicho saiu da fazenda: os acessórios voltam para o inventário. */
async function unwearAll(q: Q, ownerId: string, animal: string) {
  const { rows } = await q.query<{ acc: string }>('delete from wear where owner_id = $1 and animal = $2 returning acc', [ownerId, animal])
  for (const r of rows) await addItem(q, ownerId, accItem(r.acc), 1)
}

// ---------- patrulha do cachorro ----------

/** Casa da patrulha: onde o dono deixou o cachorro, ou o meio da área dele. */
const DOG_HOME: Spot = { x: Math.round((DOG_AREA.x0 + DOG_AREA.x1) / 2), y: Math.round((DOG_AREA.y0 + DOG_AREA.y1) / 2) }
async function dogHome(q: Q, ownerId: string): Promise<Spot> {
  const r = (await q.query<{ x: number; y: number }>("select x, y from animal_spots where owner_id = $1 and animal = 'dog'", [ownerId])).rows[0]
  return r && dropCheck('dog', r.x, r.y).ok ? { x: r.x, y: r.y } : DOG_HOME
}

/** Onde fica um bicho (para saber se o cachorro olha para ele): lugar salvo ou o meio da área padrão. */
async function animalX(q: Q, ownerId: string, slot: string): Promise<number | null> {
  if (!isAnimalId(slot) || slot === 'dog') return null
  const r = (await q.query<{ x: number }>('select x from animal_spots where owner_id = $1 and animal = $2', [ownerId, slot])).rows[0]
  if (r) return r.x
  const a = defaultArea(slot)
  return (a.x0 + a.x1) / 2
}

// Vizinhos controlados pelo jogo: garantem alguém para visitar e roubar no primeiro minuto.
// O seu_zé tem um Pastor alimentado para o jogador conhecer a mordida logo cedo (a Dona Cida não tem cachorro).
const BOTS = ['dona_cida', 'seu_ze']
const BOT_DOG = 'seu_ze'

// Já conferido neste processo: o login não precisa repetir a transação (nem travar a linha do bot) a cada entrada.
let botsReady = false

async function ensureBots() {
  if (botsReady) return
  await tx(async (q) => {
    // Dois primeiros logins ao mesmo tempo (Postgres real, várias conexões) não criam os bots em dobro.
    await q.query("select pg_advisory_xact_lock(hashtext('colheita_feliz_bots'))")
    const now = Date.now()
    for (const handle of BOTS) {
      const exists = await q.query('select 1 from users where handle = $1', [handle])
      if (!exists.rows.length) {
        const id = await createUser(q, handle, true)
        const { rows } = await q.query<PlotDb>('select * from plots where owner_id = $1 order by idx', [id])
        for (const p of rows) {
          const seed = SEEDS[p.idx % 2]
          // Metade já madura, metade no meio do caminho.
          const back = p.idx < 3 ? growMs(seed) : growMs(seed) / 2
          await plantRaw(q, p, seed.id, now - back, true)
        }
      }
    }
    await q.query(
      "update users set dog = 'pastor', dog_fed_until = now() + interval '10 years' where handle = $1 and (dog is null or dog = 'vira_lata')", [BOT_DOG])
  })
  botsReady = true
}

/** Lugares salvos dos bichos do dono (a decoração não cobre bicho). */
async function animalSpots(q: Q, ownerId: string): Promise<Spots> {
  const out: Spots = {}
  for (const r of (await q.query<{ animal: string; x: number; y: number }>('select animal, x, y from animal_spots where owner_id = $1', [ownerId])).rows) {
    if (isAnimalId(r.animal)) out[r.animal] = { x: r.x, y: r.y }
  }
  return out
}

// Lote de bot que chegou ao piso: quando foi visto assim (em memória). Ele espera um pouco antes de
// replantar, para o visitante que continua tocando ver o "Não seja tão ganancioso!".
const botExhausted = new Map<string, number>()
const BOT_REPLANT_MS = 60_000

/** Bots colhem e replantam sozinhos quando a horta já foi "limpa" pelos visitantes. */
async function tickBot(q: Q, ownerId: string, now: number) {
  // skip locked: com muita gente visitando o mesmo bot, quem chega enquanto outro já está cuidando dele não espera.
  const { rows } = await q.query<PlotDb>('select * from plots where owner_id = $1 for update skip locked', [ownerId])
  for (const p of rows) {
    const row = toRow(p)
    const state = plotState(row, now)
    const y = state === 'ripe' ? effectiveYield(row, now) : null
    const key = harvestKey(p.id, p.sow_seq)
    let exhausted = false
    if (y != null && stealQty(y.total, y.left, undefined, keepOf(p.seed_id)) === 0) {
      if (!botExhausted.has(key)) botExhausted.set(key, now)
      exhausted = now - botExhausted.get(key)! >= BOT_REPLANT_MS
    }
    const stale = state === 'ripe' && now - row.ready_at! > 30 * 60_000
    if (state === 'empty' || state === 'withered' || exhausted || stale) {
      botExhausted.delete(key)
      await plantRaw(q, p, 'nabo', now, true) // tempo do tutorial: é aqui que o jogador novo aprende a pegar
    }
  }
  // Bichos do vizinho: sempre alimentados; o lote "limpo" pelos visitantes (ou parado há muito) recomeça.
  for (const a of await loadAnimals(q, ownerId, true)) {
    const row = toAnimal(a)
    if (foodAt(row, now) < 50) {
      const st = settle(row, now)
      await q.query('update animals set fed_ms = $2, settled_at = $3, fed_until = $4 where id = $1',
        [a.id, st.fed_ms, new Date(now), new Date(now + foodFullMs())])
      Object.assign(a, { fed_ms: st.fed_ms, settled_at: new Date(now), fed_until: new Date(now + foodFullMs()) })
    }
    const v = viewAnimal(toAnimal(a), now)
    if (!v?.ready) continue
    const key = animalKey(a)
    let exhausted = false
    if (stealQty(v.produced!, v.left!, undefined, LIVESTOCK[v.kind].keep) === 0) {
      if (!botExhausted.has(key)) botExhausted.set(key, now)
      exhausted = now - botExhausted.get(key)! >= BOT_REPLANT_MS
    }
    if (exhausted) { botExhausted.delete(key); await restartBatch(q, a, now) }
  }
  if (botExhausted.size > 10_000) botExhausted.clear()
}

// ---------- leitura ----------

export type NeighborView = {
  handle: string; avatar: AvatarId; level: number; xp: number; gold: number; popularity: number; isBot: boolean; friend: boolean; online: boolean
  ripe: number // lotes maduros (dá para pegar)
  needsHelp: number // lotes com praga, erva ou seca (dá para ajudar)
  giftSent: boolean // já mandei presente hoje
}

export type GiftView = { id: number; from: string | null; fromBot: boolean; seedId: string; at: number; thanked: boolean }

export type MissionView = { slot: number; text: string; target: number; progress: number; claimed: boolean; gold: number; xp: number }
export type DogView = {
  kind: string; name: string; awake: boolean; fedUntil: number | null; expiresAt: number | null
  bite: number; finePct: number; fineMax: number // já com o nível
  level: number; bones: number; next: { level: number; missing: number; have: number; need: number } | null
  patrol: { seed: string; home: Spot } // a cena desenha a mesma patrulha que o servidor usa na mordida
} | null

export type FarmPayload = {
  serverNow: number
  me: {
    id: string; handle: string; avatar: AvatarId; level: number; xp: number; gold: number; credits: number; popularity: number
    stealsLeft: number; stealMode: StealMode; pestsLeft: number; weedsLeft: number; helpsLeft: number; loveLeft: number; dog: DogView; inviteCode: string | null
  }
  owner: { id: string; handle: string; avatar: AvatarId; level: number; isBot: boolean; dog: DogView }
  isOwn: boolean
  plots: PlotView[]
  inventory: { itemId: string; qty: number }[]
  neighbors: NeighborView[]
  events: { id: number; kind: string; actor: string | null; payload: Record<string, unknown>; at: number }[]
  missions: MissionView[]
  land: { count: number; max: number; next: { gold: number; minLevel: number } | null }
  dailyBonus: { streak: number; gold: number; seedId: string; bones: number; event?: string } | null
  gifts: GiftView[] // presentes recebidos nos últimos dias (janela Presentes, aba Recebidos)
  animals: Spots // onde o dono deixou os bichos (os que nunca mudaram de lugar ficam de fora)
  livestock: AnimalView[] // bichos produtivos do dono da fazenda (alimento, estágio, produção)
  wear: Record<string, string[]> // acessórios vestidos por bicho ('dog' incluso)
  herd: AnimalId[] // bichos do dono (com cópias: "cow", "cow2"…)
  decor: DecorView // decoração da fazenda na tela (o visitante vê a do dono)
  myDecor: MyDecor // o que o jogador tem (loja e Depósito > Minha decoração)
  event: EventView | null // evento sazonal valendo agora (Evolução 09): banner, tigela, trocas, missões
  pets: EventPetView[] // bichos de evento do dono (Evolução 13, E14): passeiam o ano todo
}

export type EventPetView = { id: string; name: string; emoji: string; line: string; dir: string }

/** Lote de produção de um bicho (um ladrão mordido ali fica de fora até o próximo lote). */
const animalKey = (a: Pick<AnimalDb, 'id' | 'batch_seq'>) => `a:${a.id}#${a.batch_seq}`

const breedOf = (u: UserRow) => (u.dog ? DOG_BREEDS[u.dog] ?? DOG_BREEDS.vira_lata : null)

const dogView = (u: UserRow, now: number, home: Spot): DogView => {
  const b = breedOf(u)
  if (!b) return null
  const level = dogLevel(u.dog_bones ?? 0)
  return {
    kind: b.id, name: b.name, awake: (ms(u.dog_fed_until) ?? 0) > now, fedUntil: ms(u.dog_fed_until), expiresAt: ms(u.dog_expires_at),
    ...dogPower(b, level), level, bones: u.dog_bones ?? 0, next: dogNextLevel(u.dog_bones ?? 0), patrol: { seed: u.id, home },
  }
}

/** Prazo da raça e avisos no registro: ração acabando, cachorro indo embora, cachorro foi embora. */
async function tickDog(q: Q, u: UserRow, now: number) {
  if (!u.dog || u.is_bot) return
  const b = breedOf(u)!
  const exp = ms(u.dog_expires_at)
  if (exp != null && exp <= now) {
    await q.query('update users set dog = null, dog_fed_until = null, dog_expires_at = null, dog_hungry_warned = null, dog_leaving_warned = false where id = $1', [u.id])
    u.dog = null; u.dog_fed_until = null; u.dog_expires_at = null
    await pushEvent(q, u.id, null, 'dog_left', { breed: b.name })
    return
  }
  if (exp != null && exp - now < DOG.leavingWarnMs && !u.dog_leaving_warned) {
    await q.query('update users set dog_leaving_warned = true where id = $1', [u.id])
    u.dog_leaving_warned = true
    await pushEvent(q, u.id, null, 'dog_leaving', { breed: b.name, hours: Math.ceil((exp - now) / 3600_000) })
  }
  const fed = ms(u.dog_fed_until) ?? 0
  if (fed - now < DOG.hungryWarnMs && ms(u.dog_hungry_warned) !== fed) {
    await q.query('update users set dog_hungry_warned = dog_fed_until where id = $1', [u.id])
    u.dog_hungry_warned = u.dog_fed_until
    await pushEvent(q, u.id, null, 'dog_hungry', { breed: b.name, hours: Math.max(0, Math.ceil((fed - now) / 3600_000)) })
  }
}

/** Bônus do primeiro acesso do dia (dias seguidos aumentam o prêmio). */
async function grantLoginBonus(q: Q, me: UserRow, day: string, now: number) {
  if (dayStr(me.login_day) === day) return null
  const streak = dayStr(me.login_day) === prevDay(day) ? me.login_streak + 1 : 1
  const gold = LOGIN_BONUS[Math.min(streak, LOGIN_BONUS.length) - 1]
  await q.query('update users set login_day = $2, login_streak = $3 where id = $1', [me.id, day, streak])
  await addGold(q, me, gold, 'login_bonus')
  const ev = await currentEvent(q, now)
  const seedId = dailySeed(day, me.level, bonusEventSeeds(ev, now))
  await addItem(q, me.id, seedItem(seedId), 1)
  const event = ev?.def.seeds.includes(seedId) ? ev.def.name : undefined
  // Osso para o nível do cachorro (de graça, jogando).
  await addItem(q, me.id, 'osso', DOG_LEVEL.loginBones)
  return { streak, gold, seedId, bones: DOG_LEVEL.loginBones, ...(event ? { event } : {}) }
}

export async function loadFarm(viewerId: string, ownerHandle?: string): Promise<FarmPayload> {
  await ensureBots()
  return tx(async (q) => {
    const now = Date.now()
    const day = gameDay(now)
    const me = (await q.query<UserRow>('update users set last_seen_at = now() where id = $1 returning *', [viewerId])).rows[0]
    if (!me) throw new GameError('Sessão inválida')
    const dailyBonus = me.is_bot ? null : await grantLoginBonus(q, me, day, now)
    if (!me.is_bot && !me.invite_code) {
      me.invite_code = newInviteCode()
      await q.query('update users set invite_code = $2 where id = $1', [me.id, me.invite_code])
    }
    const owner = ownerHandle && ownerHandle !== me.handle
      ? (await q.query<UserRow>('select * from users where handle = $1', [ownerHandle])).rows[0]
      : me
    if (!owner) throw new GameError('Fazenda não encontrada')
    const isOwn = owner.id === me.id
    await ensureAnimals(q, owner.id, now, owner.herd)
    if (owner.is_bot) await tickBot(q, owner.id, now)
    await tickDog(q, me, now)
    if (owner.id !== me.id) await tickDog(q, owner, now)
    if (!isOwn) {
      const first = await q.query(
        `insert into daily_counters (user_id, day, kind, count) values ($1, $2, $3, 1) on conflict do nothing returning count`,
        [me.id, day, `visit:${owner.id}`])
      if (first.rows.length) {
        await mission(q, me.id, day, 'visit')
        if (!owner.is_bot) await onEventVisit(q, me.id, now)
        // Registro do dono (o "assistente"): quem passou pela fazenda hoje.
        if (!owner.is_bot) await pushEvent(q, owner.id, me.id, 'visited', {})
      }
      if (!owner.is_bot) announceVisit(me.id, me.handle, owner.id, now)
    }

    const plotsDb = (await q.query<PlotDb>('select * from plots where owner_id = $1 order by idx', [owner.id])).rows
    const inHerd = new Set<string>(herdIds(owner.herd))
    const animalsDb = (await loadAnimals(q, owner.id)).filter((a) => inHerd.has(a.slot))
    // Lotes fechados para este visitante nesta safra: no 'chunk', qualquer tentativa; no 'tap', só a mordida.
    let stolenKeys = new Set<string>()
    if (!isOwn) {
      const keys = [...plotsDb.filter((p) => p.planted_at).map((p) => harvestKey(p.id, p.sow_seq)), ...animalsDb.map(animalKey)]
      const s = await q.query<{ harvest_key: string }>(
        `select harvest_key from steals where thief_id = $1 and harvest_key = any($2)${STEAL.mode === 'tap' ? ' and bitten' : ''}`, [me.id, keys])
      stolenKeys = new Set(s.rows.map((r) => r.harvest_key))
    }
    const plots = plotsDb.map((p) => {
      const v = viewPlot(toRow(p), now)
      if (!isOwn && v.state === 'ripe') {
        v.canSteal = stealQty(v.yieldTotal!, v.yieldLeft!, undefined, keepOf(p.seed_id)) > 0 && !stolenKeys.has(harvestKey(p.id, p.sow_seq))
      }
      if (v.state === 'growing') v.fertilized = fertilizedNow(v.stage!, p.sow_seq, p.fert_seq, p.fert_stage)
      return v
    })
    const livestock = animalsDb.flatMap((a) => {
      const v = viewAnimal(toAnimal(a), now)
      if (!v) return []
      if (!isOwn && v.ready) v.canSteal = stealQty(v.produced!, v.left!, undefined, LIVESTOCK[v.kind].keep) > 0 && !stolenKeys.has(animalKey(a))
      return [v]
    })

    const counters = new Map((await q.query<{ kind: string; count: number }>(
      'select kind, count from daily_counters where user_id = $1 and day = $2', [me.id, day])).rows.map((r) => [r.kind, r.count]))
    const used = (k: string) => counters.get(k) ?? 0

    const inventory = (await q.query<{ item_id: string; qty: number }>(
      'select item_id, qty from inventory where user_id = $1 and qty > 0 order by item_id', [me.id])).rows

    // Vizinhos: amigos e os vizinhos do jogo (bots do tutorial). A faixa de baixo e o ranking mostram só esses.
    // Mais até 8 fazendeiros que jogaram por último, só como sugestão ("Também jogando", na janela Amigos).
    const neighborsDb = (await q.query<UserRow & { ripe_plots: number; friend: boolean }>(
      `with cand as (
         select friend_id as id from friendships where user_id = $1
         union select id from users where is_bot
         union select id from (select id from users where id <> $1 and not is_bot order by last_seen_at desc limit 8) recent
       )
       select u.*, (select count(*)::int from plots p where p.owner_id = u.id and p.ready_at <= now() and not p.withered) as ripe_plots,
              exists (select 1 from friendships f where f.user_id = $1 and f.friend_id = u.id) as friend
       from users u join cand on cand.id = u.id where u.id <> $1
       order by friend desc, u.is_bot desc, u.last_seen_at desc limit 40`, [me.id])).rows
    const helpPlots = (await q.query<PlotDb & { owner_id: string }>(
      'select * from plots where owner_id = any($1) and seed_id is not null and not withered', [neighborsDb.map((u) => u.id)])).rows
    const needsHelp = new Map<string, number>()
    for (const p of helpPlots) {
      const row = toRow(p)
      if (plotState(row, now) !== 'growing') continue
      const c = careAt(row, now)
      if (c.pests || c.weeds || c.dry) needsHelp.set(p.owner_id, (needsHelp.get(p.owner_id) ?? 0) + 1)
    }

    const events = (await q.query<{ id: number; kind: string; handle: string | null; payload: Record<string, unknown>; created_at: Date }>(
      `select e.id, e.kind, a.handle, e.payload, e.created_at from events e left join users a on a.id = e.actor_id
       where e.user_id = $1 order by e.id desc limit 30`, [me.id])).rows

    const gifts = (await q.query<{ id: number; handle: string | null; is_bot: boolean | null; payload: Record<string, unknown>; created_at: Date }>(
      `select e.id, a.handle, a.is_bot, e.payload, e.created_at from events e left join users a on a.id = e.actor_id
       where e.user_id = $1 and e.kind = 'gift' and e.created_at > now() - interval '7 days' order by e.id desc limit 30`, [me.id])).rows

    const missions = dailyMissions(me.id, day).map((m, slot) => ({
      slot, text: m.text, target: m.target, gold: m.gold, xp: m.xp,
      progress: Math.min(m.target, used(`m:${m.kind}`)), claimed: used(`claim:${slot}`) > 0,
    }))

    // Lugar salvo dos bichos; um lugar que deixou de valer (layout mudou) volta para a área padrão.
    const animals: Spots = {}
    const herd = new Set<AnimalId>([...herdIds(owner.herd), 'dog'])
    for (const r of (await q.query<{ animal: string; x: number; y: number }>('select animal, x, y from animal_spots where owner_id = $1', [owner.id])).rows) {
      if (isAnimalId(r.animal) && herd.has(r.animal) && dropCheck(r.animal, r.x, r.y).ok) animals[r.animal] = { x: r.x, y: r.y }
    }

    const decor = await loadDecor(q, owner.id)
    if (isOwn) await onEventEnter(q, me, now, (userId, actorId, kind, payload) => pushEvent(q, userId, actorId, kind, payload))
    const event = await loadEventView(q, await currentEvent(q, now), me, owner, isOwn, day, now)
    const pets = await petsOf(q, owner.id)
    const myDecor = await loadMyDecor(q, me, isOwn ? decor.placed : undefined)

    const myPlots = isOwn ? plotsDb.length
      : Number((await q.query<{ n: number }>('select count(*)::int as n from plots where owner_id = $1', [me.id])).rows[0].n)
    const nextN = myPlots - START_PLOTS + 1

    return {
      serverNow: now,
      me: {
        id: me.id, handle: me.handle, avatar: avatarOf(me.avatar, me.handle), level: me.level, xp: me.xp, gold: me.gold, credits: me.credits, popularity: me.popularity,
        stealsLeft: Math.max(0, stealDailyCap() - used('steal')),
        stealMode: STEAL.mode,
        pestsLeft: Math.max(0, CARE.throwDaily - used('throw:pest')),
        weedsLeft: Math.max(0, CARE.throwDaily - used('throw:weed')),
        helpsLeft: Math.max(0, CARE.helpDaily - used('help')),
        loveLeft: Math.max(0, LOVE.daily - used('love')),
        dog: dogView(me, now, isOwn ? await dogHome(q, me.id) : DOG_HOME),
        inviteCode: me.invite_code,
      },
      owner: { id: owner.id, handle: owner.handle, avatar: avatarOf(owner.avatar, owner.handle), level: owner.level, isBot: owner.is_bot, dog: dogView(owner, now, await dogHome(q, owner.id)) },
      isOwn,
      plots,
      inventory: inventory.map((r) => ({ itemId: r.item_id, qty: r.qty })),
      neighbors: neighborsDb.map((u) => ({
        handle: u.handle, avatar: avatarOf(u.avatar, u.handle), level: u.level, xp: u.xp, gold: u.gold, popularity: u.popularity, isBot: u.is_bot, friend: u.friend || u.is_bot,
        online: u.is_bot || now - u.last_seen_at.getTime() < 5 * 60_000,
        ripe: u.ripe_plots, needsHelp: needsHelp.get(u.id) ?? 0, giftSent: used(`gift:${u.id}`) > 0,
      })),
      events: events.map((e) => ({ id: Number(e.id), kind: e.kind, actor: e.handle, payload: e.payload, at: e.created_at.getTime() })),
      missions,
      land: { count: myPlots, max: MAX_PLOTS, next: myPlots < MAX_PLOTS ? landPrice(nextN) : null },
      dailyBonus,
      gifts: gifts.map((g) => ({
        id: Number(g.id), from: g.handle, fromBot: !!g.is_bot, seedId: String(g.payload.seedId), at: g.created_at.getTime(), thanked: !!g.payload.thanked,
      })),
      animals,
      livestock,
      wear: await wearOf(q, owner.id),
      herd: herdIds(owner.herd),
      decor,
      myDecor,
      event,
      pets: pets.map((x) => ({ id: x.id, name: x.name, emoji: x.emoji, line: x.line, dir: x.dir })),
    }
  })
}

// ---------- ações ----------

export type CareTool = 'water' | 'pesticide' | 'herbicide'

export type Action =
  | { type: 'plant'; idx: number; seedId: string }
  | { type: 'harvest'; idx: number }
  | { type: 'clear'; idx: number }
  | { type: 'sell'; itemId: string; qty?: number }
  | { type: 'sell_all' }
  | { type: 'steal'; owner: string; idx: number }
  | { type: 'buy'; itemId: string; qty?: number }
  | { type: 'care'; idx: number; tool: CareTool; owner?: string }
  | { type: 'sabotage'; idx: number; kind: 'pest' | 'weed'; owner: string }
  | { type: 'fertilize'; idx: number; itemId?: string }
  | { type: 'love'; idx: number; owner: string }
  | { type: 'feed_dog'; buy?: boolean }
  | { type: 'expand' }
  | { type: 'claim'; slot: number }
  | { type: 'gift'; to: string; seedId: string }
  | { type: 'thank'; eventId: number }
  | { type: 'add_friend'; handle: string }
  | { type: 'give_flower'; to: string; seedId: string }
  | { type: 'move_animal'; animal: string; x: number; y: number; owner?: string }
  | { type: 'give_bone'; qty?: number }
  | { type: 'feed_animal'; slot: string; itemId: string }
  | { type: 'collect_animal'; slot: string }
  | { type: 'steal_animal'; owner: string; slot: string }
  | { type: 'wear'; animal: string; acc: string; on: boolean }
  | DecorAction
  | EventAction

export const ACTION_TYPES = new Set<Action['type']>([
  'plant', 'harvest', 'clear', 'sell', 'sell_all', 'steal', 'buy', 'care', 'sabotage', 'fertilize', 'love', 'feed_dog', 'expand', 'claim',
  'gift', 'thank', 'add_friend', 'give_flower', 'move_animal', 'give_bone', 'feed_animal', 'collect_animal', 'steal_animal', 'wear', ...DECOR_ACTIONS,
  ...EVENT_ACTIONS,
])

// Roubo 'tap': último toque de cada ladrão (em memória, como o limite de ritmo da API).
const lastTap = new Map<string, number>()

// Aviso "fulano está na sua fazenda" (no máximo 1 a cada 5 min por visitante, em memória).
const lastVisit = new Map<string, number>()
function announceVisit(viewerId: string, handle: string, ownerId: string, now: number) {
  const key = `${viewerId}>${ownerId}`
  if (now - (lastVisit.get(key) ?? 0) < 5 * 60_000) return
  lastVisit.set(key, now)
  queueMicrotask(() => publish(ownerId, { kind: 'visiting', payload: { handle } }))
}

// fx: o que o cliente mostra flutuando (+XP, +ouro, item).
// say: fala do balão do lote (lines.ts) no lugar do toast. bite: o cachorro mordeu (a cena mostra a corrida até o lote).
export type ActionResult = {
  message: string; bad?: boolean; fx?: { xp?: number; gold?: number; item?: string; qty?: number }; readyAt?: number
  say?: string; chest?: number; bite?: { idx: number; gold: number; breed: string; owner: string; slot?: string }
  away?: boolean // roubo: o cachorro estava de costas (a cena pode comemorar)
  gone?: string // bicho de corte colhido: sai da cena (sem animação de morte)
  sale?: SaleView
  placed?: Placed[] // decoração: o que entrou na grade (com o id do servidor)
}

/** Resultado detalhado do "Vender tudo": itens, ouro base e o bônus de popularidade à parte. */
export type SaleView = { count: number; base: number; bonus: number; pct: number; gold: number; lines: { itemId: string; qty: number; gold: number }[] }

async function farmOf(q: Q, user: UserRow, handle?: string): Promise<UserRow> {
  if (!handle || handle === user.handle) return user
  const owner = (await q.query<UserRow>('select * from users where handle = $1 for update', [handle])).rows[0]
  if (!owner) throw new GameError('Fazenda não encontrada')
  return owner
}

/** Adianta a linha do tempo em `cutMs` (nunca passa do maduro), como o adubo ("−1 h").
 *  1 adubo por estágio: o estágio em que o adubo deixa a planta conta como adubado.
 *  A safra continua a mesma (sow_seq não muda). Devolve o novo horário de amadurecer. */
async function fertilizePlot(q: Q, plot: PlotDb, cutMs: number, now: number): Promise<number> {
  const row = toRow(plot)
  if (plotState(row, now) !== 'growing') throw new GameError('Adubo só em planta crescendo')
  const fr = stageFracs(SEED_BY_ID[plot.seed_id!])
  const stage = stageAt(row.planted_at!, row.ready_at!, now, fr)
  if (fertilizedNow(stage, plot.sow_seq, plot.fert_seq, plot.fert_stage)) {
    throw new GameError('Não precisa de mais fertilizante! Espere a planta chegar ao próximo estágio.', 'fertTwice')
  }
  const skip = Math.max(1, Math.ceil(Math.min(cutMs, row.ready_at! - now)))
  const target = stageAt(row.planted_at! - skip, row.ready_at! - skip, now, fr)
  await q.query(
    `update plots set planted_at = planted_at - $2 * interval '1 millisecond', ready_at = ready_at - $2 * interval '1 millisecond',
       fert_seq = sow_seq, fert_stage = $3 where id = $1`,
    [plot.id, skip, target])
  return row.ready_at! - skip
}

/** Ossos de graça por ajudar amigos: 1 a cada DOG_LEVEL.helpEvery ajudas, até helpMaxDaily por dia. */
async function helpBone(q: Q, userId: string, day: string): Promise<number> {
  const n = await bumpDaily(q, userId, day, 'help_friend')
  if (n % DOG_LEVEL.helpEvery || n / DOG_LEVEL.helpEvery > DOG_LEVEL.helpMaxDaily) return 0
  await addItem(q, userId, 'osso', 1)
  return 1
}

type DogBite = { bitten: false; away: boolean } | { bitten: true; away: boolean; loss: number; breed: string; name: string }

/** O cachorro do dono morde este toque? Chance da raça + nível, por toque ('tap'), vezes o fator de
 *  "de costas"/"de frente" para o alvo (lote ou bicho), decidido pela patrulha no relógio do servidor.
 *  Mordida: a multa sai do ladrão e vai para o dono. */
async function dogBite(q: Q, thief: UserRow, victim: UserRow, targetX: number | null, total: number, now: number, keep?: number): Promise<DogBite> {
  await tickDog(q, victim, now) // prazo vencido: o cachorro já foi embora e não morde
  const breed = breedOf(victim)
  if (!breed || (ms(victim.dog_fed_until) ?? 0) <= now) return { bitten: false, away: false }
  const power = dogPower(breed, dogLevel(victim.dog_bones ?? 0))
  const away = targetX != null && dogLooksAway(victim.id, await dogHome(q, victim.id), targetX, now)
  if (Math.random() >= tapBiteChance(power.bite, total, away, undefined, keep)) return { bitten: false, away }
  const loss = Math.min(power.fineMax, Math.ceil(thief.gold * power.finePct))
  if (loss > 0) {
    await addGold(q, thief, -loss, 'dog_bite')
    await addGold(q, victim, loss, 'dog_bite')
  }
  return { bitten: true, away, loss, breed: breed.id, name: breed.name }
}

/** Faz a ação e, só depois que ela deu certo (fora da transação), grava as métricas que ela anotou. */
export async function runAction(userId: string, a: Action): Promise<ActionResult> {
  const notes: MetricNote[] = []
  const res = await runActionTx(userId, a, (n) => notes.push(n))
  await trackAll(userId, notes)
  return res
}

async function runActionTx(userId: string, a: Action, note: (n: MetricNote) => void): Promise<ActionResult> {
  return tx(async (q) => {
    const now = Date.now()
    const day = gameDay(now)
    const user = await lockUser(q, userId)
    if (isDecorAction(a)) {
      return decorAction(q, user, a, {
        addGold: (delta, reason) => addGold(q, user, delta, reason),
        addXp: (xp) => addXp(q, user, xp),
        event: (kind, payload) => pushEvent(q, user.id, null, kind, payload),
        animals: () => animalSpots(q, user.id),
        onSale: async (seriesId) => seriesOnSale(seriesId, await currentEvent(q, now)),
      })
    }
    if (isEventAction(a)) {
      return eventAction(q, user, a, day, now, {
        addGold: (delta, reason) => addGold(q, user, delta, reason),
        addXp: (xp) => addXp(q, user, xp),
        addItem: (userId, itemId, qty) => addItem(q, userId, itemId, qty),
        takeItem: (itemId, qty, missing) => takeItem(q, user.id, itemId, qty, missing),
        bumpDaily: (kind) => bumpDaily(q, user.id, day, kind),
        event: (userId, actorId, kind, payload) => pushEvent(q, userId, actorId, kind, payload),
      })
    }
    switch (a.type) {
      case 'move_animal': {
        // Só o dono arruma os bichos; o ponto é validado aqui de novo (roça, casa, casinha, cerca, fora da fazenda).
        if (a.owner && a.owner !== user.handle) throw new GameError('Só o dono muda os bichos de lugar')
        if (!isAnimalId(a.animal) || (a.animal !== 'dog' && !herdIds(user.herd).includes(a.animal))) throw new GameError('Bicho desconhecido')
        if (a.animal === 'dog' && !user.dog) throw new GameError('Você não tem cachorro')
        const x = Number(a.x), y = Number(a.y)
        if (!Number.isInteger(x) || !Number.isInteger(y)) throw new GameError('Lugar inválido')
        const chk = dropCheck(a.animal, x, y)
        if (!chk.ok) throw new GameError(chk.reason)
        if (animalOnOrnament(a.animal, x, y, (await loadDecor(q, user.id)).placed)) throw new GameError('Em cima do enfeite não dá')
        await q.query(
          `insert into animal_spots (owner_id, animal, x, y) values ($1, $2, $3, $4)
           on conflict (owner_id, animal) do update set x = excluded.x, y = excluded.y`, [user.id, a.animal, x, y])
        return { message: 'Bicho no lugar novo' }
      }
      case 'buy': {
        const item = SHOP_BY_ID[a.itemId]
        if (!item) throw new GameError('Item desconhecido')
        const qty = Math.floor(a.qty ?? 1)
        if (!(qty >= 1 && qty <= 99)) throw new GameError('Quantidade inválida')
        if (user.level < item.minLevel) throw new GameError(`${item.name} libera no nível ${item.minLevel}`)
        // Item de evento: só na época; a semente sai da loja antes do fim (tempo de crescer, events.ts).
        if (item.event && !shopOpenFor(item, await currentEvent(q, now), now)) throw new GameError(`${item.name} só está à venda na época do evento`, 'off_season')
        if (item.id.startsWith('cao:')) {
          const b = DOG_BREEDS[item.id.slice(4)]
          if (!b) throw new GameError('Raça desconhecida')
          await tickDog(q, user, now)
          if (user.dog === b.id) throw new GameError(`Você já tem um ${b.name}`)
          const old = breedOf(user)
          await addGold(q, user, -item.gold, `buy:${item.id}`)
          // Vem com o pote cheio por 24 h; raças têm prazo (o vira-lata é permanente).
          await q.query(
            `update users set dog = $2, dog_fed_until = $3, dog_expires_at = $4, dog_hungry_warned = null, dog_leaving_warned = false where id = $1`,
            [user.id, b.id, new Date(now + DOG.feedMs), b.days ? new Date(now + b.days * 86_400_000) : null])
          const prazo = b.days ? ` Fica ${b.days} dias.` : ''
          return { message: `${old ? `${old.name} foi trocado. ` : ''}Chegou o ${b.name}! Guarda a horta enquanto tiver ração.${prazo}`, fx: { gold: -item.gold } }
        }
        if (item.id.startsWith('bicho:')) {
          // Bicho novo chega filhote e de barriga cheia; "não dá para comprar animal repetido" (Simone Aline).
          const l = LIVESTOCK[item.id.slice(6) as keyof typeof LIVESTOCK]
          if (!l || !l.art) throw new GameError('Bicho desconhecido')
          const herd: Herd = { ...(user.herd ?? DEFAULT_HERD) }
          if ((herd[l.kind as HerdKind] ?? 0) > 0) throw new GameError(`Você já tem ${l.name.toLowerCase()}`)
          await addGold(q, user, -item.gold, `buy:${item.id}`)
          herd[l.kind as HerdKind] = 1
          await q.query('update users set herd = $2 where id = $1', [user.id, JSON.stringify(herd)])
          await q.query(
            `insert into animals (owner_id, slot, kind, fed_until, settled_at) values ($1, $2, $2, $3, $4)
             on conflict (owner_id, slot) do update set fed_until = excluded.fed_until, settled_at = excluded.settled_at, fed_ms = 0, cycle_from = 0, batch_seq = animals.batch_seq + 1, taken = 0`,
            [user.id, l.kind, new Date(now + foodFullMs()), new Date(now)])
          return { message: `Chegou ${l.name.toLowerCase()} filhote! Alimente para crescer e produzir.`, fx: { gold: -item.gold } }
        }
        await addGold(q, user, -item.gold * qty, `buy:${item.id}`)
        await addItem(q, user.id, item.id, qty)
        await pushEvent(q, user.id, null, 'bought', { itemId: item.id, qty, gold: item.gold * qty })
        // Recibo no tom do jogo: "Você comprou com sucesso 20bag(s) Super Fertilizante(s), 20000 moedas foram gastas."
        return {
          message: `Você comprou com sucesso ${qty} ${itemName(item.id)}, ${item.gold * qty} moedas foram gastas.`,
          fx: { gold: -item.gold * qty, item: item.id, qty },
        }
      }
      case 'plant': {
        const seed = seedOrThrow(a.seedId)
        if (seed.needsArt) throw new GameError(`${seed.name} ainda não chegou na loja`)
        if (user.level < seed.minLevel) throw new GameError(`${seed.name} libera no nível ${seed.minLevel}`)
        const plot = await lockPlot(q, user.id, a.idx)
        if (plotState(toRow(plot), now) !== 'empty') throw new GameError('O lote não está livre')
        await takeItem(q, user.id, seedItem(seed.id), 1, `Sem semente de ${seed.name}: compre na loja`, 'no_seed')
        const tutorial = tutorialGrow(seed.id, user.level)
        await plantRaw(q, plot, seed.id, now, tutorial)
        await addXp(q, user, PLANT_XP)
        await mission(q, user.id, day, 'plant')
        await onEventPlant(q, user.id, seed.id, now)
        const readyAt = now + growMs(seed, tutorial)
        kickRipe(readyAt)
        note({ kind: 'plant', meta: { seed: seed.id } })
        return { message: `Plantou ${seed.name} (+${PLANT_XP} XP)`, fx: { xp: PLANT_XP, item: seedItem(seed.id), qty: -1 }, readyAt }
      }
      case 'harvest': {
        const plot = await lockPlot(q, user.id, a.idx)
        const row = toRow(plot)
        if (plotState(row, now) !== 'ripe') throw new GameError('Ainda não está maduro')
        const seed = SEED_BY_ID[plot.seed_id!]
        const { left } = effectiveYield(row, now)
        const health = careAt(row, now).health
        const season = plot.season ?? 1
        if (season < (seed.seasons ?? 1)) {
          // Cultura perene: volta para "folhas grandes" e prepara a próxima safra (safra nova = amigos podem pegar de novo).
          // Seca, praga e erva caem no trecho que falta crescer (de agora até madura), não no que ficou para trás.
          const next = nextSeason(seed, now)
          const care = scheduleCare(now, next.readyAt - now)
          const d = (t: number | null) => (t == null ? null : new Date(Math.max(t, now)))
          await q.query(
            `update plots set planted_at = $2, ready_at = $3, yield_total = $4, yield_left = $4, season = season + 1, sow_seq = sow_seq + 1,
               pests = 0, weeds = 0, dry_at = $5, dry_ms = 0, nat_pest_at = $6, nat_weed_at = $7 where id = $1`,
            [plot.id, new Date(next.plantedAt), new Date(next.readyAt), randInt(seed.yieldMin, seed.yieldMax),
              d(care.dry_at), d(care.nat_pest_at), d(care.nat_weed_at)])
          kickRipe(next.readyAt)
        } else {
          await q.query('update plots set withered = true, yield_left = 0 where id = $1', [plot.id])
        }
        await addXp(q, user, seed.xp)
        await mission(q, user.id, day, 'harvest')
        note({ kind: 'harvest', meta: { seed: seed.id, qty: Math.max(1, left) } })
        const treat = await onEventHarvest(q, user.id, seed.id, now, (itemId, qty) => addItem(q, user.id, itemId, qty))
        const treatText = treat ? ` · +${treat.qty} ${itemName(treat.item).toLowerCase()}${treat.qty > 1 ? 's' : ''}` : ''
        if (seed.flower) {
          // Regra do jogo: a flor colhida é presente — quem recebe ganha popularidade.
          await addItem(q, user.id, flowerItem(seed.id), Math.max(1, left))
          return { message: `Colheu ${Math.max(1, left)} flor de ${seed.name} (+${seed.xp} XP). Dê de presente a um amigo!`, fx: { xp: seed.xp, item: flowerItem(seed.id), qty: Math.max(1, left) } }
        }
        await addItem(q, user.id, seed.id, left)
        const sick = health < 100 ? ` · saúde ${health}/100` : ''
        const more = season < (seed.seasons ?? 1) ? ` · safra ${season}/${seed.seasons}, já está brotando de novo` : ''
        return { message: `Colheu ${left} ${seed.name} (+${seed.xp} XP)${sick}${more}${treatText}`, fx: { xp: seed.xp, item: seed.id, qty: left } }
      }
      case 'clear': {
        const plot = await lockPlot(q, user.id, a.idx)
        if (!plot.withered) throw new GameError('Não há planta seca para tirar')
        await q.query(
          `update plots set withered = false, seed_id = null, planted_at = null, ready_at = null, yield_total = null, yield_left = null,
             pests = 0, weeds = 0, dry_at = null, dry_ms = 0, nat_pest_at = null, nat_weed_at = null where id = $1`,
          [plot.id])
        await addXp(q, user, 1)
        // Às vezes a enxada acha um baú enterrado: chance e ouro fixos, no máximo CHEST.daily por dia.
        if (Math.random() < CHEST.chance) {
          const found = (await q.query<{ count: number }>(
            "select count from daily_counters where user_id = $1 and day = $2 and kind = 'chest'", [user.id, day])).rows[0]?.count ?? 0
          if (found < CHEST.daily) {
            await bumpDaily(q, user.id, day, 'chest')
            await addGold(q, user, CHEST.gold, 'chest')
            return {
              message: `Parabéns! Você encontrou um baú do tesouro enquanto cavava. Você ganhou ${CHEST.gold} moedas.`,
              fx: { xp: 1, gold: CHEST.gold }, chest: CHEST.gold,
            }
          }
        }
        return { message: 'Terra limpa (+1 XP)', fx: { xp: 1 } }
      }
      case 'sell':
      case 'sell_all': {
        const rows = (await q.query<{ item_id: string; qty: number }>(
          'select item_id, qty from inventory where user_id = $1 and qty > 0 for update', [user.id])).rows
          .filter((r) => sellPriceOf(r.item_id) > 0)
          .filter((r) => a.type === 'sell_all' || r.item_id === a.itemId)
        if (!rows.length) throw new GameError('Nada para vender')
        let total = 0, count = 0, base = 0
        const lines: SaleView['lines'] = []
        for (const r of rows) {
          const qty = a.type === 'sell' && a.qty != null ? Math.floor(a.qty) : r.qty
          if (qty <= 0 || qty > r.qty) throw new GameError('Quantidade inválida')
          await q.query('update inventory set qty = qty - $3 where user_id = $1 and item_id = $2', [user.id, r.item_id, qty])
          const gold = salePrice(sellPriceOf(r.item_id), qty, user.popularity)
          total += gold
          base += salePrice(sellPriceOf(r.item_id), qty, 0) // preço com decimal (1,3): cada linha arredonda para baixo
          count += qty
          lines.push({ itemId: r.item_id, qty, gold })
        }
        await addGold(q, user, total, a.type === 'sell' ? `sell:${a.itemId}` : 'sell:all')
        await mission(q, user.id, day, 'sell')
        await pushEvent(q, user.id, null, 'sold', { count, gold: total })
        const what = a.type === 'sell' ? `${count} ${itemName(a.itemId)}` : `${count} itens`
        const sale = { count, base, bonus: total - base, pct: Math.min(POPULARITY_CAP, user.popularity), gold: total, lines }
        // Texto do jogo: "…você ganhou N moedas., M moedas como um prêmio por sua popularidade".
        const prize = sale.bonus > 0 ? ` ${sale.bonus} moedas como um prêmio por sua popularidade.` : ''
        const message = a.type === 'sell_all'
          ? `Todos os itens do depósito foram vendidos, você ganhou ${base} moedas.${prize}`
          : `Vendeu ${what} por ${total} de ouro.${prize}`
        return { message, fx: { gold: total }, sale }
      }
      case 'care': {
        const owner = await farmOf(q, user, a.owner)
        const own = owner.id === user.id
        const plot = await lockPlot(q, owner.id, a.idx)
        const row = toRow(plot)
        const state = plotState(row, now)
        if (state !== 'growing' && state !== 'ripe') throw new GameError('Não há planta nesse lote')
        const care = careAt(row, now)
        const due = (t: number | null | undefined) => t != null && t <= Math.min(now, row.ready_at!)
        let what: string
        if (a.tool === 'water') {
          if (state !== 'growing' || !care.dry) throw new GameError('A terra não está seca', 'no_water')
          await q.query('update plots set dry_ms = $2, dry_at = null where id = $1', [plot.id, care.dryMs])
          await mission(q, user.id, day, 'water')
          what = 'regou'
        } else if (a.tool === 'pesticide') {
          if (!care.pests) throw new GameError('Não há praga nesse lote')
          if (due(row.nat_pest_at)) await q.query('update plots set nat_pest_at = null where id = $1', [plot.id])
          else await q.query('update plots set pests = pests - 1 where id = $1', [plot.id])
          what = 'tirou uma praga'
        } else if (a.tool === 'herbicide') {
          if (!care.weeds) throw new GameError('Não há erva daninha nesse lote')
          if (due(row.nat_weed_at)) await q.query('update plots set nat_weed_at = null where id = $1', [plot.id])
          else await q.query('update plots set weeds = weeds - 1 where id = $1', [plot.id])
          what = 'tirou uma erva daninha'
        } else throw new GameError('Ferramenta inválida')

        // Recompensa limitada por dia; a ajuda em si continua valendo depois do limite.
        const n = await bumpDaily(q, user.id, day, 'help')
        const rewarded = n <= CARE.helpDaily
        const gold = rewarded && !own ? CARE.helpGold : 0
        if (rewarded) await addXp(q, user, CARE.helpXp)
        if (gold) await addGold(q, user, gold, 'help')
        const bone = own ? 0 : await helpBone(q, user.id, day)
        if (!own) {
          note({ kind: 'help', ref: owner.id, meta: { tool: a.tool } })
          await mission(q, user.id, day, 'help')
          await pushEvent(q, owner.id, user.id, 'helped', { tool: a.tool, idx: plot.idx })
        }
        const reward = rewarded ? ` (+${CARE.helpXp} XP${gold ? `, +${gold} de ouro` : ''}${bone ? ', +1 osso' : ''})` : bone ? ' (+1 osso)' : ''
        // Na horta do amigo, o dono agradece num balão em cima do lote.
        const say = own ? undefined : a.tool === 'water' ? 'thanks_water' : a.tool === 'pesticide' ? 'thanks_pest' : 'thanks_weed'
        return { message: `Você ${what}${reward}`, fx: rewarded ? { xp: CARE.helpXp, gold: gold || undefined } : undefined, say }
      }
      case 'sabotage': {
        const owner = await farmOf(q, user, a.owner)
        if (owner.id === user.id) throw new GameError('Na sua própria horta, não!')
        const plot = await lockPlot(q, owner.id, a.idx)
        const row = toRow(plot)
        if (plotState(row, now) !== 'growing') throw new GameError('Só dá para jogar em planta crescendo')
        const care = careAt(row, now)
        const have = a.kind === 'pest' ? care.pests : care.weeds
        if (have >= CARE.maxPerPlot) throw new GameError('Esse lote já está cheio')
        const used = await bumpDaily(q, user.id, day, `throw:${a.kind}`)
        if (used > CARE.throwDaily) throw new GameError(`Limite de ${CARE.throwDaily} por dia`)
        await q.query(`update plots set ${a.kind === 'pest' ? 'pests = pests' : 'weeds = weeds'} + 1 where id = $1`, [plot.id])
        await pushEvent(q, owner.id, user.id, 'sabotaged', { kind: a.kind, idx: plot.idx })
        note({ kind: 'sabotage', ref: owner.id, meta: { kind: a.kind } })
        return { message: a.kind === 'pest' ? `Soltou uma praga na horta de ${owner.handle}` : `Plantou erva daninha na horta de ${owner.handle}` }
      }
      case 'fertilize': {
        const plot = await lockPlot(q, user.id, a.idx)
        const itemId = a.itemId ?? 'adubo'
        const fert = FERTILIZERS[itemId]
        if (!fert) throw new GameError('Adubo desconhecido')
        const readyAt = await fertilizePlot(q, plot, fertCutMs(fert), now)
        await takeItem(q, user.id, itemId, 1, `Sem ${itemName(itemId).toLowerCase()}: compre na loja`)
        kickRipe(readyAt)
        return { message: `${fert.name}: a planta cresceu mais rápido!`, fx: { item: itemId, qty: -1 } }
      }
      case 'love': {
        // Fertilizante do Amor: grátis, 1 por dia, só na horta de amigo (os vizinhos do jogo contam como amigos).
        const owner = await farmOf(q, user, a.owner)
        if (owner.id === user.id) throw new GameError('O Fertilizante do Amor é para a horta de um amigo')
        if (!owner.is_bot && !(await q.query('select 1 from friendships where user_id = $1 and friend_id = $2', [user.id, owner.id])).rows.length) {
          throw new GameError('Só dá para usar na horta de amigos')
        }
        const used = (await q.query<{ count: number }>(
          "select count from daily_counters where user_id = $1 and day = $2 and kind = 'love'", [user.id, day])).rows[0]?.count ?? 0
        if (used >= LOVE.daily) throw new GameError('Você já usou o Fertilizante do Amor hoje. Amanhã tem mais!')
        const plot = await lockPlot(q, owner.id, a.idx)
        const readyAt = await fertilizePlot(q, plot, origHoursMs(LOVE.origCutH), now)
        await bumpDaily(q, user.id, day, 'love')
        await addXp(q, user, LOVE.xp)
        await mission(q, user.id, day, 'help')
        if (!owner.is_bot) await pushEvent(q, owner.id, user.id, 'loved', { idx: plot.idx, seedId: plot.seed_id })
        kickRipe(readyAt)
        return { message: `Adubou a horta de ${owner.handle} com carinho 💚 (+${LOVE.xp} XP)`, fx: { xp: LOVE.xp } }
      }
      case 'feed_dog': {
        if (!user.dog) throw new GameError('Você não tem cachorro')
        const until = Math.max(now, ms(user.dog_fed_until) ?? 0)
        if (until - now + DOG.feedMs > DOG.maxFedMs) throw new GameError('O pote já está cheio para a semana')
        // Da ficha do cachorro dá para comprar e dar a ração num toque: usa a do depósito primeiro.
        const have = (await q.query<{ qty: number }>("select qty from inventory where user_id = $1 and item_id = 'racao'", [user.id])).rows[0]?.qty ?? 0
        const price = SHOP_BY_ID.racao.gold
        if (have <= 0 && a.buy) await addGold(q, user, -price, 'buy:racao')
        else await takeItem(q, user.id, 'racao', 1, 'Sem ração: compre na loja')
        await q.query('update users set dog_fed_until = $2 where id = $1', [user.id, new Date(until + DOG.feedMs)])
        if (have <= 0 && a.buy) return { message: `Comprou ração (${price} de ouro) e encheu o pote: +24 h de guarda`, fx: { gold: -price } }
        return { message: 'Encheu o pote: +24 h de guarda', fx: { item: 'racao', qty: -1 } }
      }
      case 'expand': {
        const count = Number((await q.query<{ n: number }>('select count(*)::int as n from plots where owner_id = $1', [user.id])).rows[0].n)
        if (count >= MAX_PLOTS) throw new GameError('Sua fazenda já está no tamanho máximo')
        const price = landPrice(count - START_PLOTS + 1)
        if (user.level < price.minLevel) throw new GameError(`Precisa do nível ${price.minLevel}`)
        await addGold(q, user, -price.gold, 'land')
        await q.query('insert into plots (owner_id, idx) values ($1, $2)', [user.id, count])
        return { message: 'Terreno novo comprado!', fx: { gold: -price.gold } }
      }
      case 'claim': {
        const m = dailyMissions(user.id, day)[a.slot]
        if (!m) throw new GameError('Missão inválida')
        const progress = (await q.query<{ count: number }>(
          'select count from daily_counters where user_id = $1 and day = $2 and kind = $3', [user.id, day, `m:${m.kind}`])).rows[0]?.count ?? 0
        if (progress < m.target) throw new GameError('Missão ainda não concluída')
        if ((await bumpDaily(q, user.id, day, `claim:${a.slot}`)) > 1) throw new GameError('Recompensa já recebida')
        await addGold(q, user, m.gold, `mission:${m.kind}`)
        await addXp(q, user, m.xp)
        await addItem(q, user.id, 'osso', DOG_LEVEL.missionBones)
        return { message: `Missão cumprida: +${m.gold} de ouro, +${m.xp} XP, +${DOG_LEVEL.missionBones} osso`, fx: { gold: m.gold, xp: m.xp } }
      }
      case 'add_friend': {
        const other = (await q.query<UserRow>('select * from users where handle = $1', [String(a.handle).toLowerCase()])).rows[0]
        if (!other) throw new GameError('Ninguém com esse apelido')
        if (other.id === user.id) throw new GameError('Esse é você!')
        if (other.is_bot) throw new GameError('Os vizinhos do jogo já são seus amigos')
        if (!(await befriend(q, user.id, other.id, 'add'))) throw new GameError(`Você e ${other.handle} já são amigos`)
        await pushEvent(q, other.id, user.id, 'friend_added', {})
        return { message: `Agora você e ${other.handle} são amigos!` }
      }
      case 'give_flower': {
        const seed = seedOrThrow(a.seedId)
        if (!seed.flower) throw new GameError('Isso não é flor')
        const self = !a.to || a.to === user.handle
        const to = self ? user : (await q.query<UserRow>('select * from users where handle = $1 for update', [a.to])).rows[0]
        if (!to) throw new GameError('Amigo não encontrado')
        if (!self && !to.is_bot && !(await q.query('select 1 from friendships where user_id = $1 and friend_id = $2', [user.id, to.id])).rows.length) {
          throw new GameError('Só dá para dar flor a amigos')
        }
        await takeItem(q, user.id, flowerItem(seed.id), 1, `Você não tem flor de ${seed.name}: plante e colha um ${seed.name}`)
        // Cada flor vale o "charme" dela em popularidade (Rosa: "Nível de charme").
        const charm = seed.charm ?? 1
        await q.query('update users set popularity = popularity + $2 where id = $1', [to.id, charm])
        if (self) return { message: `Você ficou com a flor de ${seed.name}: +${charm} de popularidade` }
        await pushEvent(q, to.id, user.id, 'flower', { seedId: seed.id, charm })
        return { message: `Flor de ${seed.name} entregue a ${to.handle}: +${charm} de popularidade para ${to.handle}` }
      }
      case 'gift': {
        const seed = seedOrThrow(a.seedId)
        if (!(GIFT_SEEDS as readonly string[]).includes(seed.id)) throw new GameError('Essa semente não dá para presentear')
        if (user.level < seed.minLevel) throw new GameError(`${seed.name} libera no nível ${seed.minLevel}`)
        const to = (await q.query<UserRow>('select * from users where handle = $1', [a.to])).rows[0]
        if (!to || to.id === user.id) throw new GameError('Amigo não encontrado')
        const friends = to.is_bot || (await q.query('select 1 from friendships where user_id = $1 and friend_id = $2', [user.id, to.id])).rows.length > 0
        if (!friends) throw new GameError('Só dá para presentear amigos')
        if ((await bumpDaily(q, user.id, day, `gift:${to.id}`)) > 1) throw new GameError(`Você já mandou presente para ${to.handle} hoje`)
        await addItem(q, to.id, seedItem(seed.id), 1)
        await pushEvent(q, to.id, user.id, 'gift', { seedId: seed.id })
        return { message: `Presente enviado: 1 semente de ${seed.name} para ${to.handle}` }
      }
      case 'thank': {
        // "Agradecer" na aba Recebidos: vira evento no Mural de quem mandou (1 vez por presente).
        const ev = (await q.query<{ actor_id: string | null; payload: Record<string, unknown> }>(
          "select actor_id, payload from events where id = $1 and user_id = $2 and kind = 'gift' for update", [a.eventId, user.id])).rows[0]
        if (!ev) throw new GameError('Presente não encontrado')
        if (ev.payload.thanked) throw new GameError('Você já agradeceu esse presente')
        if (!ev.actor_id) throw new GameError('Quem mandou esse presente não joga mais')
        await q.query(`update events set payload = payload || '{"thanked": true}'::jsonb where id = $1`, [a.eventId])
        const from = (await q.query<{ handle: string; is_bot: boolean }>('select handle, is_bot from users where id = $1', [ev.actor_id])).rows[0]
        if (!from.is_bot) await pushEvent(q, ev.actor_id, user.id, 'thanked', { seedId: ev.payload.seedId })
        return { message: `Você agradeceu o presente de ${from.handle} 💐` }
      }
      case 'steal': {
        const victim = (await q.query<UserRow>('select * from users where handle = $1 for update', [a.owner])).rows[0]
        if (!victim) throw new GameError('Fazenda não encontrada')
        if (victim.id === user.id) throw new GameError('Não dá pra roubar de si mesmo')
        if (!victim.is_bot && now - user.created_at.getTime() < STEAL.quarantineMs) {
          const min = Math.ceil((STEAL.quarantineMs - (now - user.created_at.getTime())) / 60_000)
          throw new GameError(`Fazendeiro novo ainda não rouba de amigos: faltam ${min} min. Treina na horta dos vizinhos!`)
        }
        const tap = STEAL.mode === 'tap'
        // 'tap': intervalo mínimo entre toques (antes de qualquer outra coisa: o toque rápido demais não conta).
        if (tap) {
          const last = lastTap.get(user.id) ?? 0
          if (now - last < STEAL.tapMinMs) throw new GameError('Calma! Um de cada vez.')
          lastTap.set(user.id, now)
          if (lastTap.size > 50_000) lastTap.clear()
        }
        const plot = await lockPlot(q, victim.id, a.idx)
        const row = toRow(plot)
        if (plotState(row, now) !== 'ripe') throw new GameError('Nada maduro nesse lote')
        const y = effectiveYield(row, now)
        const keep = keepOf(plot.seed_id)
        const qty = stealQty(y.total, y.left, undefined, keep)
        const key = harvestKey(plot.id, plot.sow_seq)
        const prev = (await q.query<{ qty: number; bitten: boolean }>(
          'select qty, bitten from steals where thief_id = $1 and harvest_key = $2 for update', [user.id, key])).rows[0]
        // No piso do dono: quem já pegou dali ouve "ganancioso"; quem chegou depois, "nada sobrando".
        if (qty <= 0) throw new GameError('O dono já está no limite; deixe o resto pra ele', prev?.qty ? 'greedy' : 'empty')
        if (prev && !tap) throw new GameError('Você já tentou esse lote nesta safra', 'greedy')
        if (prev?.bitten) throw new GameError('O cachorro não tira o olho de você nesse lote', 'greedy')

        const cap = stealDailyCap()
        const count = await bumpDaily(q, user.id, day, 'steal')
        if (count > cap) throw new GameError(tap ? `Limite de ${cap} por dia` : `Limite de ${cap} roubos por dia`, 'greedy')

        // Cachorro acordado pode morder: a tentativa conta (qty 0) e o ladrão paga ao dono.
        // No 'tap' a chance é por toque, calibrada para esvaziar o lote ter a chance da raça (rules.ts, biteChance),
        // e cai muito com o cachorro de costas para o lote (patrol.ts).
        const dog = await dogBite(q, user, victim, plotPos(plot.idx).x, y.total, now, keep)
        await q.query(
          `insert into steals (thief_id, victim_id, harvest_key, qty, bitten) values ($1, $2, $3, $4, $5)
           on conflict (thief_id, harvest_key) do update set qty = steals.qty + excluded.qty, bitten = steals.bitten or excluded.bitten`,
          [user.id, victim.id, key, dog.bitten ? 0 : qty, dog.bitten])

        if (dog.bitten) {
          note({ kind: 'bitten', ref: victim.id, meta: { lot: key, gold: dog.loss } })
          await pushEvent(q, victim.id, user.id, 'bitten', { gold: dog.loss, idx: plot.idx })
          return {
            message: `O ${dog.name} de ${victim.handle} te mordeu! −${dog.loss} de ouro`, bad: true, fx: { gold: -dog.loss },
            bite: { idx: plot.idx, gold: dog.loss, breed: dog.breed, owner: victim.handle }, away: dog.away,
          }
        }

        await q.query('update plots set yield_left = yield_left - $2 where id = $1', [plot.id, qty])
        const seed = SEED_BY_ID[plot.seed_id!]
        await addItem(q, user.id, seed.id, qty)
        // XP e missão: 1 vez por lote por safra (no 'tap', só no 1º toque). O aviso ao dono sai em todo toque.
        const first = !prev
        if (first) {
          await addXp(q, user, STEAL.xp)
          await mission(q, user.id, day, 'steal')
        }
        await stolenNotice(q, victim.id, user.id, { seedId: seed.id, qty, idx: plot.idx, key }, now)
        // `lot` = lote nesta safra: o painel conta roubos por lote (no 'tap' cada toque é um evento).
        note({ kind: 'steal', ref: victim.id, meta: { lot: key, qty, seed: seed.id } })
        return {
          message: `Pegou ${qty} ${seed.name} da horta de ${victim.handle}!`,
          fx: { xp: first ? STEAL.xp : undefined, item: seed.id, qty }, away: dog.away,
        }
      }
      case 'steal_animal': {
        // Produção dos bichos do amigo: 1 por toque, com o mesmo piso do dono, o mesmo limite do dia,
        // o mesmo intervalo entre toques e o mesmo cachorro (ovo, leite e mel "x1").
        const victim = (await q.query<UserRow>('select * from users where handle = $1 for update', [a.owner])).rows[0]
        if (!victim) throw new GameError('Fazenda não encontrada')
        if (victim.id === user.id) throw new GameError('Não dá pra roubar de si mesmo')
        if (!victim.is_bot && now - user.created_at.getTime() < STEAL.quarantineMs) {
          const min = Math.ceil((STEAL.quarantineMs - (now - user.created_at.getTime())) / 60_000)
          throw new GameError(`Fazendeiro novo ainda não rouba de amigos: faltam ${min} min. Treina na fazenda dos vizinhos!`)
        }
        const last = lastTap.get(user.id) ?? 0
        if (now - last < STEAL.tapMinMs) throw new GameError('Calma! Um de cada vez.')
        lastTap.set(user.id, now)
        const an = await lockAnimal(q, victim.id, a.slot)
        const l = LIVESTOCK[kindOfSlot(an.slot)!]
        const v = viewAnimal(toAnimal(an), now)
        if (!v?.ready) throw new GameError(nothingHere(l), 'animal_empty')
        const key = animalKey(an)
        const prev = (await q.query<{ qty: number; bitten: boolean }>(
          'select qty, bitten from steals where thief_id = $1 and harvest_key = $2 for update', [user.id, key])).rows[0]
        if (stealQty(v.produced!, v.left!, 'tap', l.keep) <= 0) throw new GameError('O dono já está no limite; deixe o resto pra ele', prev?.qty ? 'greedy' : 'empty')
        if (prev?.bitten) throw new GameError('O cachorro não tira o olho de você aqui', 'greedy')
        const cap = stealDailyCap('tap')
        if ((await bumpDaily(q, user.id, day, 'steal')) > cap) throw new GameError(`Limite de ${cap} por dia`, 'greedy')

        const dog = await dogBite(q, user, victim, await animalX(q, victim.id, an.slot), v.produced!, now, l.keep)
        await q.query(
          `insert into steals (thief_id, victim_id, harvest_key, qty, bitten) values ($1, $2, $3, $4, $5)
           on conflict (thief_id, harvest_key) do update set qty = steals.qty + excluded.qty, bitten = steals.bitten or excluded.bitten`,
          [user.id, victim.id, key, dog.bitten ? 0 : 1, dog.bitten])
        if (dog.bitten) {
          note({ kind: 'bitten', ref: victim.id, meta: { lot: key, gold: dog.loss } })
          await pushEvent(q, victim.id, user.id, 'bitten', { gold: dog.loss, slot: an.slot })
          return {
            message: `O ${dog.name} de ${victim.handle} te mordeu! −${dog.loss} de ouro`, bad: true, fx: { gold: -dog.loss },
            bite: { idx: -1, slot: an.slot, gold: dog.loss, breed: dog.breed, owner: victim.handle }, away: dog.away,
          }
        }
        await q.query('update animals set taken = taken + 1 where id = $1', [an.id])
        await addItem(q, user.id, l.product, 1)
        if (!prev) {
          await addXp(q, user, STEAL.xp)
          await mission(q, user.id, day, 'steal')
        }
        await stolenNotice(q, victim.id, user.id, { item: l.product, qty: 1, slot: an.slot, key }, now)
        note({ kind: 'steal', ref: victim.id, meta: { lot: key, qty: 1, item: l.product } })
        return {
          message: `Pegou 1 ${itemName(l.product)} de ${l.name} de ${victim.handle}!`,
          fx: { xp: prev ? undefined : STEAL.xp, item: l.product, qty: 1 }, away: dog.away,
        }
      }
      case 'collect_animal': {
        const an = await lockAnimal(q, user.id, a.slot)
        const l = LIVESTOCK[kindOfSlot(an.slot)!]
        const v = viewAnimal(toAnimal(an), now)
        if (!v?.ready) throw new GameError(nothingHere(l), 'animal_empty')
        const qty = v.left!
        // Bicho de corte (burro): colhido, sai da fazenda (regra do jogo). Os outros recomeçam o lote.
        if (l.meat) {
          await q.query('delete from animals where id = $1', [an.id])
          await q.query('delete from animal_spots where owner_id = $1 and animal = $2', [user.id, an.slot])
          await unwearAll(q, user.id, an.slot)
          await leaveHerd(q, user, an.slot)
        } else await restartBatch(q, an, now)
        if (qty > 0) await addItem(q, user.id, l.product, qty)
        const xp = Math.max(1, Math.round(qty / 5))
        await addXp(q, user, xp)
        await mission(q, user.id, day, 'harvest')
        const gone = l.meat ? ` ${l.name} saiu da fazenda.` : ''
        return { message: `Colheu ${qty} ${itemName(l.product)} de ${l.name} (+${xp} XP).${gone}`, fx: { xp, item: l.product, qty }, gone: l.meat ? an.slot : undefined }
      }
      case 'feed_animal': {
        const an = await lockAnimal(q, user.id, a.slot)
        const l = LIVESTOCK[kindOfSlot(an.slot)!]
        if (!isFeed(a.itemId) && a.itemId !== 'racao') throw new GameError('Isso não é comida de bicho')
        if (a.itemId !== l.feed) throw new GameError(wrongFood(l), 'wrong_food')
        const row = toAnimal(an)
        if (foodAt(row, now) >= FOOD.fullAt) throw new GameError('Já estou alimentado!', 'fed')
        await takeItem(q, user.id, a.itemId, 1, `Sem ${itemName(a.itemId).toLowerCase()}: compre na loja (Ferramentas)`)
        const st = settle(row, now)
        await q.query('update animals set fed_ms = $2, settled_at = $3, fed_until = $4 where id = $1',
          [an.id, st.fed_ms, new Date(now), new Date(feedUntil(row, now, feedPortion(l.feed)))])
        await addXp(q, user, FOOD.xp)
        return { message: `${l.name} comeu (+${FOOD.xp} XP)`, fx: { xp: FOOD.xp, item: a.itemId, qty: -1 } }
      }
      case 'wear': {
        // Acessório (lote O): vestir tira do inventário, tirar devolve. Só no adulto (a arte é do adulto) e só na espécie certa.
        const acc = ACCESSORY_BY_ID[String(a.acc)]
        if (!acc) throw new GameError('Acessório desconhecido')
        const animal = String(a.animal)
        if (a.on) {
          if (animal === 'dog') {
            if (acc.animal !== 'dog') throw new GameError(`${acc.name} não serve no cachorro`)
            if (!user.dog) throw new GameError('Você não tem cachorro')
          } else {
            const an = await lockAnimal(q, user.id, animal)
            const l = LIVESTOCK[kindOfSlot(an.slot)!]
            if (acc.animal !== l.kind) throw new GameError(`${acc.name} não serve em ${l.name.toLowerCase()}`)
            if (viewAnimal(toAnimal(an), now)?.look !== 'adult') throw new GameError('Ainda é filhote: o enfeite só serve no adulto')
          }
          await takeItem(q, user.id, accItem(acc.id), 1, `Sem ${acc.name.toLowerCase()}: compre na loja (aba Animais)`)
          const ins = await q.query('insert into wear (owner_id, animal, acc) values ($1, $2, $3) on conflict do nothing returning acc', [user.id, animal, acc.id])
          if (!ins.rows.length) throw new GameError('Já está vestindo')
          // Um enfeite por lugar do corpo (chapéu e coroa de flores na cabeça do burro se cobriam): o outro volta ao depósito.
          const same = ACCESSORIES.filter((o) => o.id !== acc.id && o.animal === acc.animal && o.spot === acc.spot).map((o) => o.id)
          const off = same.length ? (await q.query<{ acc: string }>('delete from wear where owner_id = $1 and animal = $2 and acc = any($3) returning acc', [user.id, animal, same])).rows : []
          for (const o of off) await addItem(q, user.id, accItem(o.acc), 1)
          const swapped = off.map((o) => ACCESSORY_BY_ID[o.acc]?.name.toLowerCase()).filter(Boolean)
          return { message: swapped.length ? `${acc.name} vestido! (${swapped.join(', ')} voltou ao depósito)` : `${acc.name} vestido!` }
        }
        const del = await q.query('delete from wear where owner_id = $1 and animal = $2 and acc = $3 returning acc', [user.id, animal, acc.id])
        if (!del.rows.length) throw new GameError('Não está vestindo isso')
        await addItem(q, user.id, accItem(acc.id), 1)
        return { message: `${acc.name} guardado no depósito` }
      }
      case 'give_bone': {
        if (!user.dog) throw new GameError('Você não tem cachorro')
        const have = (await q.query<{ qty: number }>("select qty from inventory where user_id = $1 and item_id = 'osso'", [user.id])).rows[0]?.qty ?? 0
        if (have <= 0) throw new GameError('Sem ossos: ganhe no bônus diário, nas missões e ajudando amigos')
        const before = dogLevel(user.dog_bones)
        if (before >= DOG_LEVEL.max) throw new GameError('Seu cachorro já está no nível máximo')
        const qty = Math.min(have, Math.max(1, Math.floor(a.qty ?? have)))
        await takeItem(q, user.id, 'osso', qty, 'Sem ossos')
        await q.query('update users set dog_bones = dog_bones + $2 where id = $1', [user.id, qty])
        user.dog_bones += qty
        const after = dogLevel(user.dog_bones)
        const next = dogNextLevel(user.dog_bones)
        const up = after > before ? ` Subiu para o nível ${after}!` : ''
        const left = next ? ` Faltam ${next.missing} ossos para o nível ${next.level}.` : ''
        return { message: `Deu ${qty} ${qty > 1 ? 'ossos' : 'osso'} ao cachorro.${up}${left}`, fx: { item: 'osso', qty: -qty } }
      }
    }
  })
}

export async function resetDbForTests() {
  const db = await getDb()
  await db.exec('truncate users, game_flags cascade')
  botsReady = false
  lastTap.clear()
  botExhausted.clear()
}

// ---------- convite (página pública /c/<código>) ----------

export type InviteCard = { handle: string; avatar: string | null; level: number; plots: number; ripe: number; friends: number }

/** Troca o rosto do fazendeiro (Minha conta). Só os 8 da arte (lote Q, A9). */
export async function setAvatar(userId: string, avatar: unknown): Promise<AvatarId> {
  if (!isAvatar(avatar)) throw new GameError('Escolha um dos rostos')
  await (await getDb()).query('update users set avatar = $2 where id = $1', [userId, avatar])
  return avatar
}

/** Dados públicos de quem convidou (para a página e a imagem de prévia do link). */
export async function inviteCard(code: string): Promise<InviteCard | null> {
  if (!/^[a-z0-9]{4,12}$/i.test(code)) return null
  const db = await getDb()
  const { rows } = await db.query<InviteCard>(
    `select u.handle, u.avatar, u.level,
       (select count(*)::int from plots p where p.owner_id = u.id) as plots,
       (select count(*)::int from plots p where p.owner_id = u.id and p.ready_at <= now() and not p.withered) as ripe,
       (select count(*)::int from friendships f where f.user_id = u.id) as friends
     from users u where u.invite_code = $1 and not u.is_bot`, [code.toLowerCase()])
  return rows[0] ?? null
}

/** Quem já tem conta e abre um convite vira amigo de quem convidou (sem bônus: bônus é só para conta nova). */
export async function acceptInviteAsFriend(userId: string, code: string): Promise<string | null> {
  return tx(async (q) => {
    const inviter = (await q.query<UserRow>('select * from users where invite_code = $1 and not is_bot', [code.toLowerCase()])).rows[0]
    if (!inviter || inviter.id === userId) return null
    if (await befriend(q, inviter.id, userId, 'add')) await pushEvent(q, inviter.id, userId, 'friend_added', {})
    return inviter.handle
  })
}

// ---------- level-up compartilhado ("Quem ver vai ganhar 100EXP", Evolução 07) ----------

export type ShareClaim =
  | { ok: true; xp: number; level: number; sharer: string }
  | { ok: false; reason: 'invalid' | 'self' | 'done' | 'limit' | 'sharer_limit'; sharer?: string }

const dailyCount = async (q: Q, userId: string, day: string, kind: string) =>
  (await q.query<{ count: number }>('select count from daily_counters where user_id = $1 and day = $2 and kind = $3', [userId, day, kind])).rows[0]?.count ?? 0

/** Quem abre o link de level-up (/c/<código>?n=<nível>) ganha SHARE_XP.xp: 1 vez por link, poucos links por dia. */
export async function claimShareXp(viewerId: string, code: string, level: number): Promise<ShareClaim> {
  if (!/^[a-z0-9]{4,12}$/i.test(code) || !Number.isInteger(level) || level < 2) return { ok: false, reason: 'invalid' }
  return tx(async (q) => {
    const sharer = (await q.query<UserRow>('select * from users where invite_code = $1 and not is_bot', [code.toLowerCase()])).rows[0]
    // O nível precisa ser um que quem compartilhou já alcançou (link inventado com nível alto não vale).
    if (!sharer || level > sharer.level) return { ok: false, reason: 'invalid' }
    if (sharer.id === viewerId) return { ok: false, reason: 'self', sharer: sharer.handle }
    // XP não altera chaves: permite as FKs de um resgate recíproco sem perder a exclusão do viewer.
    const viewer = await lockUser(q, viewerId, 'no key update')
    const day = gameDay(Date.now())
    const done = await q.query('select 1 from share_claims where viewer_id = $1 and sharer_id = $2 and level = $3', [viewer.id, sharer.id, level])
    if (done.rows.length) return { ok: false, reason: 'done', sharer: sharer.handle }
    if (await dailyCount(q, viewer.id, day, 'share_xp') >= SHARE_XP.perViewerDay) return { ok: false, reason: 'limit', sharer: sharer.handle }
    // Reserva atômica: viewers diferentes não compartilham o lockUser acima.
    // O UPSERT bloqueia/reconfere a cota no Postgres e também funciona no PGlite.
    const reserved = await q.query(
      `insert into daily_counters (user_id, day, kind, count) values ($1, $2, 'share_given', 1)
       on conflict (user_id, day, kind) do update set count = daily_counters.count + 1
       where daily_counters.count < $3 returning count`, [sharer.id, day, SHARE_XP.perSharerDay])
    if (!reserved.rows.length) return { ok: false, reason: 'sharer_limit', sharer: sharer.handle }
    await q.query('insert into share_claims (viewer_id, sharer_id, level, xp) values ($1, $2, $3, $4)', [viewer.id, sharer.id, level, SHARE_XP.xp])
    await bumpDaily(q, viewer.id, day, 'share_xp')
    await addXp(q, viewer, SHARE_XP.xp)
    await pushEvent(q, viewer.id, sharer.id, 'share_xp', { level, xp: SHARE_XP.xp })
    await pushEvent(q, sharer.id, viewer.id, 'share_seen', { level })
    return { ok: true, xp: SHARE_XP.xp, level, sharer: sharer.handle }
  })
}

// ---------- vitrine pública (ranking da página inicial) ----------

/**
 * Só o que a cena precisa para desenhar a fazenda de alguém para quem não está logado (server/vitrine.ts).
 * Leitura pura (não cria bichos nem mexe no bot) e sem nada que identifique o dono: nem id, nem apelido,
 * nem a semente da patrulha do cachorro (que é o id), nem o id dos enfeites.
 */
export async function vitrineFarmOf(q: Q, ownerId: string, now: number) {
  const owner = (await q.query<UserRow>('select * from users where id = $1', [ownerId])).rows[0]
  if (!owner) return null
  const plots: ScenePlot[] = (await q.query<PlotDb>('select * from plots where owner_id = $1 order by idx', [ownerId])).rows.map((p) => {
    const v = viewPlot(toRow(p), now)
    const growing = v.state === 'growing'
    return {
      idx: v.idx, state: v.state, seedId: v.seedId, pests: v.pests, weeds: v.weeds, dry: v.dry,
      // Só o estágio do desenho: sem plantio, colheita nem progresso (a barra diria quanto falta e, com a semente,
      // daria para refazer a hora exata do plantio).
      stage: growing ? stageAt(v.plantedAt!, v.readyAt!, now, stageFracs(SEED_BY_ID[v.seedId ?? ''])) : v.stage,
    }
  })
  const herd = herdIds(owner.herd)
  const inHerd = new Set<string>(herd)
  const livestock = (await loadAnimals(q, ownerId)).filter((a) => inHerd.has(a.slot)).flatMap((a) => {
    const v = viewAnimal(toAnimal(a), now)
    return v ? [v] : []
  })
  const spots: Spots = {}
  const placedHerd = new Set<AnimalId>([...herd, 'dog'])
  for (const r of (await q.query<{ animal: string; x: number; y: number }>('select animal, x, y from animal_spots where owner_id = $1', [ownerId])).rows) {
    if (isAnimalId(r.animal) && placedHerd.has(r.animal) && dropCheck(r.animal, r.x, r.y).ok) spots[r.animal] = { x: r.x, y: r.y }
  }
  const decor = await loadDecor(q, ownerId)
  const dog = breedOf(owner)
  return {
    plots,
    dog: dog ? { awake: (ms(owner.dog_fed_until) ?? 0) > now, breed: dog.id } : null,
    animals: spots,
    herd,
    looks: {
      looks: Object.fromEntries(livestock.map((a) => [a.slot, a.look])),
      wear: await wearOf(q, ownerId),
      ready: livestock.filter((a) => a.ready).map((a) => a.slot),
    },
    decor: { slots: decor.slots, placed: decor.placed.map((p, i) => ({ ...p, id: i + 1 })) },
  }
}
