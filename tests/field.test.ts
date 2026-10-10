import { describe, expect, it } from 'vitest'
import { fieldEdges, plotRims, soilSides } from '../src/scene/field'
import { MAX_FIELD_PLOTS, plotCell } from '../src/scene/layout'

const range = (n: number) => Array.from({ length: n }, (_, i) => i)
const cellKey = (i: number) => { const c = plotCell(i); return `${c.col},${c.row}` }

describe('terra da roça: lateral só no contorno', () => {
  it('roça cheia (6 × 4): só a fileira da frente mostra a face esquerda e só a última coluna a direita', () => {
    const sides = soilSides(range(24))
    for (const [idx, s] of sides) {
      const { col, row } = plotCell(idx)
      expect(s.left, `lote ${idx} esquerda`).toBe(row === 3)
      expect(s.right, `lote ${idx} direita`).toBe(col === 5)
    }
  })

  it('de 1 a 24 lotes comprados em ordem: lateral exatamente onde o vizinho da frente não é terra', () => {
    for (let n = 1; n <= MAX_FIELD_PLOTS; n++) {
      const soil = range(n)
      const have = new Set(soil.map(cellKey))
      for (const [idx, s] of soilSides(soil)) {
        const { col, row } = plotCell(idx)
        expect(s.left).toBe(!have.has(`${col},${row + 1}`))
        expect(s.right).toBe(!have.has(`${col + 1},${row}`))
      }
    }
  })

  it('nenhuma lateral dentro da roça: toda aresta com lateral fica na borda de fora', () => {
    for (let n = 1; n <= MAX_FIELD_PLOTS; n++) {
      const { left, right, seams } = fieldEdges(range(n))
      const k = (p: { x: number; y: number }) => `${Math.round(p.x)},${Math.round(p.y)}`
      const seam = new Set(seams.map((e) => `${k(e.a)}>${k(e.b)}`))
      // Aresta com lateral nunca é também divisa entre dois lotes de terra.
      for (const e of [...left, ...right]) expect(seam.has(`${k(e.a)}>${k(e.b)}`)).toBe(false)
      // Cada aresta interna aparece uma vez só (o sulco não é desenhado em dobro).
      expect(seam.size).toBe(seams.length)
    }
  })

  it('o contorno com lateral é uma linha contínua (sem degrau nem buraco), também em formas em L', () => {
    for (const n of [6, 12, 13, 14, 15, 16, 18, 21, 24]) {
      const { left, right } = fieldEdges(range(n))
      const edges = [...left, ...right]
      const k = (p: { x: number; y: number }) => `${Math.round(p.x)},${Math.round(p.y)}`
      const deg = new Map<string, number>()
      for (const e of edges) for (const p of [e.a, e.b]) deg.set(k(p), (deg.get(k(p)) ?? 0) + 1)
      // Corrida única: exatamente 2 pontas, o resto com grau 2.
      expect([...deg.values()].filter((d) => d === 1).length, `n=${n}`).toBe(2)
      expect([...deg.values()].every((d) => d <= 2), `n=${n}`).toBe(true)
      // As arestas com lateral são as de baixo (esquerda-baixo e direita-baixo): nunca as de cima.
      for (const e of left) expect(e.b.y).toBeGreaterThan(e.a.y)
      for (const e of right) expect(e.b.y).toBeLessThan(e.a.y)
    }
  })

  it('lote à venda (fora da lista de terra) não ganha lateral nem deixa o vizinho sem lateral', () => {
    // 6 lotes comprados + o 7º à venda: o à venda é gramado, então os da frente continuam com lateral.
    const sides = soilSides(range(6))
    expect(sides.has(6)).toBe(false)
    expect(sides.get(3)?.left).toBe(true) // (0,1) sem (0,2) comprado
  })
})

describe('montinhos (lote K): friso só no contorno', () => {
  it('roça cheia: friso só nos lados de fora e cantos só nas 3 pontas visíveis', () => {
    const rims = plotRims(range(24))
    let s = 0, e = 0, w = 0
    for (const [idx, r] of rims) {
      const { col, row } = plotCell(idx)
      expect(r).toMatchObject({ se: col === 5, sw: row === 3, ne: row === 0, nw: col === 0 })
      s += +r.s; e += +r.e; w += +r.w
    }
    expect([s, e, w]).toEqual([1, 1, 1])
  })
  it('de 1 a 24 lotes: nenhum friso entre dois lotes do conjunto', () => {
    for (let n = 1; n <= MAX_FIELD_PLOTS; n++) {
      const have = new Set(range(n).map(cellKey))
      for (const [idx, r] of plotRims(range(n))) {
        const { col, row } = plotCell(idx)
        expect(r.se).toBe(!have.has(`${col + 1},${row}`))
        expect(r.sw).toBe(!have.has(`${col},${row + 1}`))
        expect(r.ne).toBe(!have.has(`${col},${row - 1}`))
        expect(r.nw).toBe(!have.has(`${col - 1},${row}`))
      }
    }
  })
})
