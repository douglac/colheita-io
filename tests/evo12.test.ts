// Evolução 12: patos escondidos e embolados na decoração cheia (QA nível máximo, 4ª rodada, P1).
// Regra das células `open` nas áreas dos bichos soltos, a "sombra" do enfeite e o fallback do freePoint().
import { Container } from 'pixi.js'
import { describe, expect, it, vi } from 'vitest'
import { cellAt, cellCenter, coversField, decorGrid, inAnimalArea, OPEN_KINDS, ornamentBase, ornamentBlocker, ornamentShadow, placeCheck, type Placed } from '../src/game/decor-grid'
import { ORNAMENT_BY_ID } from '../src/game/decor'
import { showcaseLayout } from '../src/game/decor-showcase'
import { ANIMAL_AREAS } from '../src/scene/layout'
import { Wanderer } from '../src/scene/wander'

const g = decorGrid()

/** Math.random com semente (mulberry32): o mesmo sorteio em toda execução. */
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('células open nas áreas dos bichos soltos', () => {
  it('toda célula com o centro na área padrão do pato, porco, galinha, pavão e coelho é open (ou já era corredor/bloqueada)', () => {
    for (const k of OPEN_KINDS) {
      const a = ANIMAL_AREAS[k]
      const cells = g.cells.filter((c) => { const p = cellCenter(c.u, c.v); return p.x >= a.x0 && p.x <= a.x1 && p.y >= a.y0 && p.y <= a.y1 })
      expect(cells.length, k).toBeGreaterThan(0)
      for (const c of cells) expect(['open', 'corridor', 'blocked'], `${k} ${c.u},${c.v}`).toContain(c.kind)
      // Nenhuma é faixa de enfeite (a da galinha, colada na casa e no cercado, é toda corredor).
      if (k === 'duck' || k === 'pig') expect(cells.some((c) => c.kind === 'open'), k).toBe(true)
    }
  })

  it('nenhum enfeite pode ser posto nessas células', () => {
    const open = g.cells.filter((c) => c.kind === 'open' && inAnimalArea(c.u, c.v))
    expect(open.length).toBeGreaterThan(5)
    for (const c of open) expect(placeCheck('barris', c.u, c.v, [])).toMatchObject({ ok: false, reason: expect.stringMatching(/faixas/) })
    // Caminho continua podendo passar (open aceita caminho).
    const even = open.find((c) => c.u % 2 === 0 && c.v % 2 === 0 && [[1, 0], [0, 1], [1, 1]].every(([du, dv]) => !['blocked', 'out'].includes(g.kind(c.u + du, c.v + dv))))
    if (even) expect(placeCheck('caminho_terra', even.u, even.v, [])).toEqual({ ok: true })
  })

  it('a vitrine de 40 enfeites não põe nada nas áreas dos bichos', () => {
    const layout = showcaseLayout(40)
    const orn = layout.filter((p) => !p.itemId.startsWith('caminho_'))
    expect(orn.length).toBeGreaterThanOrEqual(34) // as faixas encolheram: cabem 34 na vitrine (com o caminho em volta da roça)
    for (const p of orn) {
      const o = ORNAMENT_BY_ID[p.itemId]
      for (let dv = 0; dv < o.h; dv++) for (let du = 0; du < o.w; du++) expect(inAnimalArea(p.u + du, p.v + dv)).toBe(false)
    }
  })
})

describe('sombra do enfeite', () => {
  it('com a vitrine cheia, o meio de cada área dos bichos soltos fica livre de enfeite e de sombra', async () => {
    const { pastureBlocked } = await import('../src/game/pasture')
    const ob = ornamentBlocker(showcaseLayout(40).map((p, i) => ({ id: i + 1, ...p })))
    for (const k of OPEN_KINDS) {
      const a = ANIMAL_AREAS[k]
      let ground = 0, free = 0
      for (let x = a.x0; x <= a.x1; x += 4) for (let y = a.y0; y <= a.y1; y += 2) if (!pastureBlocked(x, y)) { ground++; if (!ob(x, y)) free++ }
      expect(free / ground, k).toBeGreaterThan(0.35)
    }
  })

  it('o chão logo atrás do desenho fica bloqueado para os bichos; na frente, não', () => {
    const c = cellAt(0, 420) // longe de tudo: só importa a conta
    const placed: Placed[] = [{ id: 1, itemId: 'arvore_frutifera', u: c.u, v: c.v }]
    const b = ornamentBase('arvore_frutifera', c.u, c.v), s = ornamentShadow('arvore_frutifera', c.u, c.v)!
    const blocked = ornamentBlocker(placed)
    expect(blocked(b.x, b.y - 40)).toBe(true) // atrás do tronco/copa
    expect(blocked(b.x + 20, b.y - 100)).toBe(true)
    expect(blocked(b.x, b.y + 30)).toBe(false) // na frente: o bicho fica por cima, visível
    expect(blocked(s.x1 + 20, b.y - 40)).toBe(false) // ao lado
    expect(s.y1 - s.y0).toBeCloseTo(ORNAMENT_BY_ID.arvore_frutifera.tall * 0.9)
  })
})

describe('freePoint() sem chão: área vizinha', () => {
  const mk = (area: { x0: number; y0: number; x1: number; y1: number }, blocked: (x: number, y: number) => boolean, flock: Wanderer[] = [], speed = 30) => {
    const node = new Container(), body = new Container()
    node.addChild(body)
    const w = new Wanderer(node, body, area, speed, true, undefined, blocked, flock, 10)
    flock.push(w)
    return w
  }
  const area = { x0: 600, y0: 400, x1: 690, y1: 448 } // longe da roça (a vizinha evita o chão atrás dela)
  // Área toda tomada por enfeites (save antigo): só fora dela há chão.
  const inArea = (x: number, y: number) => x >= area.x0 && x <= area.x1 && y >= area.y0 && y <= area.y1

  it('nasce numa área vizinha com chão livre, não no meio do bloqueado', () => {
    const w = mk(area, inArea)
    expect(inArea(w.node.x, w.node.y)).toBe(false)
    expect(Math.abs(w.node.x - 645)).toBeLessThan(45 + 170)
    for (let i = 0; i < 600; i++) { w.update(0.05); expect(inArea(w.node.x, w.node.y)).toBe(false) }
  })

  it('vários bichos na área tomada se espalham pela vizinha (sem pés colados)', () => {
    const flock: Wanderer[] = []
    for (let i = 0; i < 5; i++) mk(area, inArea, flock)
    for (let t = 0; t < 400; t++) for (const w of flock) w.update(0.05)
    for (let i = 0; i < flock.length; i++) for (let j = i + 1; j < flock.length; j++) {
      const a = flock[i].node, b = flock[j].node
      expect(Math.hypot(a.x - b.x, (a.y - b.y) * 2)).toBeGreaterThan(20 * 0.75)
    }
  })

  it('com chão na própria área, fica nela', () => {
    const w = mk(area, () => false)
    for (let i = 0; i < 400; i++) { w.update(0.05); expect(inArea(w.node.x, w.node.y)).toBe(true) }
  })

  it('unstick devolve o bicho à área de origem quando ela libera', () => {
    let full = true
    const w = mk(area, (x, y) => full && inArea(x, y))
    expect(inArea(w.node.x, w.node.y)).toBe(false)
    full = false
    w.setArea(area)
    expect(inArea(w.node.x, w.node.y)).toBe(true)
  })

  it('na vizinha, nenhum destino fica atrás da roça (QA 7ª rodada: pato 4 atrás dos lotes 13–14)', async () => {
    const { ANIMAL_AREAS, behindField, farmBlocked } = await import('../src/scene/layout')
    const duck = ANIMAL_AREAS.duck
    const inDuck = (x: number, y: number) => x >= duck.x0 && x <= duck.x1 && y >= duck.y0 && y <= duck.y1
    const blocked = (x: number, y: number) => farmBlocked(x, y) || inDuck(x, y)
    // Determinístico: sorteio com semente fixa e passo de tempo fixo (antes: "parado 0,5 s nunca atrás da roça" com
    // Math.random de verdade falhava 1 vez em 4 sob carga, quando um pato parava no meio do caminho por causa de outro).
    // O que a correção garante é o destino sorteado; é ele que o teste confere, a cada troca.
    const random = vi.spyOn(Math, 'random').mockImplementation(seeded(31))
    try {
      const flock: Wanderer[] = []
      for (let i = 0; i < 4; i++) mk(duck, blocked, flock)
      const target = (w: Wanderer) => w as unknown as { tx: number; ty: number }
      const last = flock.map((w) => ({ x: target(w).tx, y: target(w).ty }))
      let picks = 0
      for (let t = 0; t < 3000; t++) flock.forEach((w, i) => {
        w.update(0.05)
        const { tx, ty } = target(w)
        if (tx === last[i].x && ty === last[i].y) return
        last[i] = { x: tx, y: ty }
        if (tx === w.node.x && ty === w.node.y) return // parou onde estava (outro pato na frente): não é destino sorteado
        picks++
        expect(behindField(tx, ty), `destino (${tx.toFixed(0)}, ${ty.toFixed(0)})`).toBe(false)
      })
      expect(picks).toBeGreaterThan(20)
    } finally {
      random.mockRestore()
    }
  })

  it('solto atrás de um enfeite (chão bloqueado), sai andando', () => {
    const shadow = (x: number, y: number) => x > 640 && x < 660 && y > 420 && y < 440
    const w = mk(area, shadow)
    w.setArea(area, { x: 650, y: 430 })
    for (let i = 0; i < 400; i++) w.update(0.05)
    expect(shadow(w.node.x, w.node.y)).toBe(false)
  })
})

describe('enfeite atrás da roça não cobre as plantas (P3: macieira à direita do lote 14)', () => {
  it('células da faixa logo atrás da roça recusam enfeite alto; a vitrine não põe nenhum ali', () => {
    const zone = g.cells.filter((c) => c.kind === 'zone')
    const refused = zone.filter((c) => coversField('arvore_frutifera', c.u, c.v))
    expect(refused.length).toBeGreaterThan(0)
    for (const c of refused) expect(placeCheck('arvore_frutifera', c.u, c.v, [])).toMatchObject({ ok: false, reason: expect.stringMatching(/plantas/) })
    for (const p of showcaseLayout(40)) if (!p.itemId.startsWith('caminho_')) expect(coversField(p.itemId, p.u, p.v), `${p.itemId} ${p.u},${p.v}`).toBe(false)
  })
})

describe('zumbizinhos com área própria (P3 do Dia das Bruxas)', () => {
  it('a área dos visitantes não cruza a de nenhum bicho, está toda livre e fora das faixas de enfeite', async () => {
    const { EVENT_AREAS } = await import('../src/scene/event-layer')
    const { pastureBlocked } = await import('../src/game/pasture')
    const zombie = EVENT_AREAS[1]
    for (const [k, a] of Object.entries(ANIMAL_AREAS)) {
      const cross = zombie.x0 < a.x1 && a.x0 < zombie.x1 && zombie.y0 < a.y1 && a.y0 < zombie.y1
      expect(cross, k).toBe(false)
    }
    for (let x = zombie.x0; x <= zombie.x1; x += 5) for (let y = zombie.y0; y <= zombie.y1; y += 5) {
      expect(pastureBlocked(x, y), `${x},${y}`).toBe(false)
      const c = cellAt(x, y)
      expect(g.kind(c.u, c.v)).not.toBe('zone')
    }
  })
})

describe('desempenho: chão dos bichos com memória', () => {
  it('pastureBlockedFast dá o mesmo que pastureBlocked nos pontos da grade e quase sempre fora deles', async () => {
    const { pastureBlocked, pastureBlockedFast, YARD } = await import('../src/game/pasture')
    let n = 0, diff = 0
    for (let x = YARD.x0 - 20; x <= YARD.x1 + 20; x += 6) for (let y = YARD.y0 - 20; y <= YARD.y1 + 20; y += 4) {
      n++
      if (pastureBlockedFast(x, y) !== pastureBlocked(x, y)) diff++
      // Fora da grade: só a borda dos obstáculos (≤ 1 unidade) pode dar diferente.
      const ox = x + 0.7, oy = y + 0.3
      if (pastureBlockedFast(ox, oy) !== pastureBlocked(ox, oy)) diff++
    }
    expect(diff / n).toBeLessThan(0.02)
    expect(pastureBlockedFast(YARD.x0 - 5, 0)).toBe(true)
  })
})
