// Geometria da fazenda num lugar só: grade dos lotes (até 24), obstáculos dos bichos, cerca,
// áreas de passeio e o retângulo que a câmera enquadra. Coordenadas do mundo (iso 2:1, TILE_W 132).
import { isoToScreen, TILE_H, TILE_W } from './iso'

export const MAX_FIELD_PLOTS = 24

// Lotes 0–11: bloco de 3 colunas × 4 fileiras (como sempre foi). Lotes 12–23: segundo bloco de
// 3 colunas à direita, completando 6 × 4. A roça cresce "em colunas", e lote antigo nunca muda de lugar.
const BLOCK_COLS = 3
const BLOCK_SIZE = 12
const ORIGIN = { x: 70, y: -60 }

export function plotCell(idx: number) {
  const block = Math.floor(idx / BLOCK_SIZE), k = idx % BLOCK_SIZE
  return { col: block * BLOCK_COLS + (k % BLOCK_COLS), row: Math.floor(k / BLOCK_COLS) }
}

/** Centro do losango do lote no mundo. */
export function plotPos(idx: number) {
  const { col, row } = plotCell(idx)
  const p = isoToScreen(col, row)
  return { x: p.x + ORIGIN.x, y: p.y + ORIGIN.y }
}

// ---------- obstáculos (nos pés dos bichos) ----------
export type Pt = [number, number]
type Box = { x0: number; y0: number; x1: number; y1: number }

export const distSeg = (px: number, py: number, [ax, ay]: Pt, [bx, by]: Pt) => {
  const vx = bx - ax, vy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)))
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy))
}
export const inPoly = (x: number, y: number, poly: Pt[]) => {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
const nearPoly = (x: number, y: number, poly: Pt[], margin: number) =>
  inPoly(x, y, poly) || poly.some((p, i) => distSeg(x, y, p, poly[(i + 1) % poly.length]) < margin)

/** Contorno da roça cheia (24 lotes): os bichos já evitam onde um lote ainda vai ser comprado. */
const corner = (idx: number, dx: number, dy: number): Pt => { const p = plotPos(idx); return [p.x + dx, p.y + dy] }
export const FIELD: Pt[] = [
  corner(0, 0, -TILE_H / 2), // topo (lote 0)
  corner(14, TILE_W / 2, 0), // direita (última coluna, 1ª fileira)
  corner(23, 0, TILE_H / 2), // base (última coluna, última fileira)
  corner(9, -TILE_W / 2, 0), // esquerda (1ª coluna, última fileira)
]
export const HOUSE: Pt[] = [[-340, -115], [-120, -115], [-120, 8], [-340, 8]]
export const DOGHOUSE: Pt[] = [[188, -158], [312, -158], [312, -88], [188, -88]]
/** Cerca na frente do bloco novo, paralela à borda frontal-direita da roça cheia. */
export const FENCE: [Pt, Pt] = [[240, 262], [452, 156]]

/** Árvores do cenário: pé (x, y) e largura do desenho (scene/tree.png, 256×288, âncora no pé). */
export const TREES: { x: number; y: number; w: number }[] = [
  { x: -395, y: -150, w: 130 }, { x: -70, y: -250, w: 120 }, { x: 345, y: -205, w: 125 }, { x: 430, y: -60, w: 110 },
]

// ---------- cercado (lote J): pasto da vaca, ovelha, cabra e burro ----------
/** Escala das peças pen_fence_* (passo de 128×64 px na arte → 48×24 no mundo, o 2:1 do chão). */
export const PEN_ART_SCALE = 0.375
const PEN_STEP: Pt = [128 * PEN_ART_SCALE, 64 * PEN_ART_SCALE]
const PEN_TOP: Pt = [-176, 81]
const PEN_COL = 6, PEN_ROW = 5 // peças no lado da coluna (desce para a direita) e da fileira (desce para a esquerda)
const at = (c: number, r: number): Pt => [PEN_TOP[0] + (c - r) * PEN_STEP[0], PEN_TOP[1] + (c + r) * PEN_STEP[1]]
/** Cantos do cercado: topo, direita, base, esquerda (mesmo 2:1 da roça, a 40+ de distância dela). */
export const PEN: Pt[] = [at(0, 0), at(PEN_COL, 0), at(PEN_COL, PEN_ROW), at(0, PEN_ROW)]
/**
 * Peças da cerca, de poste a poste (a = esquerda, b = direita na tela). `gate`: o portão do lote J
 * (só sobe para a direita), no lado da frente-direita, de frente para a roça.
 */
export const PEN_PIECES: { a: Pt; b: Pt; gate?: boolean }[] = [
  ...Array.from({ length: PEN_COL }, (_, i) => ({ a: at(i, 0), b: at(i + 1, 0) })), // topo → direita (fundo)
  ...Array.from({ length: PEN_ROW }, (_, i) => ({ a: at(0, PEN_ROW - i), b: at(0, PEN_ROW - i - 1) })), // esquerda → topo (fundo)
  ...Array.from({ length: PEN_ROW }, (_, i) => ({ a: at(PEN_COL, PEN_ROW - i), b: at(PEN_COL, PEN_ROW - i - 1), gate: i === 2 })), // base → direita (frente)
  ...Array.from({ length: PEN_COL }, (_, i) => ({ a: at(i, PEN_ROW), b: at(i + 1, PEN_ROW) })), // esquerda → base (frente)
]
/** Adereços fixos (lote J): pé (x, y) no mundo e largura do desenho. */
export const PROPS: { key: 'nest' | 'milk_bucket' | 'wool_basket'; animal: 'chicken' | 'cow' | 'sheep'; x: number; y: number; w: number }[] = [
  { key: 'milk_bucket', animal: 'cow', x: -110, y: 150, w: 34 }, // no cercado, perto da vaca
  { key: 'wool_basket', animal: 'sheep', x: -330, y: 200, w: 40 }, // no cercado, perto das ovelhas
  { key: 'nest', animal: 'chicken', x: -250, y: 36, w: 40 }, // na frente da casa, onde as galinhas ciscam (fora da roça: em -140,26 ficava em cima do lote 9)
]
/**
 * Textura do adereço: a variante cheia (lote Q, A1: ovos no ninho, leite no balde, lã no cesto) quando algum
 * bicho dele tem o lote pronto. `ready` = slots prontos ("chicken", "chicken2"…).
 */
export const propTexture = (p: (typeof PROPS)[number], ready: readonly string[]) =>
  ready.some((slot) => slot.replace(/\d+$/, '') === p.animal) ? `${p.key}_full` : p.key
const PEN_EDGES: [Pt, Pt][] = PEN.map((p, i) => [p, PEN[(i + 1) % PEN.length]])

/** Distância mínima (perpendicular à borda) entre o pé do bicho e a roça. A ordem pelo pé conta com ela (depth-order.ts). */
export const FIELD_MARGIN = 22

export const farmBlocked = (x: number, y: number) =>
  nearPoly(x, y, FIELD, FIELD_MARGIN) || nearPoly(x, y, HOUSE, 10) || nearPoly(x, y, DOGHOUSE, 10) || distSeg(x, y, FENCE[0], FENCE[1]) < 18
  || PEN_EDGES.some(([a, b]) => distSeg(x, y, a, b) < 14) || PROPS.some((p) => Math.hypot(x - p.x, (y - p.y) * 2) < p.w * 0.6)

/**
 * Chão logo atrás da roça (a roça está até ~75 abaixo dele): as plantas dos lotes, desenhadas por cima, cobririam
 * o bicho. As áreas de passeio de layout.ts já evitam; serve para a área vizinha do Wanderer (wander.ts).
 */
// Folga de 40 (era 22): a copa das frutíferas (pessegueiro, romã) passa da beira da roça, e o pato/pavão extra que
// parava ao lado da ponta aparecia em cima dela (QA nível máximo, 6ª rodada).
export const behindField = (x: number, y: number) => [25, 50, 75, 100].some((d) => nearPoly(x, y + d, FIELD, 40))

/** Dentro do cercado (com folga da cerca). */
export const inPen = (x: number, y: number) => inPoly(x, y, PEN)

// ---------- áreas de passeio ----------
export const DOG_AREA: Box = { x0: 120, y0: -165, x1: 185, y1: -82 }
const penXs = PEN.map((p) => p[0]), penYs = PEN.map((p) => p[1])
/** O cercado inteiro como área: quem passeia ali sorteia destino dentro do polígono (`poly`). */
const PASTURE: Area = { x0: Math.min(...penXs), y0: Math.min(...penYs), x1: Math.max(...penXs), y1: Math.max(...penYs), poly: PEN }
export type Area = Box & { poly?: Pt[] }
export const ANIMAL_AREAS: Record<'cow' | 'sheep' | 'pig' | 'chicken' | 'donkey' | 'peacock' | 'duck' | 'rabbit' | 'goat' | 'bee', Area> = {
  cow: PASTURE, sheep: PASTURE, goat: PASTURE, donkey: PASTURE,
  pig: { x0: 230, y0: 262, x1: 420, y1: 320 }, // atrás da cerca, na frente da roça
  chicken: { x0: -330, y0: -40, x1: -150, y1: 40 },
  peacock: { x0: -400, y0: 10, x1: -200, y1: 70 }, // entre a casa e o cercado
  // Atrás da roça, à direita, recuado: com y até 60 o pato pisava nas plantas e nos balões dos lotes 13–14 (desenhado na frente deles).
  duck: { x0: 400, y0: -48, x1: 490, y1: 0 },
  // Colmeia (não anda): atrás da roça, junto da casa ("colmeia na quina"); mais perto, ficava atrás das plantas do lote 3.
  bee: { x0: -95, y0: -135, x1: -95, y1: -135 },
  rabbit: { x0: -115, y0: -170, x1: 0, y1: -120 }, // entre a casa e a roça (x até 40 e y até -100 punham o coelho em cima das plantas dos lotes 0 e 3)
}

// ---------- enquadramento ----------
/** Retângulo que a câmera enquadra: roça com `count` lotes (inclui o "à venda"), casa, casinha, cerca e cercado. */
export function sceneBounds(count: number) {
  const xs: number[] = [-345, -115, 190, 312, FENCE[0][0], FENCE[1][0], ...PEN.map((p) => p[0])]
  const ys: number[] = [-235, 15, -210, -85, FENCE[0][1], FENCE[1][1], ...PEN.map((p) => p[1] + 6)]
  for (let i = 0; i < Math.max(1, Math.min(count, MAX_FIELD_PLOTS)); i++) {
    const p = plotPos(i)
    xs.push(p.x - TILE_W / 2, p.x + TILE_W / 2)
    ys.push(p.y - TILE_H / 2 - 70, p.y + TILE_H / 2 + 18) // plantas altas acima do losango; espessura da terra (PLOT_SIDE ≈ 16,5) abaixo
  }
  const pad = 24
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }
}
