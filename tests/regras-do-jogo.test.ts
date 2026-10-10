// Regras do jogo: cachorro de costas, nível por ossos,
// bichos produtivos, adubos, terrenos e culturas em escala. Regras puras primeiro, servidor depois.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PATROL, DOG_BREEDS, PACE, origAnimalMs } from '../src/game/config'
import { facingTo, nextFacing, patrolAt, patrolLegs } from '../src/game/patrol'
import { biteChance, dogLevel, dogNextLevel, dogPower, tapBiteChance } from '../src/game/rules'
import { ACCESSORY_BY_ID, batchSize, FEEDS, LIVESTOCK, PRODUCTS, foodFullMs, viewAnimal, wrongFood, type AnimalRow } from '../src/game/livestock'
import { SEED_BY_ID, SEEDS, SHOP, SHOP_BY_ID } from '../src/game/catalog'
import { DOG_AREA, plotPos } from '../src/scene/layout'

const HOME = { x: Math.round((DOG_AREA.x0 + DOG_AREA.x1) / 2), y: Math.round((DOG_AREA.y0 + DOG_AREA.y1) / 2) }

describe('patrulha do cachorro (de frente / de costas)', () => {
  it('determinística: mesma semente e mesmo relógio, mesmo estado', () => {
    const t = 1_791_500_000_000
    expect(patrolAt('dono-1', HOME, t)).toEqual(patrolAt('dono-1', HOME, t))
    // Sementes diferentes não andam juntas.
    const a = Array.from({ length: 40 }, (_, i) => patrolAt('dono-1', HOME, t + i * 500).facing)
    const b = Array.from({ length: 40 }, (_, i) => patrolAt('dono-2', HOME, t + i * 500).facing)
    expect(a).not.toEqual(b)
  })

  it('anda entre duas pontas livres (nunca entra na casinha) e olha para onde anda', () => {
    const { left, right } = patrolLegs(HOME)
    expect(left).toBeLessThan(HOME.x)
    expect(right).toBeGreaterThanOrEqual(HOME.x)
    expect(right).toBeLessThan(188) // casinha começa em x 188
    for (let t = 0; t < PATROL.cycleMs * 3; t += 137) {
      const p = patrolAt('x', HOME, 1e12 + t)
      expect(p.x).toBeGreaterThanOrEqual(left - 1e-6)
      expect(p.x).toBeLessThanOrEqual(right + 1e-6)
    }
  })

  it('cada lote fica de costas uma boa parte do tempo, e de frente o resto', () => {
    for (const idx of [0, 3, 9, 14, 23]) {
      const x = plotPos(idx).x
      let back = 0, n = 0
      for (let t = 0; t < PATROL.cycleMs * 50; t += 250, n++) if (facingTo(patrolAt('dono', HOME, 1e12 + t), x) === 'back') back++
      expect(back / n).toBeGreaterThan(0.25)
      expect(back / n).toBeLessThan(0.75)
    }
  })

  it('lote reto embaixo do cachorro: ele vê (conta como de frente)', () => {
    const p = { x: 100, y: 0, facing: 1 as const, walking: false }
    expect(facingTo(p, 100 - PATROL.deadZone / 2)).toBe('front')
    expect(facingTo(p, 40)).toBe('back')
    expect(facingTo(p, 160)).toBe('front')
  })

  it('a chance por toque: de costas é muito baixa, de frente é alta, e a média fica na calibração do modo tap', () => {
    const b = DOG_BREEDS.pastor.bite
    const base = biteChance(b, 22, 'tap')
    const back = tapBiteChance(b, 22, true, 'tap'), front = tapBiteChance(b, 22, false, 'tap')
    expect(back).toBeCloseTo(base * 0.15, 10)
    expect(front).toBeCloseTo(base * 1.85, 10)
    expect((back + front) / 2).toBeCloseTo(base, 10)
    expect(tapBiteChance(0.99, 1, false, 'tap')).toBe(PATROL.maxBite)
  })

  it('nextFacing acha a próxima janela de costas e de frente', () => {
    const x = plotPos(0).x, t0 = 1_800_000_000_000
    const away = nextFacing('d', HOME, x, true, t0)!, front = nextFacing('d', HOME, x, false, t0)!
    expect(facingTo(patrolAt('d', HOME, away), x) === 'back' || facingTo(patrolAt('d', HOME, away - PATROL.graceMs), x) === 'back').toBe(true)
    expect(facingTo(patrolAt('d', HOME, front), x)).toBe('front')
  })
})

describe('nível do cachorro por ossos', () => {
  it('nível N pede 10·N ossos (10, 20, 30…), até o 5', () => {
    expect([0, 9, 10, 29, 30, 59, 60, 100, 150, 999].map(dogLevel)).toEqual([0, 0, 1, 1, 2, 2, 3, 4, 5, 5])
    expect(dogNextLevel(0)).toEqual({ level: 1, missing: 10, have: 0, need: 10 })
    expect(dogNextLevel(14)).toEqual({ level: 2, missing: 16, have: 4, need: 20 })
    expect(dogNextLevel(150)).toBeNull()
  })

  it('o nível aumenta a proteção e a multa', () => {
    const b = DOG_BREEDS.vira_lata
    const p0 = dogPower(b, 0), p5 = dogPower(b, 5)
    expect(p0).toEqual({ bite: b.bite, finePct: b.finePct, fineMax: b.fineMax })
    expect(p5.bite).toBeCloseTo(1 - 0.75 * 0.7, 10)
    expect(p5.finePct).toBeCloseTo(0.075, 10)
    expect(p5.fineMax).toBe(150)
  })
})

describe('bichos produtivos (regras)', () => {
  const t0 = 1_800_000_000_000
  const row = (o: Partial<AnimalRow> = {}): AnimalRow => ({
    id: 'a1', slot: 'chicken', kind: 'chicken', fed_until: t0 + foodFullMs(), fed_ms: 0, settled_at: t0, cycle_from: 0, batch_seq: 0, taken: 0, ...o,
  })

  it('filhote: estágios com tempo ("22H58M para Estágio 3"), só alimentado', () => {
    const v = viewAnimal(row(), t0 + 60_000)!
    expect(v).toMatchObject({ stage: 1, stages: 3, food: 100, ready: false })
    expect(v.nextStageMs).toBe(origAnimalMs(24) - 60_000)
    // A ração acaba no meio do caminho: o tempo do bicho para.
    const hungry = row({ fed_until: t0 + 1000 })
    expect(viewAnimal(hungry, t0 + 10 * 3600_000)!).toMatchObject({ stage: 1, food: 0, hungry: true, nextStageMs: origAnimalMs(24) - 1000 })
  })

  it('a barra de alimento cai com o tempo (x/100)', () => {
    expect(viewAnimal(row(), t0)!.food).toBe(100)
    expect(viewAnimal(row(), t0 + foodFullMs() / 2)!.food).toBe(50)
    expect(viewAnimal(row(), t0 + foodFullMs())!.food).toBe(0)
  })

  it('adulto produz um lote por ciclo ("produzido N, restam M") e o tamanho é fixo por lote', () => {
    const grown = origAnimalMs(48)
    const adult = row({ fed_ms: grown, cycle_from: grown, fed_until: t0 + 10 * foodFullMs() })
    const cyc = origAnimalMs(LIVESTOCK.chicken.cycleH)
    expect(viewAnimal(adult, t0 + cyc - 1)!).toMatchObject({ stage: 3, ready: false, cycleLeftMs: 1 })
    const ready = viewAnimal({ ...adult, taken: 3 }, t0 + cyc)!
    const n = batchSize(adult, LIVESTOCK.chicken)
    expect(ready).toMatchObject({ ready: true, produced: n, left: n - 3 })
    expect(n).toBeGreaterThanOrEqual(20)
    expect(n).toBeLessThanOrEqual(26)
  })

  it('comida certa por bicho; a errada tem fala de recusa', () => {
    expect(LIVESTOCK.chicken.feed).toBe('racao_aves')
    expect(LIVESTOCK.cow.feed).toBe('feno')
    expect(wrongFood(LIVESTOCK.goat)).toBe('Essa comida não é adequada para Cabra!')
    expect(Object.keys(FEEDS)).toEqual(['racao_aves', 'feno', 'lavagem', 'racao_crescem', 'xarope'])
    expect(LIVESTOCK.donkey.feed).toBe('racao_crescem')
  })

  it('burro é de corte (10 dias, 160 × 1.299); galinha, vaca, ovelha e abelhas só produzem', () => {
    const d = LIVESTOCK.donkey
    expect(d).toMatchObject({ meat: true, product: 'carne', yieldMin: 160, yieldMax: 160, origGold: 100000 })
    expect(d.stagesH.reduce((a, h) => a + h, 0)).toBe(240)
    expect(PRODUCTS.carne.origPrice).toBe(1299)
    for (const k of ['chicken', 'cow', 'sheep', 'bee'] as const) expect(LIVESTOCK[k].meat).toBeFalsy()
    expect(LIVESTOCK.pig).toMatchObject({ meat: true, product: 'carne_porco', yieldMin: 100 }) // 100 × 1.800; sem trufa no depósito
    expect(PRODUCTS.carne_porco.origPrice).toBe(1800)
    // Maduro, o lote é o próprio bicho: "plantado 160, ainda restam 160".
    const grown = origAnimalMs(240)
    const v = viewAnimal({ id: 'b', slot: 'donkey', kind: 'donkey', fed_until: t0 + 1e9, fed_ms: grown, settled_at: t0, cycle_from: 0, batch_seq: 0, taken: 0 }, t0)!
    expect(v).toMatchObject({ meat: true, ready: true, produced: 160, left: 160, stage: 5 })
    const young = viewAnimal({ id: 'b', slot: 'donkey', kind: 'donkey', fed_until: t0 + 1e9, fed_ms: 0, settled_at: t0, cycle_from: 0, batch_seq: 0, taken: 0 }, t0)!
    expect(young).toMatchObject({ ready: false, stage: 1, stages: 5 })
  })
})

describe('catálogo em escala e arte', () => {
  it('culturas: preço × PACE.gold e tempo × PACE.time (morango 1.550 → 155; bromélia 8 safras de 33 h + 15 h)', () => {
    // Evolução 06: valores de balanceamento (morango 31 h e 3 safras; berinjela 800, não 300).
    expect(SEED_BY_ID.morango).toMatchObject({ cost: 155, seasons: 3, growMinutes: 31 * 60 * PACE.time })
    expect(SEED_BY_ID.berinjela.cost).toBe(80)
    expect(SEED_BY_ID.melancia.cost).toBe(198)
    expect(SEED_BY_ID.bromelia).toMatchObject({ seasons: 8, growMinutes: 33 * 60 * PACE.time, regrowMinutes: 15 * 60 * PACE.time, yieldMin: 60, yieldMax: 60, sellPrice: 12.6, cost: 856, minLevel: 20 })
    expect(SEED_BY_ID.maca.seasons).toBe(3)
  })

  it('cultura sem arte fica fora da loja; com arte, os desenhos existem (marcação honesta)', () => {
    const art = (id: string) => existsSync(path.join(process.cwd(), 'public/art/crops1', `${id}_0.png`))
    for (const s of SEEDS) expect(art(s.id)).toBe(!s.needsArt)
    for (const s of SEEDS.filter((x) => x.needsArt)) expect(SHOP_BY_ID[`semente:${s.id}`]).toBeUndefined()
  })

  it('bicho sem arte fica fora da loja; rações e os 3 adubos estão na aba Ferramentas', () => {
    for (const l of Object.values(LIVESTOCK)) if (!l.art) expect(SHOP_BY_ID[`bicho:${l.kind}`]).toBeUndefined()
    const tools = SHOP.filter((i) => i.tab === 'ferramentas').map((i) => i.id)
    expect(tools).toEqual(expect.arrayContaining(['adubo', 'adubo_forte', 'adubo_super', 'racao_aves', 'feno', 'lavagem', 'xarope']))
  })
})

// ---------- servidor ----------
process.env.PGLITE_DIR = 'memory://'
const { getDb } = await import('../src/server/db')
const game = await import('../src/server/game')
const db = await getDb()
const sql = (q: string, p: unknown[] = []) => db.query(q, p)
const user = async (handle: string) => (await sql('select * from users where handle = $1', [handle])).rows[0] as Record<string, any>
const animal = async (owner: string, slot: string) => (await sql('select * from animals where owner_id = $1 and slot = $2', [owner, slot])).rows[0] as Record<string, any>

let ana: string, bia: string
let clock: ReturnType<typeof vi.spyOn> | null = null
beforeEach(async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.99)
  await game.resetDbForTests()
  ana = await game.loginOrCreate('ana')
  bia = await game.loginOrCreate('bia')
  await sql("update users set created_at = now() - interval '1 hour' where id = $1", [ana])
})
afterEach(() => { clock?.mockRestore(); clock = null; vi.mocked(Math.random).mockReturnValue(0.99) })

/** Deixa o lote pronto do bicho (tempo alimentado = adulto + 1 ciclo). */
async function readyBatch(owner: string, slot: string) {
  const a = await animal(owner, slot)
  const l = LIVESTOCK[a.kind as keyof typeof LIVESTOCK]
  const cyc = origAnimalMs(l.cycleH)
  await sql('update animals set fed_ms = cycle_from + $2 where id = $1', [a.id, cyc])
}

describe('bichos produtivos no servidor', () => {
  it('a fazenda já vem com galinhas, vaca e ovelha adultas, porco filhote, todos de barriga cheia', async () => {
    const f = await game.loadFarm(ana)
    expect(f.livestock.map((a) => a.slot).sort()).toEqual(['chicken', 'chicken2', 'cow', 'pig', 'sheep'])
    for (const a of f.livestock.filter((x) => x.slot !== 'pig')) expect(a).toMatchObject({ food: 100, stage: a.stages, ready: false, meat: false })
    expect(f.livestock.find((a) => a.slot === 'pig')).toMatchObject({ food: 100, stage: 1, stages: 5, meat: true, ready: false })
  })

  it('porco é de corte: maduro vira carne, sai da fazenda e não volta sozinho', async () => {
    await sql('update animals set fed_ms = $2 where owner_id = $1 and slot = $3', [ana, origAnimalMs(168), 'pig']) // 24 + 48 + 48 + 48 h
    expect((await game.loadFarm(ana)).livestock.find((a) => a.slot === 'pig')).toMatchObject({ ready: true, produced: 100, left: 100 })
    const r = await game.runAction(ana, { type: 'collect_animal', slot: 'pig' })
    expect(r).toMatchObject({ gone: 'pig', fx: { item: 'carne_porco', qty: 100 } })
    expect((await game.loadFarm(ana)).livestock.map((a) => a.slot)).not.toContain('pig')
  })

  it('colher dá o lote inteiro ("x N"), XP e recomeça o ciclo', async () => {
    await readyBatch(ana, 'chicken')
    const v = (await game.loadFarm(ana)).livestock.find((a) => a.slot === 'chicken')!
    expect(v.ready).toBe(true)
    const r = await game.runAction(ana, { type: 'collect_animal', slot: 'chicken' })
    expect(r.fx).toMatchObject({ item: 'ovo', qty: v.produced })
    const after = (await game.loadFarm(ana)).livestock.find((a) => a.slot === 'chicken')!
    expect(after.ready).toBe(false)
    expect(after.cycleLeftMs).toBeGreaterThan(0)
    await expect(game.runAction(ana, { type: 'collect_animal', slot: 'chicken' })).rejects.toMatchObject({ code: 'animal_empty' })
  })

  it('vende o produto no depósito', async () => {
    await readyBatch(ana, 'cow')
    await game.runAction(ana, { type: 'collect_animal', slot: 'cow' })
    const r = await game.runAction(ana, { type: 'sell', itemId: 'leite' })
    expect(r.fx?.gold).toBeGreaterThan(0)
  })

  it('amigo pega 1 por toque até o piso do dono; bicho sem produção responde com balão', async () => {
    await expect(game.runAction(ana, { type: 'steal_animal', owner: 'bia', slot: 'pig' }))
      .rejects.toMatchObject({ code: 'animal_empty', message: 'Porco: não há nada para pegar aqui.' })
    await readyBatch(bia, 'chicken')
    const n = (await game.loadFarm(ana, 'bia')).livestock.find((a) => a.slot === 'chicken')!.produced!
    const pool = n - Math.ceil(n * LIVESTOCK.chicken.keep! - 1e-9) // piso do banco: 40 de 50 (80%)
    let t = Date.now()
    clock = vi.spyOn(Date, 'now')
    for (let i = 0; i < pool; i++) {
      t += 300; clock.mockReturnValue(t)
      const r = await game.runAction(ana, { type: 'steal_animal', owner: 'bia', slot: 'chicken' })
      expect(r.fx).toMatchObject({ item: 'ovo', qty: 1 })
    }
    t += 300; clock.mockReturnValue(t)
    await expect(game.runAction(ana, { type: 'steal_animal', owner: 'bia', slot: 'chicken' })).rejects.toMatchObject({ code: 'greedy' })
    const f = await game.loadFarm(ana, 'bia')
    expect(f.livestock.find((a) => a.slot === 'chicken')).toMatchObject({ produced: n, left: n - pool, canSteal: false })
    expect(f.me.stealsLeft).toBe(60 - pool) // o mesmo limite do dia do roubo de horta (o toque no piso não conta)
    // O dono colhe o que sobrou.
    const r = await game.runAction(bia, { type: 'collect_animal', slot: 'chicken' })
    expect(r.fx?.qty).toBe(n - pool)
    const ev = (await sql("select payload from events where user_id = $1 and kind = 'stolen'", [bia])).rows as { payload: Record<string, unknown> }[]
    expect(ev).toHaveLength(1)
    expect(ev[0].payload).toMatchObject({ item: 'ovo', qty: pool, slot: 'chicken' })
  })

  it('alimentar: comida certa enche a barra; a errada tem fala de recusa; cheio diz "Já estou alimentado!"', async () => {
    await sql('update users set gold = 1000 where id = $1', [ana])
    await game.runAction(ana, { type: 'buy', itemId: 'feno' })
    await game.runAction(ana, { type: 'buy', itemId: 'racao_aves' })
    await expect(game.runAction(ana, { type: 'feed_animal', slot: 'cow', itemId: 'feno' })).rejects.toThrow('Já estou alimentado!')
    await sql("update animals set fed_until = now() + interval '1 minute' where owner_id = $1", [ana])
    await expect(game.runAction(ana, { type: 'feed_animal', slot: 'cow', itemId: 'racao_aves' })).rejects.toThrow('Essa comida não é adequada para Vaca!')
    await expect(game.runAction(ana, { type: 'feed_animal', slot: 'cow', itemId: 'racao' })).rejects.toThrow(/não é adequada/)
    const r = await game.runAction(ana, { type: 'feed_animal', slot: 'cow', itemId: 'feno' })
    expect(r.fx).toMatchObject({ xp: 2, item: 'feno', qty: -1 })
    const food = (await game.loadFarm(ana)).livestock.find((a) => a.slot === 'cow')!.food
    expect(food).toBeGreaterThanOrEqual(34) // "Alimento para gado": 8 h da barra de 24 h
    expect(food).toBeLessThanOrEqual(35)
  })

  it('com fome não produz e não morre', async () => {
    const a = await animal(ana, 'sheep')
    // Acertado há 1 minuto, com a ração acabada há 3 dias: nesse tempo todo o relógio do bicho não andou.
    await sql("update animals set fed_until = now() - interval '3 days', settled_at = now() - interval '1 minute' where id = $1", [a.id])
    const v = (await game.loadFarm(ana)).livestock.find((x) => x.slot === 'sheep')!
    expect(v).toMatchObject({ food: 0, hungry: true, ready: false, stage: v.stages })
    expect(v.cycleLeftMs).toBe(origAnimalMs(LIVESTOCK.sheep.cycleH))
    expect(await animal(ana, 'sheep')).toBeTruthy() // continua na fazenda
  })

  it('burro maduro: ninguém pega (piso 160 de 160); o dono colhe tudo e o burro sai da fazenda', async () => {
    await sql(`update users set herd = '{"cow":1,"sheep":1,"pig":1,"chicken":2,"donkey":1}' where id = $1`, [bia])
    await sql(`insert into animals (owner_id, slot, kind, fed_until, fed_ms, settled_at) values ($1, 'donkey', 'donkey', now() + interval '1 day', $2, now())`,
      [bia, origAnimalMs(240)])
    expect((await game.loadFarm(ana, 'bia')).livestock.find((a) => a.slot === 'donkey')).toMatchObject({ ready: true, produced: 160, left: 160, canSteal: false })
    await expect(game.runAction(ana, { type: 'steal_animal', owner: 'bia', slot: 'donkey' })).rejects.toMatchObject({ code: 'empty' })
    const r = await game.runAction(bia, { type: 'collect_animal', slot: 'donkey' })
    expect(r.fx).toMatchObject({ item: 'carne', qty: 160 })
    expect(r.gone).toBe('donkey')
    expect(r.message).toMatch(/saiu da fazenda/)
    expect((await game.loadFarm(bia)).livestock.map((a) => a.slot)).not.toContain('donkey')
    expect(await animal(bia, 'donkey')).toBeUndefined()
    expect((await user('bia')).herd).toMatchObject({ donkey: 0 }) // saiu do rebanho: não volta no próximo carregamento
    expect((await game.loadFarm(bia)).herd).not.toContain('donkey')
    // Carne vende no depósito.
    expect((await game.runAction(bia, { type: 'sell', itemId: 'carne' })).fx?.gold).toBe(Math.floor(160 * 129.9))
  })

  it('burro crescendo: nada para pegar', async () => {
    await sql(`update users set herd = '{"cow":1,"donkey":1}' where id = $1`, [bia])
    await sql(`insert into animals (owner_id, slot, kind, fed_until, settled_at) values ($1, 'donkey', 'donkey', now() + interval '1 day', now())`, [bia])
    await expect(game.runAction(ana, { type: 'steal_animal', owner: 'bia', slot: 'donkey' })).rejects.toThrow('Burro: não há nada para pegar aqui.')
  })

  it('comprar bicho novo: só com arte e sem repetir; entra no rebanho e chega filhote', async () => {
    await expect(game.runAction(ana, { type: 'buy', itemId: 'bicho:unicornio' })).rejects.toThrow(/desconhecido/)
    await sql('update users set level = 3, xp = 150, gold = 10000 where id = $1', [ana])
    await game.runAction(ana, { type: 'buy', itemId: 'bicho:duck' })
    const f = await game.loadFarm(ana)
    expect(f.herd).toContain('duck')
    expect(f.livestock.find((a) => a.slot === 'duck')).toMatchObject({ stage: 1, look: 'baby', food: 100 })
    await expect(game.runAction(ana, { type: 'buy', itemId: 'bicho:duck' })).rejects.toThrow(/já tem/)
  })
})

describe('cachorro: patrulha decide a mordida e ossos sobem o nível', () => {
  const x0 = plotPos(0).x
  async function guard() {
    await sql("update users set dog = 'pastor', dog_fed_until = now() + interval '1 day' where id = $1", [bia])
    await sql(`update plots set seed_id = 'nabo', planted_at = now() - interval '2 hours', ready_at = now() - interval '1 minute',
      yield_total = 10, yield_left = 10, sow_seq = 1 where owner_id = $1 and idx = 0`, [bia])
  }

  it('o servidor decide pela patrulha: com o mesmo sorteio, de costas passa e de frente morde', async () => {
    await guard()
    const p = biteChance(DOG_BREEDS.pastor.bite, 10, 'tap')
    vi.mocked(Math.random).mockReturnValue(p * 0.5) // abaixo da chance normal, acima da de costas (×0,15)
    clock = vi.spyOn(Date, 'now')
    const away = nextFacing(bia, HOME, x0, true, Date.now())!
    clock.mockReturnValue(away)
    const r1 = await game.runAction(ana, { type: 'steal', owner: 'bia', idx: 0 })
    expect(r1.bad).toBeFalsy()
    expect(r1.away).toBe(true)
    clock.mockReturnValue(nextFacing(bia, HOME, x0, false, away + 300)!)
    const r2 = await game.runAction(ana, { type: 'steal', owner: 'bia', idx: 0 })
    expect(r2.bad).toBe(true)
    expect(r2.away).toBe(false)
  })

  it('a ficha mostra a patrulha (semente e casa), o nível e quantos ossos faltam', async () => {
    await guard()
    const f = await game.loadFarm(ana, 'bia')
    expect(f.owner.dog).toMatchObject({ level: 0, bones: 0, next: { level: 1, missing: 10 }, patrol: { seed: bia, home: HOME } })
  })

  it('ossos de graça: bônus diário, missão e ajudar amigos; dar ossos sobe o nível', async () => {
    await sql("update users set dog = 'vira_lata', dog_fed_until = now() + interval '1 day' where id = $1", [ana])
    await game.loadFarm(ana) // bônus do dia: 1 osso
    let inv = (await game.loadFarm(ana)).inventory
    expect(inv).toContainEqual({ itemId: 'osso', qty: 1 })
    // 10 ajudas na horta da bia: 2 ossos (1 a cada 5).
    await game.runAction(bia, { type: 'plant', idx: 0, seedId: 'nabo' })
    for (let i = 0; i < 10; i++) {
      await sql('update plots set pests = 1 where owner_id = $1 and idx = 0', [bia])
      await game.runAction(ana, { type: 'care', owner: 'bia', idx: 0, tool: 'pesticide' })
    }
    inv = (await game.loadFarm(ana)).inventory
    expect(inv).toContainEqual({ itemId: 'osso', qty: 3 })
    await sql("update inventory set qty = 12 where user_id = $1 and item_id = 'osso'", [ana])
    const r = await game.runAction(ana, { type: 'give_bone' })
    expect(r.message).toMatch(/nível 1/)
    expect(r.message).toMatch(/Faltam 18 ossos para o nível 2/)
    const f = await game.loadFarm(ana)
    expect(f.me.dog).toMatchObject({ level: 1, bones: 12 })
    expect(f.me.dog!.bite).toBeCloseTo(1 - 0.75 * 0.94, 10)
    await expect(game.runAction(ana, { type: 'give_bone' })).rejects.toThrow(/Sem ossos/)
    // Sem moeda paga: osso não está à venda.
    expect(SHOP_BY_ID.osso).toBeUndefined()
  })

  it('o bicho do amigo também é guardado pelo cachorro', async () => {
    await guard()
    await readyBatch(bia, 'cow')
    vi.mocked(Math.random).mockReturnValue(0) // a mordida mais provável
    const r = await game.runAction(ana, { type: 'steal_animal', owner: 'bia', slot: 'cow' })
    expect(r.bad).toBe(true)
    expect(r.bite).toMatchObject({ slot: 'cow', breed: 'pastor' })
    await expect(game.runAction(ana, { type: 'steal_animal', owner: 'bia', slot: 'cow' })).rejects.toThrow(/Calma|olho/)
  })
})

describe('balões do roubo no piso do dono', () => {
  it('quem já pegou dali ouve "ganancioso"; quem chegou depois, "nada sobrando"', async () => {
    const caio = await game.loginOrCreate('caio')
    await sql("update users set created_at = now() - interval '1 hour' where id = $1", [caio])
    await sql(`update plots set seed_id = 'nabo', planted_at = now() - interval '2 hours', ready_at = now() - interval '1 minute',
      yield_total = 10, yield_left = 10, sow_seq = 1 where owner_id = $1 and idx = 0`, [bia])
    let t = Date.now()
    clock = vi.spyOn(Date, 'now')
    for (let i = 0; i < 4; i++) { t += 300; clock.mockReturnValue(t); await game.runAction(ana, { type: 'steal', owner: 'bia', idx: 0 }) }
    t += 300; clock.mockReturnValue(t)
    await expect(game.runAction(ana, { type: 'steal', owner: 'bia', idx: 0 })).rejects.toMatchObject({ code: 'greedy' })
    await expect(game.runAction(caio, { type: 'steal', owner: 'bia', idx: 0 })).rejects.toMatchObject({ code: 'empty' })
    const { PLOT_LINES } = await import('../src/game/lines')
    expect(PLOT_LINES.empty).toBe('Por favor, eu não tenho mais nada sobrando!')
  })
})

describe('lote N: árvores frutíferas e flores', () => {
  it('as 7 frutíferas e as 6 flores estão na loja; frutíferas têm várias safras; flor não vende', () => {
    for (const id of ['maca', 'laranja', 'cereja', 'pessego', 'limao', 'coco', 'banana']) {
      expect(SHOP_BY_ID[`semente:${id}`]?.tab).toBe('sementes')
      expect(SEED_BY_ID[id].seasons).toBeGreaterThan(1)
    }
    for (const id of ['rosa_vermelha', 'rosa_amarela', 'lavanda', 'hortensia_azul', 'flor_rosa', 'cerejeira_florida']) {
      expect(SHOP_BY_ID[`semente:${id}`]?.tab).toBe('flores')
      const n = id === 'rosa_amarela' ? 3 : 1 // a rosa amarela dá 3 unidades
      expect(SEED_BY_ID[id]).toMatchObject({ flower: true, sellPrice: 0, yieldMin: n, yieldMax: n })
    }
    // Rosa vermelha: 19 h de base, 1 unidade.
    expect(SEED_BY_ID.rosa_vermelha.growMinutes).toBe(19 * 60 * PACE.time)
    expect(SEED_BY_ID.maca).toMatchObject({ seasons: 3, cost: 180 })
  })

  it('flor colhida vira presente: quem recebe ganha o charme da flor em popularidade', async () => {
    await sql("insert into inventory (user_id, item_id, qty) values ($1, 'flor:rosa_vermelha', 1), ($1, 'flor:girassol', 1)", [ana])
    await game.runAction(ana, { type: 'add_friend', handle: 'bia' })
    const r = await game.runAction(ana, { type: 'give_flower', to: 'bia', seedId: 'rosa_vermelha' })
    expect(r.message).toMatch(/\+27 de popularidade/) // Rosa Vermelha: 27
    await game.runAction(ana, { type: 'give_flower', to: 'bia', seedId: 'girassol' })
    expect((await user('bia')).popularity).toBe(28)
    const ev = (await sql("select payload from events where user_id = $1 and kind = 'flower' order by id", [bia])).rows as { payload: Record<string, unknown> }[]
    expect(ev.map((e) => e.payload.charm)).toEqual([27, 1])
  })

  it('colher a flor dá a flor no depósito (não vende)', async () => {
    await sql('update users set level = 10, xp = 2250, gold = 10000 where id = $1', [ana])
    await game.runAction(ana, { type: 'buy', itemId: 'semente:lavanda' })
    await game.runAction(ana, { type: 'plant', idx: 0, seedId: 'lavanda' })
    await sql("update plots set planted_at = now() - interval '3 hours', ready_at = now() - interval '1 second' where owner_id = $1 and idx = 0", [ana])
    const r = await game.runAction(ana, { type: 'harvest', idx: 0 })
    expect(r.fx).toMatchObject({ item: 'flor:lavanda', qty: 1 })
    await expect(game.runAction(ana, { type: 'sell', itemId: 'flor:lavanda' })).rejects.toThrow(/Nada para vender/)
  })
})

describe('rebanho com cópias (frente D)', () => {
  it('cada cópia do rebanho tem sua linha; colher a 1ª de 2 porcos faz a 2ª assumir o lugar', async () => {
    await sql(`update users set herd = '{"pig":2,"cow":1}' where id = $1`, [ana])
    let f = await game.loadFarm(ana)
    expect(f.livestock.map((a) => a.slot).sort()).toEqual(['cow', 'pig', 'pig2'])
    await sql("update animals set fed_ms = $2 where owner_id = $1 and slot = 'pig'", [ana, origAnimalMs(192)])
    await sql("update animals set fed_ms = 123 where owner_id = $1 and slot = 'pig2'", [ana])
    await game.runAction(ana, { type: 'collect_animal', slot: 'pig' })
    f = await game.loadFarm(ana)
    expect(f.herd).toEqual(expect.arrayContaining(['cow', 'pig']))
    expect(f.herd).not.toContain('pig2')
    expect(Number((await animal(ana, 'pig')).fed_ms)).toBe(123) // era o pig2
  })
})

describe('lote O: idade do desenho e acessórios', () => {
  it('filhote → jovem → adulto acompanha os estágios do bicho', async () => {
    const { lookOf, ACCESSORIES, accSprite } = await import('../src/game/livestock')
    expect([1, 2, 3].map((st) => lookOf(st, 3))).toEqual(['baby', 'teen', 'adult']) // galinha
    expect([1, 2, 3, 4, 5].map((st) => lookOf(st, 5))).toEqual(['baby', 'baby', 'teen', 'teen', 'adult']) // burro, porco
    // Toda espécie com estágios tem desenho de filhote e jovem; todo acessório tem a camada desenhada.
    for (const k of ['cow', 'sheep', 'pig', 'chicken', 'donkey', 'peacock', 'duck', 'rabbit', 'goat']) {
      for (const age of ['baby', 'teen']) expect(existsSync(path.join(process.cwd(), `public/art/animals/${k}_${age}_walk_0.png`))).toBe(true)
    }
    for (const acc of ACCESSORIES) expect(existsSync(path.join(process.cwd(), `public/art/animals/${accSprite(acc)}_walk_0.png`))).toBe(true)
    const pig = (await game.loadFarm(ana)).livestock.find((x) => x.slot === 'pig')!
    expect(pig.look).toBe('baby')
  })

  it('acessório: compra com ouro, veste só no adulto da espécie certa, tira e volta ao depósito', async () => {
    await sql('update users set gold = 10000 where id = $1', [ana])
    await game.runAction(ana, { type: 'buy', itemId: 'acc:cow_sino' })
    await game.runAction(ana, { type: 'buy', itemId: 'acc:chicken_chapeu' })
    await expect(game.runAction(ana, { type: 'wear', animal: 'sheep', acc: 'cow_sino', on: true })).rejects.toThrow(/não serve/)
    await game.runAction(ana, { type: 'wear', animal: 'cow', acc: 'cow_sino', on: true })
    let f = await game.loadFarm(ana)
    expect(f.wear).toEqual({ cow: ['cow_sino'] })
    expect(f.inventory.find((i) => i.itemId === 'acc:cow_sino')).toBeUndefined()
    // O visitante vê o enfeite.
    expect((await game.loadFarm(bia, 'ana')).wear).toEqual({ cow: ['cow_sino'] })
    await game.runAction(ana, { type: 'wear', animal: 'cow', acc: 'cow_sino', on: false })
    f = await game.loadFarm(ana)
    expect(f.wear).toEqual({})
    expect(f.inventory).toContainEqual({ itemId: 'acc:cow_sino', qty: 1 })
    // Filhote não veste (a arte é do adulto).
    await sql("update animals set fed_ms = 0, cycle_from = 0 where owner_id = $1 and slot = 'chicken'", [ana])
    await expect(game.runAction(ana, { type: 'wear', animal: 'chicken', acc: 'chicken_chapeu', on: true })).rejects.toThrow(/filhote/)
  })

  it('um enfeite por lugar do corpo: vestir outro no mesmo lugar troca e devolve o de antes', async () => {
    await sql('update users set gold = 10000 where id = $1', [ana])
    await sql("delete from wear where owner_id = $1", [ana])
    await game.runAction(ana, { type: 'buy', itemId: 'acc:cow_sino' })
    await game.runAction(ana, { type: 'buy', itemId: 'acc:cow_laco' })
    await game.runAction(ana, { type: 'wear', animal: 'cow', acc: 'cow_sino', on: true })
    await game.runAction(ana, { type: 'wear', animal: 'cow', acc: 'cow_laco', on: true }) // cabeça × pescoço: os dois ficam
    expect((await game.loadFarm(ana)).wear.cow?.sort()).toEqual(['cow_laco', 'cow_sino'])
    await game.runAction(ana, { type: 'buy', itemId: 'acc:cow_sino' })
    await game.runAction(ana, { type: 'wear', animal: 'cow', acc: 'cow_sino', on: false })
    // Burro: chapéu e coroa de flores são da cabeça; o segundo tira o primeiro.
    expect(ACCESSORY_BY_ID.donkey_chapeu.spot).toBe(ACCESSORY_BY_ID.donkey_flores.spot)
    expect(ACCESSORY_BY_ID.dog_lenco.spot).toBe(ACCESSORY_BY_ID.dog_coleira_spike.spot)
    await sql("update users set dog = 'vira_lata', dog_fed_until = now() + interval '1 day' where id = $1", [ana])
    await game.runAction(ana, { type: 'buy', itemId: 'acc:dog_lenco' })
    await game.runAction(ana, { type: 'buy', itemId: 'acc:dog_coleira_spike' })
    await game.runAction(ana, { type: 'wear', animal: 'dog', acc: 'dog_lenco', on: true })
    const r = await game.runAction(ana, { type: 'wear', animal: 'dog', acc: 'dog_coleira_spike', on: true })
    expect(r.message).toMatch(/voltou ao depósito/)
    const f = await game.loadFarm(ana)
    expect(f.wear.dog).toEqual(['dog_coleira_spike'])
    expect(f.inventory).toContainEqual({ itemId: 'acc:dog_lenco', qty: 1 })
  })

  it('bicho de corte colhido devolve o enfeite', async () => {
    await sql("insert into wear (owner_id, animal, acc) values ($1, 'pig', 'cow_laco')", [ana])
    await sql('update animals set fed_ms = $2 where owner_id = $1 and slot = $3', [ana, origAnimalMs(192), 'pig'])
    await game.runAction(ana, { type: 'collect_animal', slot: 'pig' })
    expect((await game.loadFarm(ana)).inventory).toContainEqual({ itemId: 'acc:cow_laco', qty: 1 })
  })
})

describe('culturas no servidor', () => {
  it('cultura sem arte não planta nem compra', async () => {
    // A arte do abacaxi, da pitaya e da bromélia chegou (Evolução 02): nenhuma cultura do catálogo está sem arte.
    // A trava continua valendo: marca a bromélia como sem arte só neste teste.
    await sql('update users set level = 20, xp = 9500, gold = 100000 where id = $1', [ana])
    await expect(game.runAction(ana, { type: 'buy', itemId: 'semente:sem_arte' })).rejects.toThrow(/desconhecido/)
    const bromelia = SEED_BY_ID.bromelia as { needsArt?: boolean }
    bromelia.needsArt = true
    try {
      await sql("insert into inventory (user_id, item_id, qty) values ($1, 'semente:bromelia', 1)", [ana])
      await expect(game.runAction(ana, { type: 'plant', idx: 0, seedId: 'bromelia' })).rejects.toThrow(/ainda não chegou/)
    } finally {
      delete bromelia.needsArt
    }
  })

  it('abacaxi, pitaya e bromélia com arte: na loja, compram e plantam', async () => {
    await sql('update users set level = 30, xp = 25 * 30 * 29, gold = 100000 where id = $1', [ana])
    await sql('delete from inventory where user_id = $1 and item_id = $2', [ana, 'semente:bromelia'])
    for (const id of ['abacaxi', 'pitaya', 'bromelia']) expect(SHOP_BY_ID[`semente:${id}`]).toBeDefined()
    await game.runAction(ana, { type: 'buy', itemId: 'semente:bromelia' })
    await sql("update plots set seed_id = null, planted_at = null, ready_at = null, withered = false where owner_id = $1 and idx = 0", [ana])
    await expect(game.runAction(ana, { type: 'plant', idx: 0, seedId: 'bromelia' })).resolves.toBeTruthy()
  })

  it('morango: 3 safras; a 2ª volta para as folhas grandes', async () => {
    await sql('update users set level = 5, xp = 500, gold = 1000 where id = $1', [ana])
    await game.runAction(ana, { type: 'buy', itemId: 'semente:morango' })
    await game.runAction(ana, { type: 'plant', idx: 0, seedId: 'morango' })
    await sql("update plots set planted_at = now() - interval '10 hours', ready_at = now() - interval '1 second' where owner_id = $1 and idx = 0", [ana])
    const r = await game.runAction(ana, { type: 'harvest', idx: 0 })
    expect(r.message).toMatch(/safra 1\/3/)
    expect((await game.loadFarm(ana)).plots[0]).toMatchObject({ state: 'growing', stage: 3, season: 2 })
  })
})

void user
