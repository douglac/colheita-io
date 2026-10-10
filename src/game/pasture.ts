// Onde cada bicho pode ser solto (arrastar e soltar na própria fazenda). Regra única, usada pela cena
// (marcador verde/vermelho) e pelo servidor (que não confia no cliente). Coordenadas do mundo (layout.ts).
import { ANIMAL_AREAS, DOG_AREA, FENCE, FIELD, distSeg, farmBlocked, inPoly, sceneBounds, MAX_FIELD_PLOTS, TREES, type Area } from '@/scene/layout'

/** Espécies do pasto (decoração viva: ninguém abate nem colhe carne). As 5 últimas vêm da arte do lote J. */
export const HERD_KINDS = ['cow', 'sheep', 'pig', 'chicken', 'donkey', 'peacock', 'duck', 'rabbit', 'goat', 'bee'] as const
export type HerdKind = (typeof HERD_KINDS)[number]
export type AnimalKind = HerdKind | 'dog'
/** Bicho da fazenda: a espécie (1º) ou a espécie + número da cópia ("cow2", "chicken3"…); o cachorro é "dog". */
export type AnimalId = 'dog' | HerdKind | `${HerdKind}${number}`
/** Até quantas cópias de uma espécie (o número vai de 2 a MAX_COPIES no id). */
export const MAX_COPIES = 9
export type Herd = Partial<Record<HerdKind, number>>
/** Rebanho de sempre (todo fazendeiro começa com ele): vaca, ovelha, porco e duas galinhas. */
export const DEFAULT_HERD: Herd = { cow: 1, sheep: 1, pig: 1, chicken: 2 }

const ID_RE = new RegExp(`^(${HERD_KINDS.join('|')})([2-9])?$`)
export const isAnimalId = (v: unknown): v is AnimalId => v === 'dog' || (typeof v === 'string' && ID_RE.test(v))
export const kindOf = (id: AnimalId): AnimalKind => (id === 'dog' ? 'dog' : (id.replace(/\d+$/, '') as HerdKind))
/** Número da cópia (1 = o primeiro da espécie). */
export const copyOf = (id: AnimalId) => Number(/\d+$/.exec(id)?.[0] ?? 1)

/** Ids do rebanho (na ordem das espécies; cópias limitadas a MAX_COPIES). */
export function herdIds(herd: Herd | null | undefined): AnimalId[] {
  const h = herd ?? DEFAULT_HERD
  const out: AnimalId[] = []
  for (const k of HERD_KINDS) {
    const n = Math.max(0, Math.min(MAX_COPIES, Math.floor(h[k] ?? 0)))
    for (let i = 1; i <= n; i++) out.push(i === 1 ? k : (`${k}${i}` as AnimalId))
  }
  return out
}

/** Todos os ids possíveis (rebanho cheio + cachorro), para conferências. */
export const ANIMAL_IDS: AnimalId[] = [...herdIds(Object.fromEntries(HERD_KINDS.map((k) => [k, MAX_COPIES]))), 'dog']

export type Spot = { x: number; y: number }
export type Spots = Partial<Record<AnimalId, Spot>>
type Box = { x0: number; y0: number; x1: number; y1: number }


const union = (boxes: Box[]): Box => ({
  x0: Math.min(...boxes.map((b) => b.x0)), y0: Math.min(...boxes.map((b) => b.y0)),
  x1: Math.max(...boxes.map((b) => b.x1)), y1: Math.max(...boxes.map((b) => b.y1)),
})

/** Área da fazenda: o enquadramento da roça cheia mais os pastos de sempre. Fora disso, não solta. */
export const YARD: Box = union([sceneBounds(MAX_FIELD_PLOTS), ...Object.values(ANIMAL_AREAS), DOG_AREA])

// Desenho da casa e da casinha (telhado incluso): o bicho ficaria "em cima" deles na tela.
// Posições/tamanhos de drawHouse() e setDog() em FarmScene.ts.
export const HOUSE_ART: Box = { x0: -340, y0: -227, x1: -120, y1: 8 }
export const DOGHOUSE_ART: Box = { x0: 195, y0: -208, x1: 305, y1: -88 }
// Copa e tronco das árvores: o bicho solto ali ficaria escondido atrás delas (ordem pelo pé, depth-order.ts).
export const TREE_ART: Box[] = TREES.map(({ x, y, w }) => ({ x0: x - w * 0.42, y0: y - (w * 284) / 256, x1: x + w * 0.42, y1: y }))
const inBox = (x: number, y: number, b: Box, m = 0) => x >= b.x0 - m && x <= b.x1 + m && y >= b.y0 - m && y <= b.y1 + m

/** Cachorro guarda a casinha: só pode ser solto até esta distância dela (distância iso, y vale dobrado). */
export const DOG_LEASH = { x: 250, y: -110, r: 240 }

/** Tamanho dos pés de cada bicho (raio em x; em y é metade, por ser chão isométrico). */
export const FOOT: Record<AnimalKind, number> = {
  cow: 22, sheep: 18, pig: 16, chicken: 10, dog: 14, donkey: 20, peacock: 12, duck: 10, rabbit: 9, goat: 16, bee: 14,
}
/** Meia-largura/altura da área de passeio em volta do lugar onde foi solto. */
const ROAM: Record<AnimalKind, [number, number]> = {
  cow: [110, 60], sheep: [95, 55], pig: [85, 40], chicken: [70, 35], dog: [60, 40],
  donkey: [100, 55], peacock: [80, 40], duck: [70, 35], rabbit: [60, 30], goat: [95, 55], bee: [0, 0],
}

/** Chão onde bicho não fica: roça, casa, casinha, cerca (farmBlocked), o desenho da casa/casinha e fora da fazenda. */
export const pastureBlocked = (x: number, y: number) =>
  farmBlocked(x, y) || inBox(x, y, HOUSE_ART, 8) || inBox(x, y, DOGHOUSE_ART, 8) || TREE_ART.some((b) => inBox(x, y, b, 6)) || !inBox(x, y, YARD)

/**
 * pastureBlocked com memória, para o passeio dos bichos (chamado milhares de vezes por segundo na fazenda cheia):
 * a geometria é fixa, então cada ponto de uma grade de `FAST_STEP` unidades é calculado uma vez só. Arredonda o
 * ponto para a grade (≤ 1 unidade); a regra exata (soltar o bicho, servidor) continua sendo pastureBlocked.
 */
const FAST_STEP = 2
const FAST_W = Math.ceil((YARD.x1 - YARD.x0) / FAST_STEP) + 1, FAST_H = Math.ceil((YARD.y1 - YARD.y0) / FAST_STEP) + 1
let fastMap: Int8Array | null = null
export function pastureBlockedFast(x: number, y: number): boolean {
  if (!(x >= YARD.x0 && x <= YARD.x1 && y >= YARD.y0 && y <= YARD.y1)) return true
  const ix = Math.round((x - YARD.x0) / FAST_STEP), iy = Math.round((y - YARD.y0) / FAST_STEP)
  const i = iy * FAST_W + ix
  fastMap ??= new Int8Array(FAST_W * FAST_H)
  let v = fastMap[i]
  if (!v) { v = pastureBlocked(YARD.x0 + ix * FAST_STEP, YARD.y0 + iy * FAST_STEP) ? 2 : 1; fastMap[i] = v }
  return v === 2
}

export type DropCheck = { ok: true } | { ok: false; reason: string }

/** Dá para soltar o bicho com os pés em (x, y)? Confere o ponto e a "pegada" em volta dele. */
export function dropCheck(id: AnimalId, x: number, y: number): DropCheck {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, reason: 'Lugar inválido' }
  const r = FOOT[kindOf(id)]
  const pts: [number, number][] = [[x, y]]
  for (let i = 0; i < 8; i++) pts.push([x + Math.cos((i * Math.PI) / 4) * r, y + Math.sin((i * Math.PI) / 4) * (r / 2)])
  if (pts.some(([px, py]) => !inBox(px, py, YARD))) return { ok: false, reason: 'Fora da fazenda não dá' }
  if (id === 'dog' && Math.hypot(x - DOG_LEASH.x, (y - DOG_LEASH.y) * 2) > DOG_LEASH.r) return { ok: false, reason: 'O cachorro fica perto da casinha' }
  if (!pts.some(([px, py]) => pastureBlocked(px, py))) return { ok: true }
  // Motivo legível (só para a mensagem; quem decide é pastureBlocked).
  const hit = (test: (px: number, py: number) => boolean) => pts.some(([px, py]) => test(px, py))
  if (hit((px, py) => inBox(px, py, HOUSE_ART, 8))) return { ok: false, reason: 'Em cima da casa não dá' }
  if (hit((px, py) => inBox(px, py, DOGHOUSE_ART, 8))) return { ok: false, reason: 'Em cima da casinha não dá' }
  if (hit((px, py) => TREE_ART.some((b) => inBox(px, py, b, 6)))) return { ok: false, reason: 'Na árvore não dá' }
  if (hit((px, py) => distSeg(px, py, FENCE[0], FENCE[1]) < 18)) return { ok: false, reason: 'Em cima da cerca não dá' }
  if (hit((px, py) => inPoly(px, py, FIELD))) return { ok: false, reason: 'Na terra da roça não dá' }
  return { ok: false, reason: 'Aqui não dá' }
}

/** Área de passeio em volta do lugar novo (cortada na área da fazenda). */
export function roamArea(id: AnimalId, x: number, y: number): Box {
  const [hw, hh] = ROAM[kindOf(id)]
  return { x0: Math.max(YARD.x0, x - hw), y0: Math.max(YARD.y0, y - hh), x1: Math.min(YARD.x1, x + hw), y1: Math.min(YARD.y1, y + hh) }
}

/** Área de passeio padrão (bicho que nunca foi mudado de lugar). */
export const defaultArea = (id: AnimalId): Area => (id === 'dog' ? DOG_AREA : ANIMAL_AREAS[kindOf(id) as HerdKind])
