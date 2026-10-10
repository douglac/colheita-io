// Decoração (frente J): grade, colisão, limites, preço do conjunto, autoconexão do caminho e o fluxo no servidor.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DECOR, PACE } from '../src/game/config'
import { ORNAMENT_BY_ID, ORNAMENTS, PATHS, piecePrice, SERIES_BY_ID, setPrice, SLOTS, decorXp } from '../src/game/decor'
import {
  cellAt, cellCenter, decorGrid, FIXED_ORNAMENT, footCenter, limitCheck, pathShape, pathTiles, placeCheck, type Placed,
} from '../src/game/decor-grid'
import { plotCell } from '../src/scene/layout'

process.env.PGLITE_DIR = 'memory://'
const { getDb } = await import('../src/server/db')
const game = await import('../src/server/game')
const db = await getDb()
const sql = (q: string, p: unknown[] = []) => db.query(q, p)

const g = decorGrid()
const zone = g.cells.filter((c) => c.kind === 'zone')
/** Célula de zona com o bloco w × h inteiro em zona (para enfeite grande). */
const zoneBlock = (w: number, h: number, skip: Set<string> = new Set()) => zone.find((c) => {
  for (let dv = 0; dv < h; dv++) for (let du = 0; du < w; du++) {
    if (g.kind(c.u + du, c.v + dv) !== 'zone' || skip.has(`${c.u + du},${c.v + dv}`)) return false
  }
  return true
})!

/** Células de caminho (pares, bloco 2 × 2) sem nada bloqueado; `corridor` = que passem pelo corredor da roça. */
const pathFree = (corridor = false) => g.cells.filter((c) => {
  if (c.u % 2 || c.v % 2) return false
  const ks = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([du, dv]) => g.kind(c.u + du, c.v + dv))
  return ks.every((k) => k !== 'blocked' && k !== 'out') && (!corridor || ks.includes('corridor'))
})

describe('grade da decoração', () => {
  it('célula ↔ ponto do mundo: ida e volta', () => {
    for (const [u, v] of [[0, 0], [-5, 7], [12, -3], [3, 3]]) {
      const p = cellCenter(u, v)
      expect(cellAt(p.x, p.y)).toEqual({ u, v })
    }
    // Pegada 2 × 2: centro no canto comum das 4 células.
    const c = footCenter(0, 0, 2, 2), a = cellCenter(0, 0), b = cellCenter(1, 1)
    expect(c).toEqual({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  })

  it('cada lote da roça cobre 2 × 2 células bloqueadas, com corredor de 1 célula em volta', () => {
    for (const idx of [0, 5, 11, 12, 23]) {
      const { col, row } = plotCell(idx)
      for (const [du, dv] of [[0, 0], [1, 0], [0, 1], [1, 1]]) expect(g.kind(2 * col + du, 2 * row + dv)).toBe('blocked')
    }
    // Roça cheia: u 0..11, v 0..7. Toda célula logo fora dela é passagem (ou outra coisa da fazenda,
    // como o cercado): nunca faixa de enfeite nem gramado solto.
    const ring: [number, number][] = []
    for (let u = -1; u <= 12; u++) ring.push([u, -1], [u, 8])
    for (let v = 0; v <= 7; v++) ring.push([-1, v], [12, v])
    for (const [u, v] of ring) expect(['corridor', 'blocked', 'out']).toContain(g.kind(u, v))
    expect(ring.filter(([u, v]) => g.kind(u, v) === 'corridor').length).toBeGreaterThan(10)
    expect(g.kind(-1, 3)).toBe('corridor')
  })

  it('há faixas de decoração e o enfeite fixo da série tem lugar reservado', () => {
    // Evolução 12: as áreas de passeio dos bichos soltos saíram das faixas e a faixa logo na frente delas (eram 82 células; ficam 59).
    expect(zone.length).toBeGreaterThan(55)
    expect(g.kind(FIXED_ORNAMENT.u, FIXED_ORNAMENT.v)).toBe('blocked')
    expect(g.kind(FIXED_ORNAMENT.u + 1, FIXED_ORNAMENT.v + 1)).toBe('blocked')
  })
})

describe('colisão', () => {
  const a = zoneBlock(2, 2)
  it('enfeite: só nas faixas; nunca na roça, no corredor ou fora da fazenda', () => {
    expect(placeCheck('canteiro_flores', a.u, a.v, [])).toEqual({ ok: true })
    expect(placeCheck('canteiro_flores', 2, 2, [])).toMatchObject({ ok: false, reason: expect.stringMatching(/fazenda/) })
    expect(placeCheck('canteiro_flores', -1, 3, [])).toMatchObject({ ok: false, reason: expect.stringMatching(/passagem/) })
    expect(placeCheck('canteiro_flores', 999, 999, [])).toMatchObject({ ok: false, reason: expect.stringMatching(/Fora/) })
    expect(placeCheck('nao_existe', a.u, a.v, [])).toMatchObject({ ok: false })
  })

  it('caminho anda de lote em lote: pode passar no corredor, mas não na roça nem fora da grade par', () => {
    const c = pathFree(true)[0]
    expect(c).toBeTruthy()
    expect(placeCheck('caminho_terra', c.u, c.v, [])).toEqual({ ok: true })
    expect(placeCheck('caminho_terra', 0, 0, [])).toMatchObject({ ok: false })
    expect(placeCheck('caminho_terra', c.u + 1, c.v, [])).toMatchObject({ ok: false, reason: 'Lugar inválido' })
  })

  it('enfeite não encosta em enfeite (pegada inteira), nem em caminho, nem em bicho', () => {
    const placed: Placed[] = [{ id: 1, itemId: 'lago_patinhos', u: a.u, v: a.v }]
    // O lago é 2 × 2: qualquer célula dele bloqueia, inclusive para outro 2 × 2 deslocado de 1.
    expect(placeCheck('barris', a.u + 1, a.v + 1, placed)).toMatchObject({ ok: false, reason: expect.stringMatching(/enfeite/) })
    // Mover o próprio poço 0 células é válido (ele não colide consigo).
    expect(placeCheck('lago_patinhos', a.u, a.v, placed, {}, 1)).toEqual({ ok: true })
    // Caminho cobre 2 × 2 células: enfeite em qualquer uma delas esbarra no caminho.
    const pc = pathFree().find((c) => g.kind(c.u + 1, c.v + 1) === 'zone')!
    const path: Placed[] = [{ id: 2, itemId: 'caminho_pedra', u: pc.u, v: pc.v }]
    expect(placeCheck('barris', pc.u + 1, pc.v + 1, path)).toMatchObject({ ok: false, reason: expect.stringMatching(/caminho/) })
    const orn: Placed[] = [{ id: 3, itemId: 'barris', u: pc.u + 1, v: pc.v + 1 }]
    expect(placeCheck('caminho_terra', pc.u, pc.v, orn)).toMatchObject({ ok: false })
    const p = cellCenter(a.u, a.v)
    expect(placeCheck('canteiro_flores', a.u, a.v, [], { cow: { x: Math.round(p.x), y: Math.round(p.y) } }))
      .toMatchObject({ ok: false, reason: expect.stringMatching(/bicho/) })
  })
})

describe('limites', () => {
  const many = (n: number, itemId = 'canteiro_flores'): Placed[] => Array.from({ length: n }, (_, i) => ({ id: i + 1, itemId, u: 100 + i, v: 0 }))
  it('enfeites: 4 + nível/2, até 40', () => {
    expect(DECOR.maxOrnaments(1)).toBe(4)
    expect(DECOR.maxOrnaments(10)).toBe(9)
    expect(DECOR.maxOrnaments(200)).toBe(40)
    expect(limitCheck('barris', many(3), 1)).toEqual({ ok: true })
    expect(limitCheck('barris', many(4), 1)).toMatchObject({ ok: false, reason: expect.stringMatching(/nível 1 cabem 4/) })
    expect(limitCheck('barris', many(39), 99)).toEqual({ ok: true })
    expect(limitCheck('barris', many(40), 99)).toMatchObject({ ok: false })
  })
  it('caminho não conta como enfeite (tem limite próprio)', () => {
    expect(limitCheck('barris', many(30, 'caminho_terra'), 1)).toEqual({ ok: true })
    expect(limitCheck('caminho_terra', many(DECOR.maxPathCells, 'caminho_terra'), 1)).toMatchObject({ ok: false })
  })
})

describe('preços', () => {
  it('peças: o preço-base × PACE.gold, igual em todas as séries; o Sítio é de graça', () => {
    for (const s of [SERIES_BY_ID.arco_iris, SERIES_BY_ID.inverno]) {
      for (const k of SLOTS) expect(piecePrice(s, k)).toBe(Math.round((DECOR.pieceGoldOriginal[k] * PACE.gold) / 10) * 10)
    }
    expect(piecePrice(SERIES_BY_ID.inverno, 'fundo')).toBeGreaterThan(piecePrice(SERIES_BY_ID.inverno, 'casa'))
    expect(piecePrice(SERIES_BY_ID.sitio, 'casa')).toBe(0)
    // Conjunto-base: 65.462 de ouro → aqui ~6.550 (65.462 × PACE.gold).
    expect(setPrice(SERIES_BY_ID.arco_iris).gold).toBeCloseTo(65462 * PACE.gold, -2)
  })
  it('conjunto: soma das peças que faltam (desconto configurável, hoje 0)', () => {
    expect(DECOR.setDiscount).toBe(0)
    const s = SERIES_BY_ID.arco_iris
    const all = setPrice(s)
    const sum = SLOTS.reduce((t, k) => t + piecePrice(s, k), 0)
    expect(all.full).toBe(sum)
    expect(all.gold).toBe(Math.round((sum * (1 - DECOR.setDiscount)) / 10) * 10)
    const rest = setPrice(s, (k) => k === 'fundo')
    expect(rest.missing).toEqual(['casa', 'casinha', 'enfeite', 'cerca'])
    expect(rest.full).toBe(sum - piecePrice(s, 'fundo'))
    // Faltando 1 peça só, é o preço da peça (sem desconto de conjunto).
    expect(setPrice(s, (k) => k !== 'cerca').gold).toBe(piecePrice(s, 'cerca'))
  })
  it('enfeites e caminhos com preço e nível mínimo', () => {
    expect(ORNAMENTS).toHaveLength(16)
    for (const o of ORNAMENTS) expect(o.gold).toBeGreaterThan(0)
    expect(ORNAMENT_BY_ID.moinho_pequeno.gold).toBeGreaterThan(ORNAMENT_BY_ID.canteiro_flores.gold)
    expect(PATHS.map((p) => p.id)).toEqual(['caminho_terra', 'caminho_pedra'])
  })
})

describe('caminho: autoconexão', () => {
  it('forma pela máscara de vizinhos', () => {
    expect(pathShape(0)).toBe('dot')
    expect(pathShape(1)).toBe('end')
    expect(pathShape(1 | 4)).toBe('straight')
    expect(pathShape(2 | 8)).toBe('straight')
    expect(pathShape(1 | 2)).toBe('curve')
    expect(pathShape(4 | 8)).toBe('curve')
    expect(pathShape(1 | 2 | 4)).toBe('tee')
    expect(pathShape(15)).toBe('cross')
  })
  it('reta, curva, T e cruz numa fazenda pintada; materiais diferentes não se ligam', () => {
    let id = 0
    const p = (u: number, v: number, itemId = 'caminho_pedra'): Placed => ({ id: ++id, itemId, u, v })
    // Coordenadas em lotes (o caminho anda de 2 em 2 células finas).
    // Cruz em (5,5): braços em u e em v; a ponta (7,5) continua a reta; (5,3)+(6,3) formam curva com (5,4).
    const q = (u: number, v: number, itemId?: string) => p(u * 2, v * 2, itemId)
    const placed = [q(5, 5), q(4, 5), q(6, 5), q(5, 4), q(5, 6), q(7, 5), q(5, 3), q(6, 3), q(8, 5, 'caminho_terra')]
    const at = (u: number, v: number) => pathTiles(placed).find((t) => t.u === u * 2 && t.v === v * 2)!
    expect(at(5, 5).shape).toBe('cross')
    expect(at(6, 5).shape).toBe('straight')
    expect(at(7, 5).shape).toBe('end') // o vizinho (8,5) é de terra: não liga
    expect(at(8, 5).shape).toBe('dot')
    expect(at(5, 4).shape).toBe('straight')
    expect(at(5, 3).shape).toBe('curve') // liga embaixo (5,4) e à direita (6,3)
    expect(at(6, 3).shape).toBe('end')
    expect(at(4, 5).shape).toBe('end')
  })
})

describe('servidor: decoração', () => {
  let me: string
  beforeAll(() => { vi.spyOn(Math, 'random').mockReturnValue(0.99) })
  beforeEach(async () => {
    await game.resetDbForTests()
    me = await game.loginOrCreate('ana')
  })
  const setUser = (fields: string, args: unknown[]) => sql(`update users set ${fields} where id = $1`, [me, ...args])

  it('todo mundo começa com a série Sítio equipada e sem enfeites', async () => {
    const f = await game.loadFarm(me)
    expect(f.decor.slots).toEqual({ fundo: 'sitio', casa: 'sitio', casinha: 'sitio', enfeite: 'sitio', cerca: 'sitio' })
    expect(f.decor.placed).toEqual([])
    expect(f.myDecor).toMatchObject({ ornaments: 0, maxOrnaments: 4, pathCells: 0 })
  })

  it('comprar peça: nível, ouro, XP e já equipa; trocar de volta para o Sítio e de novo para a peça', async () => {
    await expect(game.runAction(me, { type: 'decor_buy', itemId: 'casa:inverno' })).rejects.toThrow(/nível 9/)
    await setUser('level = 9, xp = 1800, gold = 100000', [])
    const price = piecePrice(SERIES_BY_ID.inverno, 'casa')
    const r = await game.runAction(me, { type: 'decor_buy', itemId: 'casa:inverno' })
    expect(r.fx).toMatchObject({ gold: -price, xp: decorXp(price) })
    let f = await game.loadFarm(me)
    expect(f.decor.slots.casa).toBe('inverno')
    expect(f.me.gold).toBe(100000 - price + 20) // + bônus do dia
    await expect(game.runAction(me, { type: 'decor_buy', itemId: 'casa:inverno' })).rejects.toThrow(/já tem/)
    await game.runAction(me, { type: 'decor_equip', slot: 'casa', series: 'sitio' })
    expect((await game.loadFarm(me)).decor.slots.casa).toBe('sitio')
    await game.runAction(me, { type: 'decor_equip', slot: 'casa', series: 'inverno' })
    f = await game.loadFarm(me)
    expect(f.decor.slots.casa).toBe('inverno')
    await expect(game.runAction(me, { type: 'decor_equip', slot: 'fundo', series: 'inverno' })).rejects.toThrow(/não tem/)
  })

  it('comprar conjunto: cobra só o que falta e equipa as 5 peças', async () => {
    await setUser('level = 9, xp = 1800, gold = 100000', [])
    await game.runAction(me, { type: 'decor_buy', itemId: 'fundo:inverno' })
    const gold = async () => ((await sql('select gold from users where id = $1', [me])).rows[0] as { gold: number }).gold
    const before = await gold()
    const s = SERIES_BY_ID.inverno
    const expected = setPrice(s, (k) => k === 'fundo')
    const r = await game.runAction(me, { type: 'decor_buy_set', series: 'inverno' })
    expect(r.fx?.gold).toBe(-expected.gold)
    expect(expected.gold).toBe(SLOTS.filter((k) => k !== 'fundo').reduce((t, k) => t + piecePrice(s, k), 0))
    expect(before - (await gold())).toBe(expected.gold)
    const f = await game.loadFarm(me)
    expect(Object.values(f.decor.slots)).toEqual(['inverno', 'inverno', 'inverno', 'inverno', 'inverno'])
    await expect(game.runAction(me, { type: 'decor_buy_set', series: 'inverno' })).rejects.toThrow(/inteira/)
    await expect(game.runAction(me, { type: 'decor_buy_set', series: 'sitio' })).rejects.toThrow(/desconhecida/)
  })

  it('enfeite: comprar, pôr, mover, guardar; limite por nível; o visitante vê a decoração do dono', async () => {
    await setUser('gold = 100000', [])
    const a = zoneBlock(1, 1)
    await expect(game.runAction(me, { type: 'decor_place', itemId: 'barris', u: a.u, v: a.v })).rejects.toThrow(/não tem/)
    await game.runAction(me, { type: 'decor_buy', itemId: 'barris', qty: 6 })
    const r = await game.runAction(me, { type: 'decor_place', itemId: 'barris', u: a.u, v: a.v })
    const id = r.placed![0].id
    await expect(game.runAction(me, { type: 'decor_place', itemId: 'barris', u: a.u, v: a.v })).rejects.toThrow(/Já tem/)
    await expect(game.runAction(me, { type: 'decor_place', itemId: 'barris', u: 2, v: 2 })).rejects.toThrow()
    // Mais 3 cabem (nível 1 = 4); o 5º não.
    const used = new Set([`${a.u},${a.v}`])
    for (let i = 0; i < 3; i++) {
      const c = zoneBlock(1, 1, used)
      used.add(`${c.u},${c.v}`)
      await game.runAction(me, { type: 'decor_place', itemId: 'barris', u: c.u, v: c.v })
    }
    const c5 = zoneBlock(1, 1, used)
    await expect(game.runAction(me, { type: 'decor_place', itemId: 'barris', u: c5.u, v: c5.v })).rejects.toThrow(/cabem 4/)
    await game.runAction(me, { type: 'decor_move', id, u: c5.u, v: c5.v })
    await game.runAction(me, { type: 'decor_store', id })
    let f = await game.loadFarm(me)
    expect(f.decor.placed).toHaveLength(3)
    expect(f.myDecor).toMatchObject({ owned: { barris: 6 }, used: { barris: 3 }, ornaments: 3 })
    // Bia visita e vê os 3 arbustos da Ana; não consegue mexer neles.
    const bia = await game.loginOrCreate('bia')
    f = await game.loadFarm(bia, 'ana')
    expect(f.decor.placed.map((p) => p.itemId)).toEqual(['barris', 'barris', 'barris'])
    expect(f.myDecor.ornaments).toBe(0)
    await expect(game.runAction(bia, { type: 'decor_store', id: f.decor.placed[0].id })).rejects.toThrow(/não encontrado/)
  })

  it('bicho não é solto em cima de enfeite (e enfeite não cobre bicho)', async () => {
    await setUser('gold = 100000', [])
    await game.runAction(me, { type: 'decor_buy', itemId: 'barris' })
    // Um lugar de zona onde o porco pode ficar (pastureBlocked deixa).
    const { dropCheck } = await import('../src/game/pasture')
    const spot = zone.map((c) => ({ c, p: cellCenter(c.u, c.v) })).find(({ p }) => dropCheck('pig', Math.round(p.x), Math.round(p.y)).ok)!
    const x = Math.round(spot.p.x), y = Math.round(spot.p.y)
    await game.runAction(me, { type: 'move_animal', animal: 'pig', x, y })
    await expect(game.runAction(me, { type: 'decor_place', itemId: 'barris', u: spot.c.u, v: spot.c.v })).rejects.toThrow(/bicho/)
    await sql('delete from animal_spots')
    await game.runAction(me, { type: 'decor_place', itemId: 'barris', u: spot.c.u, v: spot.c.v })
    await expect(game.runAction(me, { type: 'move_animal', animal: 'pig', x, y })).rejects.toThrow(/enfeite/)
  })

  it('caminho: pacote de células, pintar (pula o que não pode), apagar devolve ao estoque', async () => {
    await setUser('gold = 100000', [])
    const [a, b, c] = pathFree().slice(0, 3).map((x) => [x.u, x.v] as [number, number])
    await expect(game.runAction(me, { type: 'decor_paint', itemId: 'caminho_terra', cells: [a] })).rejects.toThrow(/Acabou/)
    await game.runAction(me, { type: 'decor_buy', itemId: 'caminho_terra' })
    const r = await game.runAction(me, { type: 'decor_paint', itemId: 'caminho_terra', cells: [a, b, [0, 0], c] })
    expect(r.placed!.map((p) => [p.u, p.v])).toEqual([a, b, c]) // (0,0) é roça
    let f = await game.loadFarm(me)
    expect(f.myDecor).toMatchObject({ owned: { caminho_terra: DECOR.pathPack }, pathCells: 3, ornaments: 0 })
    await game.runAction(me, { type: 'decor_erase', cells: [b] })
    f = await game.loadFarm(me)
    expect(f.decor.placed.map((p) => [p.u, p.v])).toEqual([a, c])
    await expect(game.runAction(me, { type: 'decor_erase', cells: [b] })).rejects.toThrow(/Não há caminho/)
  })
})

describe('caminho: peça do lote M e giro', async () => {
  const { pathPiece } = await import('../src/scene/decor-layer')
  const BOCAS: Record<string, number> = { reta: 5, curva: 3, t: 7, cruz: 15 }
  const rotl = (m: number) => ((m << 1) | (m >> 3)) & 15
  it('toda máscara com 2+ vizinhos sai de reta, curva, T ou cruz girada em 90°', () => {
    for (let mask = 0; mask < 16; mask++) {
      const { piece, turns } = pathPiece(mask)
      let m = BOCAS[piece]
      for (let i = 0; i < turns; i++) m = rotl(m)
      const n = [1, 2, 4, 8].filter((b) => mask & b).length
      if (n >= 2) expect(m).toBe(mask)
      else expect(m & mask).toBe(mask) // ponta e solta: reta na direção do vizinho
    }
    expect(pathPiece(5)).toEqual({ piece: 'reta', turns: 0 })
    expect(pathPiece(10)).toEqual({ piece: 'reta', turns: 1 })
    expect(pathPiece(12).piece).toBe('curva')
    expect(pathPiece(15)).toEqual({ piece: 'cruz', turns: 0 })
  })
})
