// Decoração no servidor (frente J): comprar peça ou conjunto, equipar, e pôr/mover/guardar enfeites
// e caminhos na grade. Tudo validado aqui (regras puras em game/decor.ts e game/decor-grid.ts).
import { DECOR } from '@/game/config'
import {
  DEFAULT_SERIES, DEFAULT_SLOTS, decorName, decorXp, isLoose, isPath, ORNAMENT_BY_ID, PATH_BY_ID, parsePiece, pieceId, piecePrice,
  SERIES_BY_ID, setPrice, SLOT_NAMES, SLOTS, type Slot, type Slots,
} from '@/game/decor'
import { limitCheck, placeCheck, type Placed } from '@/game/decor-grid'
import { GameError } from '@/game/rules'
import type { Spots } from '@/game/pasture'
import type { Q } from './db'

/** Decoração da fazenda que está na tela (o visitante vê a do dono). */
export type DecorView = { slots: Slots; placed: Placed[] }
/** O que o jogador tem (Depósito > Minha decoração e a loja). */
export type MyDecor = {
  owned: Record<string, number> // peças (1), enfeites e células de caminho compradas
  slots: Slots
  used: Record<string, number> // quantos de cada item solto estão na fazenda
  ornaments: number; maxOrnaments: number
  pathCells: number; maxPathCells: number
}

export type DecorAction =
  | { type: 'decor_buy'; itemId: string; qty?: number } // peça "casa:inverno", enfeite ou pacote de caminho
  | { type: 'decor_buy_set'; series: string }
  | { type: 'decor_equip'; slot: Slot; series: string }
  | { type: 'decor_place'; itemId: string; u: number; v: number }
  | { type: 'decor_move'; id: number; u: number; v: number }
  | { type: 'decor_store'; id: number }
  | { type: 'decor_paint'; itemId: string; cells: [number, number][] }
  | { type: 'decor_erase'; cells: [number, number][] }

export const DECOR_ACTIONS = new Set<DecorAction['type']>([
  'decor_buy', 'decor_buy_set', 'decor_equip', 'decor_place', 'decor_move', 'decor_store', 'decor_paint', 'decor_erase',
])
export const isDecorAction = (a: { type: string }): a is DecorAction => DECOR_ACTIONS.has(a.type as DecorAction['type'])

type Me = { id: string; level: number; gold: number; xp: number }
/** Funções de game.ts (ouro com registro no ledger, XP com subida de nível, evento no Mural). */
export type DecorHelpers = {
  addGold: (delta: number, reason: string) => Promise<void>
  addXp: (xp: number) => Promise<void>
  event: (kind: string, payload: Record<string, unknown>) => Promise<void>
  animals: () => Promise<Spots>
  onSale: (seriesId: string) => Promise<boolean> // série de evento: só à venda na época (game/events.ts)
}
export type DecorResult = { message: string; fx?: { gold?: number; xp?: number }; placed?: Placed[] }

export async function loadSlots(q: Q, userId: string): Promise<Slots> {
  const slots = { ...DEFAULT_SLOTS }
  for (const r of (await q.query<{ slot: string; series: string }>('select slot, series from decor_slots where user_id = $1', [userId])).rows) {
    if ((SLOTS as readonly string[]).includes(r.slot) && SERIES_BY_ID[r.series]) slots[r.slot as Slot] = r.series
  }
  return slots
}

export async function loadPlaced(q: Q, ownerId: string, lock = false): Promise<Placed[]> {
  const { rows } = await q.query<{ id: string | number; item_id: string; u: number; v: number }>(
    `select id, item_id, u, v from decor_placed where owner_id = $1 order by id${lock ? ' for update' : ''}`, [ownerId])
  return rows.filter((r) => isLoose(r.item_id)).map((r) => ({ id: Number(r.id), itemId: r.item_id, u: r.u, v: r.v }))
}

async function loadOwned(q: Q, userId: string): Promise<Record<string, number>> {
  const { rows } = await q.query<{ item_id: string; qty: number }>('select item_id, qty from decor_owned where user_id = $1 and qty > 0', [userId])
  return Object.fromEntries(rows.map((r) => [r.item_id, r.qty]))
}

export async function loadDecor(q: Q, ownerId: string): Promise<DecorView> {
  return { slots: await loadSlots(q, ownerId), placed: await loadPlaced(q, ownerId) }
}

export async function loadMyDecor(q: Q, me: { id: string; level: number }, placed?: Placed[]): Promise<MyDecor> {
  const mine = placed ?? await loadPlaced(q, me.id)
  const used: Record<string, number> = {}
  for (const p of mine) used[p.itemId] = (used[p.itemId] ?? 0) + 1
  const pathCells = mine.filter((p) => isPath(p.itemId)).length
  return {
    owned: await loadOwned(q, me.id), slots: await loadSlots(q, me.id), used,
    ornaments: mine.length - pathCells, maxOrnaments: DECOR.maxOrnaments(me.level), pathCells, maxPathCells: DECOR.maxPathCells,
  }
}

export async function addOwned(q: Q, userId: string, itemId: string, qty: number) {
  await q.query(
    `insert into decor_owned (user_id, item_id, qty) values ($1, $2, $3)
     on conflict (user_id, item_id) do update set qty = decor_owned.qty + excluded.qty`, [userId, itemId, qty])
}

async function equip(q: Q, userId: string, slot: Slot, series: string) {
  if (series === DEFAULT_SERIES) await q.query('delete from decor_slots where user_id = $1 and slot = $2', [userId, slot])
  else {
    await q.query(
      `insert into decor_slots (user_id, slot, series) values ($1, $2, $3)
       on conflict (user_id, slot) do update set series = excluded.series`, [userId, slot, series])
  }
}

const cellsOf = (raw: unknown): [number, number][] => {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 200) throw new GameError('Células inválidas')
  return raw.map((c) => {
    if (!Array.isArray(c) || !Number.isInteger(c[0]) || !Number.isInteger(c[1])) throw new GameError('Célula inválida')
    return [c[0], c[1]] as [number, number]
  })
}

/** Ações de decoração. Sempre na própria fazenda: o visitante só olha. */
export async function decorAction(q: Q, me: Me, a: DecorAction, h: DecorHelpers): Promise<DecorResult> {
  switch (a.type) {
    case 'decor_buy': {
      const piece = parsePiece(a.itemId)
      if (piece) {
        const { slot, series } = piece
        if (series.id === DEFAULT_SERIES) throw new GameError('Essa peça todo mundo já tem')
        if (!(await h.onSale(series.id))) throw new GameError(`A série ${series.name} só está à venda na época do evento`)
        if (me.level < series.minLevel) throw new GameError(`A série ${series.name} libera no nível ${series.minLevel}`)
        const owned = await loadOwned(q, me.id)
        if (owned[a.itemId]) throw new GameError('Você já tem essa peça: equipe em Depósito > Minha decoração')
        const gold = piecePrice(series, slot)
        await h.addGold(-gold, `decor:${a.itemId}`)
        await addOwned(q, me.id, a.itemId, 1)
        await equip(q, me.id, slot, series.id)
        const xp = decorXp(gold)
        if (xp) await h.addXp(xp)
        await h.event('decor_bought', { itemId: a.itemId, gold })
        return { message: `${series.pieces[slot]} no lugar! (${SLOT_NAMES[slot]} da série ${series.name})`, fx: { gold: -gold, xp: xp || undefined } }
      }
      const qty = Math.floor(a.qty ?? 1)
      if (!(qty >= 1 && qty <= 10)) throw new GameError('Quantidade inválida')
      const orn = ORNAMENT_BY_ID[a.itemId], path = PATH_BY_ID[a.itemId]
      const item = orn ?? path
      if (!item) throw new GameError('Item de decoração desconhecido')
      if (me.level < item.minLevel) throw new GameError(`${item.name} libera no nível ${item.minLevel}`)
      const gold = item.gold * qty
      await h.addGold(-gold, `decor:${a.itemId}`)
      await addOwned(q, me.id, a.itemId, path ? qty * DECOR.pathPack : qty)
      const xp = decorXp(gold)
      if (xp) await h.addXp(xp)
      await h.event('decor_bought', { itemId: a.itemId, qty, gold })
      const what = path ? `${qty * DECOR.pathPack} células de ${item.name.toLowerCase()}` : `${qty} × ${item.name}`
      return { message: `Comprou ${what}. Ponha na fazenda pelo martelo 🔨`, fx: { gold: -gold, xp: xp || undefined } }
    }
    case 'decor_buy_set': {
      const series = SERIES_BY_ID[a.series]
      if (!series || series.id === DEFAULT_SERIES) throw new GameError('Série desconhecida')
      if (!(await h.onSale(series.id))) throw new GameError(`A série ${series.name} só está à venda na época do evento`)
      if (me.level < series.minLevel) throw new GameError(`A série ${series.name} libera no nível ${series.minLevel}`)
      const owned = await loadOwned(q, me.id)
      const price = setPrice(series, (s) => !!owned[pieceId(s, series.id)])
      if (!price.missing.length) throw new GameError(`Você já tem a série ${series.name} inteira`)
      await h.addGold(-price.gold, `decor_set:${series.id}`)
      for (const s of price.missing) await addOwned(q, me.id, pieceId(s, series.id), 1)
      for (const s of SLOTS) await equip(q, me.id, s, series.id)
      const xp = decorXp(price.gold)
      if (xp) await h.addXp(xp)
      await h.event('decor_bought', { series: series.id, gold: price.gold })
      const saved = price.full - price.gold
      return { message: `Série ${series.name} completa na fazenda!${saved ? ` (economizou ${saved} de ouro)` : ''}`, fx: { gold: -price.gold, xp: xp || undefined } }
    }
    case 'decor_equip': {
      if (!(SLOTS as readonly string[]).includes(a.slot)) throw new GameError('Lugar inválido')
      const series = SERIES_BY_ID[a.series]
      if (!series) throw new GameError('Série desconhecida')
      if (series.id !== DEFAULT_SERIES && !(await loadOwned(q, me.id))[pieceId(a.slot, series.id)]) throw new GameError('Você não tem essa peça: compre na loja')
      await equip(q, me.id, a.slot, series.id)
      return { message: `${SLOT_NAMES[a.slot]}: ${series.pieces[a.slot]}` }
    }
    case 'decor_place': {
      if (!ORNAMENT_BY_ID[a.itemId]) throw new GameError('Enfeite desconhecido')
      const placed = await loadPlaced(q, me.id, true)
      const owned = (await loadOwned(q, me.id))[a.itemId] ?? 0
      if (placed.filter((p) => p.itemId === a.itemId).length >= owned) throw new GameError('Você não tem esse enfeite guardado: compre na loja')
      const lim = limitCheck(a.itemId, placed, me.level)
      if (!lim.ok) throw new GameError(lim.reason)
      const chk = placeCheck(a.itemId, a.u, a.v, placed, await h.animals())
      if (!chk.ok) throw new GameError(chk.reason)
      const id = Number((await q.query<{ id: string }>(
        'insert into decor_placed (owner_id, item_id, u, v) values ($1, $2, $3, $4) returning id', [me.id, a.itemId, a.u, a.v])).rows[0].id)
      return { message: `${decorName(a.itemId)} na fazenda`, placed: [{ id, itemId: a.itemId, u: a.u, v: a.v }] }
    }
    case 'decor_move': {
      const placed = await loadPlaced(q, me.id, true)
      const it = placed.find((p) => p.id === Number(a.id))
      if (!it || isPath(it.itemId)) throw new GameError('Enfeite não encontrado')
      const chk = placeCheck(it.itemId, a.u, a.v, placed, await h.animals(), it.id)
      if (!chk.ok) throw new GameError(chk.reason)
      await q.query('update decor_placed set u = $2, v = $3 where id = $1', [it.id, a.u, a.v])
      return { message: `${decorName(it.itemId)} no lugar novo` }
    }
    case 'decor_store': {
      const { rows } = await q.query<{ item_id: string }>('delete from decor_placed where id = $1 and owner_id = $2 returning item_id', [Number(a.id), me.id])
      if (!rows[0]) throw new GameError('Enfeite não encontrado')
      return { message: `${decorName(rows[0].item_id)} guardado no Depósito` }
    }
    case 'decor_paint': {
      const kind = PATH_BY_ID[a.itemId]
      if (!kind) throw new GameError('Caminho desconhecido')
      const cells = cellsOf(a.cells)
      const placed = await loadPlaced(q, me.id, true)
      let stock = ((await loadOwned(q, me.id))[a.itemId] ?? 0) - placed.filter((p) => p.itemId === a.itemId).length
      if (stock <= 0) throw new GameError(`Acabou o ${kind.name.toLowerCase()}: compre mais na loja`)
      const animals = await h.animals()
      const added: Placed[] = []
      let first: string | null = null
      for (const [u, v] of cells) {
        if (stock <= 0) break
        const chk = placeCheck(a.itemId, u, v, placed, animals)
        const lim = limitCheck(a.itemId, placed, me.level)
        if (!chk.ok || !lim.ok) { first ??= !chk.ok ? chk.reason : (lim as { reason: string }).reason; continue }
        const id = Number((await q.query<{ id: string }>(
          'insert into decor_placed (owner_id, item_id, u, v) values ($1, $2, $3, $4) returning id', [me.id, a.itemId, u, v])).rows[0].id)
        const p = { id, itemId: a.itemId, u, v }
        placed.push(p)
        added.push(p)
        stock--
      }
      if (!added.length) throw new GameError(first ?? 'Nada pintado')
      return { message: `${added.length} ${added.length > 1 ? 'células' : 'célula'} de ${kind.name.toLowerCase()}`, placed: added }
    }
    case 'decor_erase': {
      const cells = cellsOf(a.cells)
      const placed = await loadPlaced(q, me.id, true)
      const want = new Set(cells.map(([u, v]) => `${u},${v}`))
      const ids = placed.filter((p) => isPath(p.itemId) && want.has(`${p.u},${p.v}`)).map((p) => p.id)
      if (!ids.length) throw new GameError('Não há caminho aqui')
      await q.query('delete from decor_placed where owner_id = $1 and id = any($2)', [me.id, ids])
      return { message: `Guardou ${ids.length} ${ids.length > 1 ? 'células' : 'célula'} de caminho` }
    }
  }
}
