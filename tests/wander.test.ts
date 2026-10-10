import { Container } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { Wanderer } from '../src/scene/wander'

describe('bichos passeando', () => {
  it('andam dentro da área, viram para o lado do movimento e param', () => {
    const node = new Container(), body = new Container()
    node.addChild(body)
    const area = { x0: 0, y0: 0, x1: 100, y1: 50 }
    const w = new Wanderer(node, body, area, 40, true)
    const seen = new Set<number>()
    let moved = 0, lastX = node.x
    for (let i = 0; i < 2000; i++) {
      w.update(0.05)
      expect(node.x).toBeGreaterThanOrEqual(0); expect(node.x).toBeLessThanOrEqual(100)
      expect(node.y).toBeGreaterThanOrEqual(0); expect(node.y).toBeLessThanOrEqual(50)
      if (node.x !== lastX) { moved++; seen.add(Math.sign(node.x - lastX) * Math.sign(body.scale.x)) }
      lastX = node.x
    }
    expect(moved).toBeGreaterThan(100)
    // Desenho olha para a esquerda: andando para a esquerda, escala positiva (sinal do produto = −1).
    expect([...seen]).toEqual([-1])
  })
})

describe('bichos desviam da fazenda', () => {
  it('nunca pisam nem atravessam roça, casa, casinha e cerca', async () => {
    // Áreas reais de cada bicho e obstáculos da roça cheia (24 lotes), de layout.ts.
    const { farmBlocked, DOG_AREA, ANIMAL_AREAS, plotPos, MAX_FIELD_PLOTS } = await import('../src/scene/layout')
    const areas = [...Object.values(ANIMAL_AREAS), DOG_AREA]
    // Os 24 lotes ficam dentro do obstáculo da roça (bicho nunca pisa num lote, nem nos que ainda vão ser comprados).
    for (let i = 0; i < MAX_FIELD_PLOTS; i++) { const p = plotPos(i); expect(farmBlocked(p.x, p.y)).toBe(true) }
    for (const area of areas) {
      const node = new Container(), body = new Container()
      node.addChild(body)
      const w = new Wanderer(node, body, area, 40, true, undefined, farmBlocked)
      for (let i = 0; i < 3000; i++) {
        w.update(0.05)
        expect(farmBlocked(node.x, node.y)).toBe(false)
      }
    }
  }, 30_000) // 10 áreas × 3.000 passos: ~3 s sozinho, mais com a suíte em paralelo
})

describe('enfeite posto onde o bicho está', () => {
  it('unstick tira o bicho de dentro do enfeite e ele volta a passear', () => {
    const node = new Container(), body = new Container()
    node.addChild(body)
    let orn = { x0: 0, y0: 0, x1: -1, y1: -1 } // nenhum enfeite ainda
    const blocked = (x: number, y: number) => x >= orn.x0 && x <= orn.x1 && y >= orn.y0 && y <= orn.y1
    const w = new Wanderer(node, body, { x0: 0, y0: 0, x1: 100, y1: 50 }, 40, true, undefined, blocked)
    // A decoração chega depois: um enfeite em volta de onde ele está (como na vitrine do QA nível máximo).
    orn = { x0: node.x - 15, y0: node.y - 8, x1: node.x + 15, y1: node.y + 8 }
    expect(blocked(node.x, node.y)).toBe(true)
    w.unstick()
    expect(blocked(node.x, node.y)).toBe(false)
    const start = node.x
    let moved = false
    for (let i = 0; i < 400; i++) { w.update(0.05); expect(blocked(node.x, node.y)).toBe(false); if (node.x !== start) moved = true }
    expect(moved).toBe(true)
  })
})

describe('colmeia criada depois em cima do bicho', () => {
  it('unstick tira o bicho de cima do bicho parado (a colmeia não sai do lugar)', () => {
    const flock: Wanderer[] = []
    const mk = (area: { x0: number; y0: number; x1: number; y1: number }, speed: number, foot: number) => {
      const node = new Container(), body = new Container()
      node.addChild(body)
      const w = new Wanderer(node, body, area, speed, true, undefined, () => false, flock, foot)
      flock.push(w)
      return w
    }
    // Coelho nasce primeiro; a colmeia (parada) nasce depois exatamente onde ele está.
    const rabbit = mk({ x0: -115, y0: -170, x1: 0, y1: -120 }, 34, 13.6)
    const at = { x: rabbit.node.x, y: rabbit.node.y }
    const hive = mk({ x0: at.x, y0: at.y, x1: at.x, y1: at.y }, 0, 28.8)
    const dist = () => Math.hypot(rabbit.node.x - hive.node.x, (rabbit.node.y - hive.node.y) * 2)
    expect(dist()).toBeLessThan((13.6 + 28.8) * 1.15)
    for (const w of flock) w.unstick()
    expect(hive.node.x).toBe(at.x)
    expect(dist()).toBeGreaterThanOrEqual((13.6 + 28.8) * 1.15)
  })
})
