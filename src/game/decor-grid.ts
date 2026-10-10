// Grade da decoração solta (opção B estruturada). Regra única, usada pela cena (grade, verde/vermelho)
// e pelo servidor (que não confia no cliente). Coordenadas do mundo em layout.ts.
//
// Célula = meio lote (66 × 33): cada lote da roça cobre 2 × 2 células, então a grade encaixa na roça.
// Tipos de célula:
// - blocked: roça, casa, casinha, cerca, árvores, cercado (e adereços) e o enfeite fixo da série;
// - corridor: 1 célula em volta da roça, do cercado, da casa, da casinha e da cerca (fica livre: passagem);
// - zone: faixas de decoração (em volta da roça, do cercado e da casa, e na borda da fazenda);
// - open: gramado do meio e as áreas de passeio dos bichos soltos (pato, porco, galinha, pavão, coelho), que ficam
//   livres para eles (Evolução 12: enfeite ali escondia e embolava os patos);
// - out: fora da fazenda.
// Enfeite só em `zone`; caminho em `zone`, `corridor` ou `open` (nunca em `blocked`).
// Caminho anda numa grade do tamanho do lote (PATH_STEP = 2 células finas): cada célula de caminho
// cobre 2 × 2 células, com a de cima em (u, v) par. É a peça de 256 px do lote M na escala dos lotes.
import { ANIMAL_AREAS, DOGHOUSE, FENCE, FIELD, HOUSE, MAX_FIELD_PLOTS, PEN, PROPS, distSeg, inPoly, plotPos } from '@/scene/layout'
import { TILE_H, TILE_W } from '@/scene/iso'
import { DOGHOUSE_ART, FOOT, HOUSE_ART, isAnimalId, kindOf, TREE_ART, YARD, type Spots } from './pasture'
import { DECOR } from './config'
import { isPath, ORNAMENT_BY_ID } from './decor'

export const CELL_W = TILE_W / 2
export const CELL_H = TILE_H / 2
const O = plotPos(0)

/** Centro da célula (u, v) no mundo. A célula (u, v) ocupa, em coordenadas de lote, [u/2 − ½, u/2] × [v/2 − ½, v/2]. */
export function cellCenter(u: number, v: number) {
  const c = u / 2 - 0.25, r = v / 2 - 0.25
  return { x: O.x + ((c - r) * TILE_W) / 2, y: O.y + ((c + r) * TILE_H) / 2 }
}

/** Célula sob o ponto (x, y) do mundo. */
export function cellAt(x: number, y: number) {
  const dx = (x - O.x) / (TILE_W / 2), dy = (y - O.y) / (TILE_H / 2)
  const c = (dx + dy) / 2, r = (dy - dx) / 2
  return { u: Math.floor(2 * c) + 1, v: Math.floor(2 * r) + 1 }
}

/** Centro da pegada w × h com a célula de cima em (u, v) (âncora do desenho). */
export function footCenter(u: number, v: number, w: number, h: number) {
  const a = cellCenter(u, v), b = cellCenter(u + w - 1, v + h - 1)
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** Losango da célula (4 cantos), para desenhar a grade. */
export function cellDiamond(u: number, v: number): number[] {
  const { x, y } = cellCenter(u, v)
  return [x, y - CELL_H / 2, x + CELL_W / 2, y, x, y + CELL_H / 2, x - CELL_W / 2, y]
}

// ---------- obstáculos ----------
type Box = { x0: number; y0: number; x1: number; y1: number }
const inBox = (x: number, y: number, b: Box, m = 0) => x >= b.x0 - m && x <= b.x1 + m && y >= b.y0 - m && y <= b.y1 + m

/**
 * Enfeite fixo da série (slot "enfeite": carrinho, arco-íris, boneco de neve): sempre no mesmo lugar,
 * atrás da roça, entre a casa e a casinha. Pegada 2 × 2 células com a de cima em (u, v).
 */
export const FIXED_ORNAMENT = { u: -4, v: -3, w: 2, h: 2 }

type Tag = 'field' | 'house' | 'doghouse' | 'fence' | 'pen' | 'prop' | 'tree' | 'fixed'
/** Precisam de corredor em volta (passagem livre). */
const NEEDS_CORRIDOR = new Set<Tag>(['field', 'house', 'doghouse', 'fence', 'pen'])
/** Ganham faixa de decoração em volta. */
const HAS_ZONE = new Set<Tag>(['field', 'house', 'fence', 'pen'])

function obstacleAt(x: number, y: number): Tag | null {
  if (inPoly(x, y, FIELD)) return 'field'
  // Casa, casinha e árvores ficam em camadas abaixo dos enfeites: o desenho inteiro delas (não só o pé)
  // é proibido, senão um enfeite atrás apareceria por cima do telhado ou da copa (a mesma regra dos bichos).
  if (inPoly(x, y, HOUSE) || inBox(x, y, HOUSE_ART, 4)) return 'house'
  if (inPoly(x, y, DOGHOUSE) || inBox(x, y, DOGHOUSE_ART, 4)) return 'doghouse'
  if (distSeg(x, y, FENCE[0], FENCE[1]) < 12) return 'fence'
  // Cercado dos bichos (frente D): dentro dele é pasto, e a cerca em volta também ocupa o chão.
  if (inPoly(x, y, PEN) || PEN.some((p, i) => distSeg(x, y, p, PEN[(i + 1) % PEN.length]) < 12)) return 'pen'
  if (PROPS.some((p) => Math.hypot(x - p.x, (y - p.y) * 2) < p.w * 0.6)) return 'prop'
  if (TREE_ART.some((b) => inBox(x, y, b, 4))) return 'tree'
  return null
}

export type CellKind = 'out' | 'blocked' | 'corridor' | 'zone' | 'open'
export type Grid = { u0: number; v0: number; u1: number; v1: number; kind: (u: number, v: number) => CellKind; cells: { u: number; v: number; kind: CellKind }[] }

/** Distância (em células) da faixa de decoração em volta da roça, da casa e da cerca, e da borda da fazenda. */
const ZONE_DEPTH = 3
const BORDER_DEPTH = 2

/**
 * Bichos soltos fora do cercado: a célula com o centro na área padrão deles (ANIMAL_AREAS) fica `open` (sem
 * enfeite). O cercado já é `blocked`; a colmeia não anda. Na borda da área, quem protege o bicho é a "sombra"
 * do enfeite (ornamentShadow): ele não passeia atrás do desenho.
 */
export const OPEN_KINDS = ['duck', 'pig', 'chicken', 'peacock', 'rabbit'] as const
/**
 * A célula (u, v) cai na área padrão de algum bicho solto, ou um enfeite nela (logo na frente da área)
 * esconderia o meio dela? A "sombra" do desenho (ornamentShadow) de um enfeite típico cobriria mais de
 * `SHADOW_MAX` da área, com a célula na metade do meio da área em x.
 */
export function inAnimalArea(u: number, v: number): boolean {
  const { x, y } = cellCenter(u, v)
  return OPEN_KINDS.some((k) => {
    const a = ANIMAL_AREAS[k]
    if (inBox(x, y, a)) return true
    const s = shadowBox(x, y + CELL_H / 2, TYPICAL.wide, TYPICAL.tall)
    const ov = Math.max(0, Math.min(a.x1, s.x1) - Math.max(a.x0, s.x0)) * Math.max(0, Math.min(a.y1, s.y1) - Math.max(a.y0, s.y0))
    // Só a metade do meio da área (em x) fica livre de sombra: nas pontas o bicho desvia (ornamentBlocker).
    return ov > SHADOW_MAX * (a.x1 - a.x0) * (a.y1 - a.y0) && Math.abs(x - (a.x0 + a.x1) / 2) < (a.x1 - a.x0) * CORE
  })
}
/** Enfeite "típico" de 1 célula (placa, lampião, espantalho) para a conta da sombra sobre a área. */
const TYPICAL = { wide: 83, tall: 113 }
const SHADOW_MAX = 0.1
const CORE = 0.25

let grid: Grid | null = null

/** Mapa das células (calculado uma vez: a geometria da fazenda é fixa). */
export function decorGrid(): Grid {
  if (grid) return grid
  // Cantos do YARD em células: a grade cobre a caixa inteira.
  const corners = [cellAt(YARD.x0, YARD.y0), cellAt(YARD.x1, YARD.y0), cellAt(YARD.x0, YARD.y1), cellAt(YARD.x1, YARD.y1)]
  const u0 = Math.min(...corners.map((c) => c.u)) - 1, u1 = Math.max(...corners.map((c) => c.u)) + 1
  const v0 = Math.min(...corners.map((c) => c.v)) - 1, v1 = Math.max(...corners.map((c) => c.v)) + 1
  const W = u1 - u0 + 1, H = v1 - v0 + 1
  const idx = (u: number, v: number) => (v - v0) * W + (u - u0)
  const tags: (Tag | 'out' | null)[] = new Array(W * H).fill(null)
  for (let v = v0; v <= v1; v++) {
    for (let u = u0; u <= u1; u++) {
      const { x, y } = cellCenter(u, v)
      // Pontos de prova: centro e os 4 cantos puxados para dentro (borda exata não conta).
      const pts: [number, number][] = [[x, y], [x, y - CELL_H * 0.35], [x + CELL_W * 0.35, y], [x, y + CELL_H * 0.35], [x - CELL_W * 0.35, y]]
      if (pts.some(([px, py]) => !inBox(px, py, YARD))) { tags[idx(u, v)] = 'out'; continue }
      const f = FIXED_ORNAMENT
      if (u >= f.u && u < f.u + f.w && v >= f.v && v < f.v + f.h) { tags[idx(u, v)] = 'fixed'; continue }
      for (const [px, py] of pts) {
        const t = obstacleAt(px, py)
        if (t) { tags[idx(u, v)] = t; break }
      }
    }
  }
  const tagAt = (u: number, v: number) => (u < u0 || u > u1 || v < v0 || v > v1 ? 'out' : tags[idx(u, v)])
  /** Menor distância (Chebyshev, em células) até uma célula que passa no teste, até `max`. */
  const near = (u: number, v: number, max: number, test: (t: Tag | 'out' | null) => boolean) => {
    for (let d = 1; d <= max; d++) {
      for (let dv = -d; dv <= d; dv++) {
        for (let du = -d; du <= d; du++) {
          if (Math.max(Math.abs(du), Math.abs(dv)) === d && test(tagAt(u + du, v + dv))) return d
        }
      }
    }
    return Infinity
  }
  const kinds: CellKind[] = new Array(W * H)
  const cells: Grid['cells'] = []
  for (let v = v0; v <= v1; v++) {
    for (let u = u0; u <= u1; u++) {
      const t = tags[idx(u, v)]
      let k: CellKind
      if (t === 'out') k = 'out'
      else if (t) k = 'blocked'
      else if (near(u, v, 1, (x) => x != null && x !== 'out' && NEEDS_CORRIDOR.has(x)) === 1) k = 'corridor'
      else if (inAnimalArea(u, v)) k = 'open'
      else if (near(u, v, ZONE_DEPTH, (x) => x != null && x !== 'out' && HAS_ZONE.has(x)) <= ZONE_DEPTH) k = 'zone'
      else if (near(u, v, BORDER_DEPTH, (x) => x === 'out') <= BORDER_DEPTH) k = 'zone'
      else k = 'open'
      kinds[idx(u, v)] = k
      if (k !== 'out') cells.push({ u, v, kind: k })
    }
  }
  grid = { u0, v0, u1, v1, cells, kind: (u, v) => (u < u0 || u > u1 || v < v0 || v > v1 ? 'out' : kinds[idx(u, v)]) }
  return grid
}

// ---------- colocação ----------

export type Placed = { id: number; itemId: string; u: number; v: number }

/** Passo da grade do caminho (em células finas): o caminho anda de lote em lote. */
export const PATH_STEP = 2

/** Célula de caminho (par) sob a célula fina (u, v). */
export const pathCellOf = (u: number, v: number) => ({ u: Math.floor(u / PATH_STEP) * PATH_STEP, v: Math.floor(v / PATH_STEP) * PATH_STEP })

/** Células da pegada do item com a célula de cima em (u, v). Caminho ocupa 2 × 2 (um lote). */
export function footprint(itemId: string, u: number, v: number): [number, number][] {
  const o = ORNAMENT_BY_ID[itemId]
  const path = isPath(itemId)
  const w = path ? PATH_STEP : o?.w ?? 1, h = path ? PATH_STEP : o?.h ?? 1
  const out: [number, number][] = []
  for (let dv = 0; dv < h; dv++) for (let du = 0; du < w; du++) out.push([u + du, v + dv])
  return out
}

const key = (u: number, v: number) => `${u},${v}`

/** Células ocupadas por enfeites (sem caminhos), para bichos e colisão. */
export function ornamentCells(placed: Placed[], skipId?: number): Set<string> {
  const s = new Set<string>()
  for (const p of placed) if (p.id !== skipId && !isPath(p.itemId)) for (const [u, v] of footprint(p.itemId, p.u, p.v)) s.add(key(u, v))
  return s
}
function pathCells(placed: Placed[], skipId?: number): Set<string> {
  const s = new Set<string>()
  for (const p of placed) if (p.id !== skipId && isPath(p.itemId)) for (const [u, v] of footprint(p.itemId, p.u, p.v)) s.add(key(u, v))
  return s
}

/** Células sob os pés de um bicho solto em (x, y) (o mesmo círculo de dropCheck). */
function animalCells(id: string, x: number, y: number): string[] {
  const r = isAnimalId(id) ? FOOT[kindOf(id)] : 22
  const pts: [number, number][] = [[x, y]]
  for (let i = 0; i < 8; i++) pts.push([x + Math.cos((i * Math.PI) / 4) * r, y + Math.sin((i * Math.PI) / 4) * (r / 2)])
  return pts.map(([px, py]) => { const c = cellAt(px, py); return key(c.u, c.v) })
}

export type PlaceCheck = { ok: true } | { ok: false; reason: string }

/**
 * Dá para pôr o item com a célula de cima em (u, v)? `placed` = o que já está na fazenda;
 * `skipId` = o próprio item quando é um "mover"; `animals` = onde o dono deixou os bichos.
 */
export function placeCheck(itemId: string, u: number, v: number, placed: Placed[], animals: Spots = {}, skipId?: number): PlaceCheck {
  if (!Number.isInteger(u) || !Number.isInteger(v)) return { ok: false, reason: 'Lugar inválido' }
  const path = isPath(itemId)
  if (!path && !ORNAMENT_BY_ID[itemId]) return { ok: false, reason: 'Enfeite desconhecido' }
  if (path && (u % PATH_STEP !== 0 || v % PATH_STEP !== 0)) return { ok: false, reason: 'Lugar inválido' }
  const g = decorGrid()
  const cells = footprint(itemId, u, v)
  for (const [cu, cv] of cells) {
    const k = g.kind(cu, cv)
    if (k === 'out') return { ok: false, reason: 'Fora da fazenda não dá' }
    if (k === 'blocked') return { ok: false, reason: 'Aqui já tem coisa da fazenda' }
    if (!path && k === 'corridor') return { ok: false, reason: 'Deixe a passagem livre em volta' }
    if (!path && k === 'open') return { ok: false, reason: 'Enfeite só nas faixas de decoração' }
  }
  if (!path && coversField(itemId, u, v)) return { ok: false, reason: 'Aqui o enfeite cobriria as plantas da roça' }
  const orn = ornamentCells(placed, skipId), paths = pathCells(placed, skipId)
  for (const [cu, cv] of cells) {
    if (orn.has(key(cu, cv))) return { ok: false, reason: 'Já tem um enfeite aqui' }
    if (paths.has(key(cu, cv))) return { ok: false, reason: path ? 'Já tem caminho aqui' : 'Em cima do caminho não dá' }
  }
  if (!path) {
    const mine = new Set(cells.map(([cu, cv]) => key(cu, cv)))
    for (const [id, s] of Object.entries(animals)) {
      if (s && animalCells(id, s.x, s.y).some((c) => mine.has(c))) return { ok: false, reason: 'Tem um bicho aqui' }
    }
  }
  return { ok: true }
}

/** O bicho solto em (x, y) pisaria num enfeite? (o servidor confere no move_animal; a cena, no marcador). */
export function animalOnOrnament(id: string, x: number, y: number, placed: Placed[]): boolean {
  const orn = ornamentCells(placed)
  return orn.size > 0 && animalCells(id, x, y).some((c) => orn.has(c))
}

/**
 * Pé do enfeite no mundo: centro horizontal da pegada, na ponta de baixo do losango projetado
 * (a âncora do manifesto do lote M). É também a profundidade (zIndex), como o pé dos bichos.
 */
export function ornamentBase(itemId: string, u: number, v: number) {
  const o = ORNAMENT_BY_ID[itemId]
  const w = o?.w ?? 1, h = o?.h ?? 1
  const c = footCenter(u, v, w, h)
  return { x: c.x, y: c.y + ((w + h) * CELL_H) / 4 }
}

/**
 * "Sombra" do desenho do enfeite: o chão logo atrás dele (pé com y menor, dentro da largura do desenho), onde
 * um bicho fica com mais da metade do corpo coberto pelo enfeite (desenhado depois, por estar na frente).
 */
export function ornamentShadow(itemId: string, u: number, v: number): { x0: number; x1: number; y0: number; y1: number } | null {
  const o = ORNAMENT_BY_ID[itemId]
  if (!o) return null
  const b = ornamentBase(itemId, u, v)
  return shadowBox(b.x, b.y, o.wide, o.tall)
}
function shadowBox(x: number, y: number, wide: number, tall: number) {
  return { x0: x - wide * 0.36, x1: x + wide * 0.36, y0: y - tall * 0.9, y1: y }
}

/**
 * O desenho do enfeite, atrás de um lote (pé acima do pé do lote), cruzaria as plantas dele? Na Evolução 12 os enfeites
 * ficavam numa camada acima da roça (a macieira à direita do lote 14 cobria a planta). Desde a Evolução 31 a ordem
 * pelo pé já põe a planta na frente; a regra continua para o enfeite não ficar escondido atrás das plantas.
 * Caixas no mundo: o miolo do desenho do enfeite e a terra + planta do lote (a mesma conta do overlap.mjs).
 */
export function coversField(itemId: string, u: number, v: number): boolean {
  const o = ORNAMENT_BY_ID[itemId]
  if (!o) return false
  const b = ornamentBase(itemId, u, v)
  const hw = o.wide * 0.32, top = b.y - o.tall * 0.9
  for (let i = 0; i < MAX_FIELD_PLOTS; i++) {
    const p = plotPos(i)
    if (b.y >= p.y + TILE_H / 2) continue // enfeite na frente do lote: desenhado depois, certo
    const ox = Math.min(b.x + hw, p.x + 50) - Math.max(b.x - hw, p.x - 50), oy = Math.min(b.y, p.y + 20) - Math.max(top, p.y - 55)
    if (ox > 4 && oy > 4 && ox * oy > 60) return true
  }
  return false
}

/** Teste rápido de ponto para os bichos que passeiam: desviam da pegada dos enfeites e não ficam escondidos atrás deles. */
export function ornamentBlocker(placed: Placed[]): (x: number, y: number) => boolean {
  const orn = ornamentCells(placed)
  if (!orn.size) return () => false
  const shadows = placed.filter((p) => !isPath(p.itemId)).map((p) => ornamentShadow(p.itemId, p.u, p.v)).filter((s) => s != null)
  return (x, y) => {
    for (const s of shadows) if (x > s.x0 && x < s.x1 && y > s.y0 && y < s.y1) return true
    const c = cellAt(x, y)
    return orn.has(key(c.u, c.v))
  }
}

/** Limites: enfeites por nível (DECOR.maxOrnaments) e células de caminho. */
export function limitCheck(itemId: string, placed: Placed[], level: number): PlaceCheck {
  if (isPath(itemId)) {
    const n = placed.filter((p) => isPath(p.itemId)).length
    return n < DECOR.maxPathCells ? { ok: true } : { ok: false, reason: `Limite de ${DECOR.maxPathCells} células de caminho` }
  }
  const n = placed.filter((p) => !isPath(p.itemId)).length
  const max = DECOR.maxOrnaments(level)
  return n < max ? { ok: true } : { ok: false, reason: `No nível ${level} cabem ${max} enfeites na fazenda${max < 40 ? ': suba de nível para pôr mais' : ''}` }
}

// ---------- caminho: autoconexão ----------

/** Vizinhos do caminho (bits), um lote para cada lado: 1 = cima-esquerda, 2 = cima-direita, 4 = baixo-direita, 8 = baixo-esquerda. */
export const PATH_DIRS: [number, number, number][] = [[1, -PATH_STEP, 0], [2, 0, -PATH_STEP], [4, PATH_STEP, 0], [8, 0, PATH_STEP]]

export type PathShape = 'dot' | 'end' | 'straight' | 'curve' | 'tee' | 'cross'

/** Máscara de vizinhos do mesmo caminho em volta de (u, v). */
export function pathMask(u: number, v: number, has: (u: number, v: number) => boolean): number {
  let m = 0
  for (const [bit, du, dv] of PATH_DIRS) if (has(u + du, v + dv)) m |= bit
  return m
}

/** Forma da peça de caminho pela máscara: reta, curva, T, cruz, ponta ou solta. */
export function pathShape(mask: number): PathShape {
  const n = [1, 2, 4, 8].filter((b) => mask & b).length
  if (n === 0) return 'dot'
  if (n === 1) return 'end'
  if (n === 2) return mask === 5 || mask === 10 ? 'straight' : 'curve'
  if (n === 3) return 'tee'
  return 'cross'
}

/** Formas de todas as células de caminho (cada material conecta só com ele mesmo). */
export function pathTiles(placed: Placed[]): { id: number; itemId: string; u: number; v: number; mask: number; shape: PathShape }[] {
  const at = new Map<string, string>()
  for (const p of placed) if (isPath(p.itemId)) at.set(key(p.u, p.v), p.itemId)
  return placed.filter((p) => isPath(p.itemId)).map((p) => {
    const mask = pathMask(p.u, p.v, (u, v) => at.get(key(u, v)) === p.itemId)
    return { ...p, mask, shape: pathShape(mask) }
  })
}
