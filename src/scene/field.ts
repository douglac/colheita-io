// Roça como UM bloco de terra: topo plano em todos os lotes e espessura (lateral) só no contorno
// externo do conjunto de lotes comprados. Funções puras (testadas em tests/field.test.ts).
import { TILE_H, TILE_W } from './iso'
import { plotCell, plotPos } from './layout'

export type Sides = { left: boolean; right: boolean }
type Pt = { x: number; y: number }
/** Aresta do topo de um lote (no mundo). `face`: lateral pendurada nela; `seam`: divisa entre dois lotes. */
export type Edge = { idx: number; a: Pt; b: Pt }

const key = (col: number, row: number) => `${col},${row}`

/**
 * Quais laterais cada lote mostra. Na projeção, a face esquerda fica embaixo da aresta
 * esquerda-baixo (vizinho em row+1) e a direita embaixo da aresta direita-baixo (vizinho em col+1):
 * só aparece onde esse vizinho não é terra.
 */
export function soilSides(soil: number[]): Map<number, Sides> {
  const have = new Set(soil.map((i) => { const c = plotCell(i); return key(c.col, c.row) }))
  const out = new Map<number, Sides>()
  for (const i of soil) {
    const { col, row } = plotCell(i)
    out.set(i, { left: !have.has(key(col, row + 1)), right: !have.has(key(col + 1, row)) })
  }
  return out
}

/** Vértices do losango do lote (topo, direita, base, esquerda). */
export function plotCorners(idx: number) {
  const p = plotPos(idx)
  return {
    top: { x: p.x, y: p.y - TILE_H / 2 }, right: { x: p.x + TILE_W / 2, y: p.y },
    bottom: { x: p.x, y: p.y + TILE_H / 2 }, left: { x: p.x - TILE_W / 2, y: p.y },
  }
}

/** Arestas do contorno de baixo (onde a lateral aparece) e as divisas internas entre lotes de terra. */
export function fieldEdges(soil: number[]) {
  const sides = soilSides(soil)
  const left: Edge[] = [], right: Edge[] = [], seams: Edge[] = []
  for (const [idx, s] of sides) {
    const c = plotCorners(idx)
    // Divisas: cada par de vizinhos conta uma vez (a aresta de baixo de quem tem o vizinho).
    if (s.left) left.push({ idx, a: c.left, b: c.bottom })
    else seams.push({ idx, a: c.left, b: c.bottom })
    if (s.right) right.push({ idx, a: c.bottom, b: c.right })
    else seams.push({ idx, a: c.bottom, b: c.right })
  }
  return { sides, left, right, seams }
}

export type CornerKind = 's' | 'w' | 'e' | 'inner'
/**
 * Quinas do contorno com lateral: `s` = bico da frente (face esquerda encontra a direita no mesmo lote),
 * `w`/`e` = pontas da corrida (início à esquerda, fim à direita), `inner` = quina para dentro (forma em L).
 */
export function fieldCorners(soil: number[]) {
  const { left, right } = fieldEdges(soil)
  const k = (p: Pt) => `${Math.round(p.x)},${Math.round(p.y)}`
  const leftA = new Set(left.map((e) => k(e.a))), leftB = new Set(left.map((e) => k(e.b)))
  const rightA = new Set(right.map((e) => k(e.a))), rightB = new Set(right.map((e) => k(e.b)))
  const out: { kind: CornerKind; idx: number; p: Pt }[] = []
  for (const e of left) {
    if (!leftB.has(k(e.a)) && !rightB.has(k(e.a))) out.push({ kind: 'w', idx: e.idx, p: e.a })
    if (rightA.has(k(e.b)) && right.some((r) => r.idx === e.idx)) out.push({ kind: 's', idx: e.idx, p: e.b })
  }
  for (const e of right) {
    if (!rightA.has(k(e.b)) && !leftA.has(k(e.b))) out.push({ kind: 'e', idx: e.idx, p: e.b })
    if (leftA.has(k(e.b))) out.push({ kind: 'inner', idx: e.idx, p: e.b })
  }
  return out
}

export type Rims = { se: boolean; sw: boolean; ne: boolean; nw: boolean; s: boolean; e: boolean; w: boolean }
/**
 * Friso dos montinhos (lote K, manifesto lote-k-montinhos.md): cada lado do lote sem vizinho no
 * conjunto ganha friso — se: falta (col+1, row); sw: falta (col, row+1); ne: falta (col, row−1);
 * nw: falta (col−1, row). Os cantos fecham pares de lados expostos: s = se+sw (bico da frente),
 * e = se+ne (ponta direita), w = sw+nw (ponta esquerda). Vale para retângulo, L e escada.
 */
export function plotRims(cells: number[]): Map<number, Rims> {
  const have = new Set(cells.map((i) => { const c = plotCell(i); return key(c.col, c.row) }))
  const out = new Map<number, Rims>()
  for (const i of cells) {
    const { col, row } = plotCell(i)
    const se = !have.has(key(col + 1, row)), sw = !have.has(key(col, row + 1))
    const ne = !have.has(key(col, row - 1)), nw = !have.has(key(col - 1, row))
    out.set(i, { se, sw, ne, nw, s: se && sw, e: se && ne, w: sw && nw })
  }
  return out
}
