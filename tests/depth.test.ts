import { describe, expect, it } from 'vitest'
import { brasiliaHour, lightAt } from '../src/scene/lighting'
import { BADGE_HIT, PLANT_HIT_HALF, PLOT_SIDE, plotHitArea, plotHitPolygon } from '../src/scene/depth'
import { TILE_H, TILE_W } from '../src/scene/iso'
import { diamond, isoToScreen } from '../src/scene/iso'

const inPoly = (x: number, y: number, p: number[]) => {
  let inside = false
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const [xi, yi, xj, yj] = [p[i], p[i + 1], p[j], p[j + 1]]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

describe('luz por hora (Brasília)', () => {
  it('converte para o fuso de São Paulo', () => {
    // 15:00 UTC = 12:00 em Brasília (sem horário de verão desde 2019).
    expect(brasiliaHour(new Date('2026-10-08T15:00:00Z'))).toBe(12)
    expect(brasiliaHour(new Date('2026-10-09T02:30:00Z'))).toBe(23.5)
  })
  it('tarde neutra, manhã quente, noite azulada mas legível', () => {
    expect(lightAt(14)).toEqual({ tint: 0xffffff, night: 0 })
    const m = lightAt(8)
    expect(m.night).toBe(0)
    expect(m.tint >> 16).toBeGreaterThan(m.tint & 0xff) // mais vermelho que azul
    const n = lightAt(23)
    expect(n.night).toBe(1)
    expect(n.tint & 0xff).toBeGreaterThan(n.tint >> 16) // mais azul que vermelho
    expect(Math.min(n.tint >> 16, (n.tint >> 8) & 0xff, n.tint & 0xff)).toBeGreaterThanOrEqual(0x80) // não escurece demais
  })
  it('muda aos poucos (sem saltos entre minutos)', () => {
    for (let h = 0; h < 24; h += 1 / 60) {
      const a = lightAt(h), b = lightAt(h + 1 / 60)
      for (const s of [16, 8, 0]) expect(Math.abs(((a.tint >> s) & 0xff) - ((b.tint >> s) & 0xff))).toBeLessThanOrEqual(3)
    }
  })
})

describe('toque no lote com espessura', () => {
  // Grade 3×4 como na cena: o de maior (col + row) fica por cima e é testado primeiro.
  const plots = Array.from({ length: 12 }, (_, idx) => {
    const col = idx % 3, row = Math.floor(idx / 3)
    const p = isoToScreen(col, row)
    return { idx, col, row, x: p.x, y: p.y, z: col + row }
  })
  const pick = (x: number, y: number) => {
    const order = [...plots].sort((a, b) => b.z - a.z || b.idx - a.idx)
    return order.find((p) => inPoly(x - p.x, y - p.y, plotHitPolygon()))?.idx ?? null
  }

  it('o topo de cada lote continua sendo dele (a lateral do vizinho de trás não rouba)', () => {
    for (const p of plots) {
      const top = diamond(0, 0)
      for (let t = 0; t <= 1; t += 0.1) {
        for (let v = 0; v < 4; v++) {
          // pontos do centro até 95% do caminho a cada vértice e ao meio de cada aresta
          const [ax, ay, bx, by] = [top[v * 2], top[v * 2 + 1], top[(v * 2 + 2) % 8], top[(v * 2 + 3) % 8]]
          for (const [qx, qy] of [[ax, ay], [(ax + bx) / 2, (ay + by) / 2]]) {
            expect(pick(p.x + qx * 0.95 * t, p.y + qy * 0.95 * t)).toBe(p.idx)
          }
        }
      }
    }
  })

  it('a lateral de terra da frente da roça acerta o lote dono dela', () => {
    for (const p of plots) {
      if (p.col === 2) expect(pick(p.x + 33, p.y + 16.5 + PLOT_SIDE / 2)).toBe(p.idx)
      if (p.row === 3) expect(pick(p.x - 33, p.y + 16.5 + PLOT_SIDE / 2)).toBe(p.idx)
    }
    // Abaixo da lateral é gramado.
    expect(pick(plots[11].x, plots[11].y + 33 + PLOT_SIDE + 3)).toBeNull()
  })

  it('terra contínua: lateral só onde ela aparece (borda externa)', () => {
    const left = plotHitPolygon({ left: true, right: false }), none = plotHitPolygon({ left: false, right: false })
    expect(inPoly(-33, 16.5 + PLOT_SIDE / 2, left)).toBe(true)
    expect(inPoly(33, 16.5 + PLOT_SIDE / 2, left)).toBe(false)
    expect(inPoly(0, 33 + PLOT_SIDE / 2, none)).toBe(false)
    expect(inPoly(0, 0, none)).toBe(true)
  })
})

describe('toque na planta acima do lote (todas as ferramentas, prévia de 09/10)', () => {
  // Mesma grade; cada lote com a planta de altura `tall[idx]` (topo da parte opaca, coordenadas do lote).
  const plots = Array.from({ length: 12 }, (_, idx) => {
    const col = idx % 3, row = Math.floor(idx / 3)
    const p = isoToScreen(col, row)
    return { idx, x: p.x, y: p.y, z: col + row }
  })
  const pick = (x: number, y: number, top: (idx: number) => number, badge = false) => {
    const order = [...plots].sort((a, b) => b.z - a.z || b.idx - a.idx)
    return order.find((p) => plotHitArea(plotHitPolygon(), top(p.idx), badge).contains(x - p.x, y - p.y))?.idx ?? null
  }

  it('sem planta (ou planta baixa) é só o losango: nada muda', () => {
    const area = plotHitArea(plotHitPolygon(), 0, false)
    expect(area.contains(0, 0)).toBe(true)
    expect(area.contains(0, -TILE_H / 2 - 2)).toBe(false)
  })

  it('milho alto: o toque nas folhas acima do lote é do lote (antes não chegava a lote nenhum ou caía no de trás)', () => {
    const tall = -2.2 * TILE_H
    const p = plots[10] // fileira da frente
    for (let y = -TILE_H / 2 - 2; y >= tall; y -= 4) {
      // Só o 10 é alto (um vizinho da frente igualmente alto cobriria a borda da coluna, e ganharia: está por cima).
      const only = (i: number) => (i === 10 ? tall : 0)
      expect(pick(p.x, p.y + y, only)).toBe(10)
      expect(pick(p.x + TILE_W * PLANT_HIT_HALF * 0.9, p.y + y, only)).toBe(10)
      expect(pick(p.x - TILE_W * PLANT_HIT_HALF * 0.9, p.y + y, only)).toBe(10)
    }
    // Fora da planta (acima do topo dela), volta a ser o lote de trás / gramado.
    expect(pick(p.x, p.y + tall - 3, (i) => (i === 10 ? tall : 0))).not.toBe(10)
  })

  it('o lote de trás continua tocável na planta dele, acima da planta da frente', () => {
    const top = (i: number) => (i === 10 ? -1.2 * TILE_H : -2.2 * TILE_H)
    const back = plots[6] // atrás do 10 na mesma coluna da tela
    expect(back.x).toBeCloseTo(plots[10].x)
    expect(pick(back.x, back.y - 1.5 * TILE_H, top)).toBe(6)
  })

  it('o marcador (✓/✋) acima do lote também é toque no lote', () => {
    const p = plots[4]
    expect(pick(p.x, p.y + BADGE_HIT.y, () => 0, true)).toBe(4)
    expect(pick(p.x + BADGE_HIT.r - 2, p.y + BADGE_HIT.y, () => 0, true)).toBe(4)
  })
})

describe('partículas pelas mudanças do lote', () => {
  it('escolhe a rajada certa para cada ação', async () => {
    const { plotBurst } = await import('../src/scene/FarmScene')
    const p = (o: object) => ({ idx: 0, state: 'growing' as const, ...o })
    expect(plotBurst(p({ state: 'ripe' }), p({ state: 'empty' }))).toBe('harvest')
    expect(plotBurst(p({ state: 'ripe', canSteal: true }), p({ state: 'ripe', canSteal: false }))).toBe('harvest')
    expect(plotBurst(p({ state: 'withered' }), p({ state: 'empty' }))).toBe('dust')
    expect(plotBurst(p({ state: 'empty' }), p({}))).toBe('dust')
    expect(plotBurst(p({ dry: true }), p({ dry: false }))).toBe('water')
    expect(plotBurst(p({ weeds: 2 }), p({ weeds: 1 }))).toBe('leaves')
    expect(plotBurst(p({}), p({ state: 'ripe' }))).toBe('sparkle')
    expect(plotBurst(p({ progress: 0.2 }), p({ progress: 0.3 }))).toBeNull()
  })
})
