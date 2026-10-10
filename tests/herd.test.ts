// Rebanho com cópias (fazenda no máximo): ids, quem é do dono, separação entre bichos e o cercado.
import { Container } from 'pixi.js'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_HERD, defaultArea, herdIds, isAnimalId, kindOf, pastureBlocked } from '../src/game/pasture'
import { inPen, PEN, PEN_PIECES } from '../src/scene/layout'
import { Wanderer, type Flock } from '../src/scene/wander'

process.env.PGLITE_DIR = 'memory://'
const { getDb } = await import('../src/server/db')
const game = await import('../src/server/game')
const db = await getDb()

describe('ids do rebanho', () => {
  it('rebanho de sempre: vaca, ovelha, porco e duas galinhas', () => {
    expect(herdIds(null)).toEqual(['cow', 'sheep', 'pig', 'chicken', 'chicken2'])
    expect(herdIds(DEFAULT_HERD)).toEqual(herdIds(undefined))
  })
  it('cópias numeradas a partir de 2, limitadas a 9; espécie desconhecida não entra', () => {
    expect(herdIds({ duck: 3, goat: 1 })).toEqual(['duck', 'duck2', 'duck3', 'goat'])
    expect(herdIds({ cow: 50 })).toHaveLength(9)
    expect(herdIds({ horse: 2 } as never)).toEqual([])
  })
  it('isAnimalId e kindOf', () => {
    for (const ok of ['dog', 'cow', 'chicken2', 'donkey9', 'rabbit3']) expect(isAnimalId(ok), ok).toBe(true)
    for (const bad of ['cow1', 'cow10', 'horse', 'dog2', '', 'chicken22', 7]) expect(isAnimalId(bad), String(bad)).toBe(false)
    expect(kindOf('chicken2')).toBe('chicken')
    expect(kindOf('peacock4')).toBe('peacock')
    expect(kindOf('dog')).toBe('dog')
  })
})

describe('cercado', () => {
  it('vaca, ovelha, cabra e burro passeiam no cercado; o miolo é livre e a cerca bloqueia', () => {
    for (const id of ['cow', 'sheep2', 'goat', 'donkey'] as const) expect((defaultArea(id) as { poly?: unknown }).poly).toBe(PEN)
    const c = { x: PEN.reduce((s, p) => s + p[0], 0) / 4, y: PEN.reduce((s, p) => s + p[1], 0) / 4 }
    expect(inPen(c.x, c.y)).toBe(true)
    expect(pastureBlocked(c.x, c.y)).toBe(false)
    for (const { a, b } of PEN_PIECES) expect(pastureBlocked((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)).toBe(true)
  })
})

describe('separação: um bicho não fica em cima do outro', () => {
  it('11 bichos grandes no cercado, 2.000 passos: ninguém sai, ninguém encosta', () => {
    const flock: Flock = []
    const foot = 30
    for (let i = 0; i < 11; i++) {
      const node = new Container(), body = new Container()
      node.addChild(body)
      flock.push(new Wanderer(node, body, defaultArea('cow'), 40, true, undefined, pastureBlocked, flock, foot))
    }
    let worst = Infinity
    for (let step = 0; step < 2000; step++) {
      for (const w of flock) w.update(0.05)
      for (const w of flock) expect(inPen(w.node.x, w.node.y)).toBe(true)
      if (step < 200) continue // nascer encostado pode acontecer (pasto cheio); em 10 s eles já se afastaram
      for (let i = 0; i < flock.length; i++) for (let j = i + 1; j < flock.length; j++) {
        const a = flock[i].node, b = flock[j].node
        worst = Math.min(worst, Math.hypot(a.x - b.x, (a.y - b.y) * 2))
      }
    }
    // Distância desejada: 2 × foot × 1,15. Com o pasto cheio, o último recurso pode deixar dois um pouco
    // mais perto que isso, mas o passo que aproxima é barrado: nunca chegam a se cobrir.
    expect(worst).toBeGreaterThan(foot * 2 * 0.8)
  }, 30_000)
})

describe('servidor', () => {
  let me: string
  beforeEach(async () => {
    await game.resetDbForTests()
    me = await game.loginOrCreate('ana')
  })
  it('a fazenda manda o rebanho do dono; só bicho do rebanho muda de lugar', async () => {
    expect((await game.loadFarm(me)).herd).toEqual(herdIds(null))
    const move = (animal: string) => game.runAction(me, { type: 'move_animal', animal, x: -250, y: 150 })
    await expect(move('duck')).rejects.toThrow(/desconhecido/)
    await db.query('update users set herd = $2 where id = $1', [me, JSON.stringify({ duck: 2, cow: 1 })])
    expect((await game.loadFarm(me)).herd).toEqual(['cow', 'duck', 'duck2'])
    await move('duck2')
    expect((await game.loadFarm(me)).animals).toEqual({ duck2: { x: -250, y: 150 } })
    await expect(move('sheep')).rejects.toThrow(/desconhecido/) // saiu do rebanho
  })
})
