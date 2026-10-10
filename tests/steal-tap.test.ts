// Roubo "x 1 por toque" (STEAL.mode = 'tap', o padrão) e a regra antiga ('chunk'), lado a lado.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { biteChance, ownerFloor, stealDailyCap, stealPool, stealQty } from '../src/game/rules'
import { STEAL } from '../src/game/config'
import { nextFacing } from '../src/game/patrol'
import { DOG_AREA, plotPos } from '../src/scene/layout'

const DOG_HOME = { x: Math.round((DOG_AREA.x0 + DOG_AREA.x1) / 2), y: Math.round((DOG_AREA.y0 + DOG_AREA.y1) / 2) }

describe('regras do roubo nos dois modos', () => {
  it("'tap' leva 1 por toque até o piso de 60%; 'chunk' leva 10% (mín. 1) até o piso", () => {
    expect(ownerFloor(10)).toBe(6)
    expect(stealPool(10)).toBe(4)
    expect(stealQty(10, 10, 'tap')).toBe(1)
    expect(stealQty(10, 7, 'tap')).toBe(1)
    expect(stealQty(10, 6, 'tap')).toBe(0)
    expect(stealQty(20, 20, 'chunk')).toBe(2)
    expect(stealQty(20, 13, 'chunk')).toBe(1)
    expect(stealQty(20, 12, 'chunk')).toBe(0)
  })

  it('limite diário: unidades no tap, tentativas no chunk', () => {
    expect(stealDailyCap('tap')).toBe(STEAL.dailyUnits)
    expect(stealDailyCap('chunk')).toBe(STEAL.dailyLimit)
    expect(STEAL.mode).toBe('tap') // padrão
  })

  it('mordida por toque: esvaziar o lote inteiro tem a mesma chance da raça', () => {
    for (const [bite, total] of [[0.25, 9], [0.4, 18], [0.55, 22], [0.55, 1]] as const) {
      const p = biteChance(bite, total, 'tap')
      const k = Math.max(1, stealPool(total))
      expect(1 - (1 - p) ** k).toBeCloseTo(bite, 10)
      expect(p).toBeLessThanOrEqual(bite)
    }
    expect(biteChance(0.55, 22, 'chunk')).toBe(0.55)
  })
})

process.env.PGLITE_DIR = 'memory://'
const { getDb } = await import('../src/server/db')
const game = await import('../src/server/game')
const db = await getDb()
const sql = (q: string, p: unknown[] = []) => db.query(q, p)
const user = async (handle: string) => (await sql('select * from users where handle = $1', [handle])).rows[0] as Record<string, any>

let me: string, bia: string
let t = 0
let clock: ReturnType<typeof vi.spyOn>
/** Um toque de roubo, 300 ms depois do anterior (passa do intervalo mínimo). */
const tap = (idx = 0, owner = 'bia') => { t += 300; clock.mockReturnValue(t); return game.runAction(me, { type: 'steal', owner, idx }) }

beforeAll(() => { vi.spyOn(Math, 'random').mockReturnValue(0.99) }) // sem sorte: nada seca, nada morde
afterEach(() => { vi.mocked(Math.random).mockReturnValue(0.99); clock.mockRestore() })
beforeEach(async () => {
  STEAL.mode = 'tap'
  await game.resetDbForTests()
  me = await game.loginOrCreate('ana')
  bia = await game.loginOrCreate('bia')
  await sql("update users set created_at = now() - interval '1 hour' where id = $1", [me])
  // Lote 0 da bia: nabo maduro com 10 (piso 6 → 4 para os amigos).
  await sql(`update plots set seed_id = 'nabo', planted_at = now() - interval '2 hours', ready_at = now() - interval '1 minute',
    yield_total = 10, yield_left = 10, sow_seq = 1 where owner_id = $1 and idx = 0`, [bia])
  t = Date.now()
  clock = vi.spyOn(Date, 'now').mockReturnValue(t)
})

describe("servidor no modo 'tap'", () => {
  it('cada toque leva 1; no piso de 60% vem o "ganancioso"', async () => {
    for (let i = 0; i < 4; i++) {
      const r = await tap()
      expect(r.fx).toMatchObject({ item: 'nabo', qty: 1 })
    }
    await expect(tap()).rejects.toMatchObject({ code: 'greedy' })
    expect((await sql('select yield_left from plots where owner_id = $1 and idx = 0', [bia])).rows[0]).toMatchObject({ yield_left: 6 })
    const f = await game.loadFarm(me)
    expect(f.inventory).toContainEqual({ itemId: 'nabo', qty: 4 })
  })

  it('XP, missão e aviso ao dono uma vez por lote; o aviso soma as unidades', async () => {
    const xp0 = (await user('ana')).xp
    await tap(); await tap(); await tap()
    expect((await user('ana')).xp).toBe(xp0 + STEAL.xp)
    const ev = (await sql("select payload from events where user_id = $1 and kind = 'stolen'", [bia])).rows as { payload: { qty: number } }[]
    expect(ev).toHaveLength(1)
    expect(ev[0].payload.qty).toBe(3)
    // Ainda dá para pegar (1 unidade acima do piso): o lote segue com a mãozinha.
    const v = await game.loadFarm(me, 'bia')
    expect(v.plots[0].canSteal).toBe(true)
    expect(v.me.stealsLeft).toBe(STEAL.dailyUnits - 3)
  })

  it('dois roubos seguidos em lotes diferentes: dois avisos em tempo real e duas linhas novas no mural da vítima', async () => {
    // Lote 1 da bia: cenoura que a ana já tinha tocado nesta safra, há mais tempo que STEAL.groupMs (prévia de 09/10:
    // o 2º roubo só somava na linha antiga do mural, sem aviso). O XP é 1 por lote por safra: o 2º vem sem XP (regra).
    await sql(`update plots set seed_id = 'cenoura', planted_at = now() - interval '3 hours', ready_at = now() - interval '1 minute',
      yield_total = 10, yield_left = 9, sow_seq = 1 where owner_id = $1 and idx = 1`, [bia])
    await tap(1)
    await sql("update events set created_at = now() - interval '1 hour' where user_id = $1", [bia])
    const before = (await sql("select max(id) as id from events where user_id = $1", [bia])).rows[0].id as number
    const { subscribe } = await import('../src/server/hub')
    const live: { kind: string; payload: Record<string, unknown> }[] = []
    const stop = subscribe(bia, (ev) => live.push(ev))
    t += 2_500
    const nabo = await tap(0)
    t += 2_500
    const cenoura = await tap(1)
    await new Promise((r) => setTimeout(r, 0)) // o aviso sai num microtask
    stop()
    expect(nabo.fx).toMatchObject({ xp: STEAL.xp, item: 'nabo', qty: 1 })
    expect(cenoura.fx).toMatchObject({ item: 'cenoura', qty: 1 })
    expect(cenoura.fx?.xp).toBeUndefined()
    expect(live.map((e) => [e.kind, e.payload.seedId, e.payload.qty, e.payload.actor])).toEqual([
      ['stolen', 'nabo', 1, 'ana'], ['stolen', 'cenoura', 1, 'ana']])
    const fresh = (await sql("select payload from events where user_id = $1 and kind = 'stolen' and id > $2 order by id", [bia, before])).rows as { payload: { seedId: string; qty: number } }[]
    expect(fresh.map((e) => [e.payload.seedId, e.payload.qty])).toEqual([['nabo', 1], ['cenoura', 1]])
  })

  it('toques seguidos no mesmo lote: 1 linha que volta ao topo do mural como nova, com o total', async () => {
    await tap(0)
    const first = (await sql("select id from events where user_id = $1 and kind = 'stolen'", [bia])).rows[0].id as number
    await tap(0)
    const rows = (await sql("select id, payload from events where user_id = $1 and kind = 'stolen'", [bia])).rows as { id: number; payload: { qty: number } }[]
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBeGreaterThan(first)
    expect(rows[0].payload.qty).toBe(2)
  })

  it('toques rápidos demais não contam (intervalo mínimo no servidor)', async () => {
    await tap()
    clock.mockReturnValue(t + STEAL.tapMinMs - 50)
    await expect(game.runAction(me, { type: 'steal', owner: 'bia', idx: 0 })).rejects.toThrow(/Calma/)
    expect((await sql('select yield_left from plots where owner_id = $1 and idx = 0', [bia])).rows[0]).toMatchObject({ yield_left: 9 })
  })

  it('limite diário conta unidades', async () => {
    const { gameDay } = await import('../src/game/rules')
    await sql("insert into daily_counters (user_id, day, kind, count) values ($1, $2, 'steal', $3)", [me, gameDay(t), STEAL.dailyUnits - 1])
    await tap()
    await expect(tap()).rejects.toMatchObject({ code: 'greedy', message: `Limite de ${STEAL.dailyUnits} por dia` })
  })

  it('a mordida é por toque, mostra a corrida (bite) e fecha o lote para o ladrão nesta safra', async () => {
    await sql("update users set dog = 'pastor', dog_fed_until = now() + interval '1 day' where id = $1", [bia])
    await sql('update users set gold = 1000 where id = $1', [me])
    await tap() // 0.99: passa
    // Cachorro de frente para o lote: 18% por toque (Pastor 55% espalhado nos 4 toques do lote) × 1,85 ≈ 33%.
    t = nextFacing(bia, DOG_HOME, plotPos(0).x, false, t + 300)! - 300
    vi.mocked(Math.random).mockReturnValue(0.1)
    const r = await tap()
    expect(r.bad).toBe(true)
    expect(r.bite).toEqual({ idx: 0, gold: 120, breed: 'pastor', owner: 'bia' }) // 12% de 1000
    vi.mocked(Math.random).mockReturnValue(0.99)
    await expect(tap()).rejects.toMatchObject({ code: 'greedy' })
    expect((await game.loadFarm(me, 'bia')).plots[0].canSteal).toBe(false)
    expect((await user('bia')).gold).toBe(200 + 120)
  })
})

describe("servidor no modo 'chunk'", () => {
  it('uma tentativa por lote leva 10%; a segunda vira "ganancioso"', async () => {
    STEAL.mode = 'chunk'
    const r = await tap()
    expect(r.fx).toMatchObject({ item: 'nabo', qty: 1 })
    await expect(tap()).rejects.toMatchObject({ code: 'greedy', message: expect.stringMatching(/já tentou/) })
    const f = await game.loadFarm(me, 'bia')
    expect(f.plots[0].canSteal).toBe(false)
    expect(f.me.stealsLeft).toBe(STEAL.dailyLimit - 1)
  })
})
