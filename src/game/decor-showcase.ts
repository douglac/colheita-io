// Fazenda de vitrine da decoração (QA e medição de desempenho): caminho de pedra em volta da roça e até
// 40 enfeites nas faixas, com espaço entre eles. Passa pelas mesmas regras do servidor (placeCheck).
import { ORNAMENTS } from './decor'
import { decorGrid, footprint, PATH_STEP, placeCheck, type Placed } from './decor-grid'
import type { Spots } from './pasture'

const FIELD_U = [0, 11], FIELD_V = [0, 7] // roça cheia em células finas (24 lotes, 12 × 8)

/** `gap`: células livres entre enfeites (o desenho passa da pegada: com 2 eles não se encostam). */
export function showcaseLayout(max = 40, animals: Spots = {}, gap = max > 24 ? 1 : 2): Omit<Placed, 'id'>[] {
  const g = decorGrid()
  const placed: Placed[] = []
  const add = (itemId: string, u: number, v: number) => {
    if (!placeCheck(itemId, u, v, placed, animals).ok) return false
    placed.push({ id: placed.length + 1, itemId, u, v })
    return true
  }
  // Caminho em volta da roça: o anel de lotes logo fora dela (passa pelo corredor).
  for (let v = FIELD_V[0] - PATH_STEP; v <= FIELD_V[1] + 1; v += PATH_STEP) {
    for (let u = FIELD_U[0] - PATH_STEP; u <= FIELD_U[1] + 1; u += PATH_STEP) {
      const ring = u < FIELD_U[0] || u > FIELD_U[1] || v < FIELD_V[0] || v > FIELD_V[1]
      if (ring) add('caminho_pedra', u, v)
    }
  }
  // Enfeites: maiores primeiro, depois os outros em rodízio, com `gap` células de folga entre eles.
  const near = (u: number, v: number, w: number, h: number) => placed.some((p) => !p.itemId.startsWith('caminho_') &&
    footprint(p.itemId, p.u, p.v).some(([a, b]) => a >= u - gap && a < u + w + gap && b >= v - gap && b < v + h + gap))
  const zone = g.cells.filter((c) => c.kind === 'zone').sort((a, b) => (a.u + a.v) - (b.u + b.v) || a.u - b.u)
  const order = [...ORNAMENTS].sort((a, b) => b.w * b.h - a.w * a.h)
  let count = 0
  for (let round = 0; round < 2 && count < max; round++) {
    for (const o of order) {
      for (const c of zone) {
        if (count >= max) break
        if ((round === 0 || gap >= 2) && near(c.u, c.v, o.w, o.h)) continue
        if (add(o.id, c.u, c.v)) { count++; break }
      }
    }
  }
  // Ainda cabe mais (só na vitrine de 40, a da medição): completa em rodízio sem folga, até o máximo.
  for (let i = 0; gap < 2 && count < max && i < order.length * 4; i++) {
    const o = order[i % order.length]
    if (zone.some((c) => add(o.id, c.u, c.v))) count++
  }
  return placed.map(({ itemId, u, v }) => ({ itemId, u, v }))
}
