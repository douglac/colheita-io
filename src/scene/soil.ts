// Terra da roça num bloco só, sem degrau e sem "deck" (geometria em field.ts). Arte do lote K
// (public/art/MANIFEST.md): cada lote é um MONTINHO baixo (soil_plot_<variante>[_NN],
// 256×128, âncora (128,64)), todos na mesma altura; o sulco escuro entre montinhos é a divisa; o
// friso baixo (soil_plot_rim_*, ~5 px) só nos lados de fora do conjunto, com cantos nas pontas.
// Lote vazio ganha covas (soil_plot_holes); lote à venda é o montinho verde não arado (soil_plot_cover).
// A sombra sob a cultura (soil_plot_shadow) fica com a planta (FarmScene). Sem a arte K, a reserva é o
// topo recortado dos tiles antigos soil_*.png e a lateral só no contorno (nunca as duas artes juntas).
// Sem máscaras: tudo sprite, mesmo lote de desenho.
import { Container, Sprite, Texture } from 'pixi.js'
import type { ArtBook } from './art'
import { PLOT_SIDE, SHADOW_OFFSET } from './depth'
import { fieldEdges, plotCorners, plotRims, type Sides } from './field'
import { TILE_W } from './iso'
import { plotCell, plotPos } from './layout'

/** Variante do topo: arado (vazio), úmido (plantado) e seco (murcho). */
export type SoilVariant = 'plowed' | 'moist' | 'dry'
/** Altura do friso do contorno quando o lote é montinho (a roça fica quase rente à grama). */
export const MOUND_RIM = 5
const OLD_TILE: Record<SoilVariant, string> = { plowed: 'soil_empty', moist: 'soil_planted', dry: 'soil_dry' }

const ART_W = 256 // largura de todas as peças de terra na arte (lote K e tiles antigos)
const K = TILE_W / ART_W
/**
 * Onde o centro do losango do lote fica dentro de cada peça (px da arte). Tiles antigos: (128, 64).
 * As peças do lote K seguem a mesma moldura do tile (conferir no manifesto quando chegar).
 */
const PIECE_ANCHOR = { x: 128, y: 64 }
// Tiles antigos: o topo tem uma moldura escura (~6 px) que marcava cada lote; ampliar um pouco em volta
// do centro empurra a moldura para fora do recorte, mantendo os torrões e sulcos da arte.
const OLD_TOP_ZOOM = 1.1

const cache = new Map<string, Texture>()

/** Recorte de uma peça antiga num canvas: `clip` em px da arte (256×160), com zoom em volta do centro do losango. */
function cut(art: Texture, key: string, clip: [number, number][], zoom = 1, m?: [number, number, number, number, number, number]): Texture {
  const hit = cache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = ART_W
  c.height = 160
  const g = c.getContext('2d')!
  g.beginPath()
  clip.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
  g.closePath()
  g.clip()
  if (m) g.setTransform(...m)
  g.translate(128, 64)
  g.scale(zoom, zoom)
  g.drawImage(art.source.resource as CanvasImageSource, -128, -64)
  const t = Texture.from(c)
  cache.set(key, t)
  return t
}

const E = 0.8 // o recorte passa um tiquinho da aresta: sem fresta entre vizinhos
/** Topo do lote: arte do lote K, ou o losango do tile antigo (sem a lateral). */
function legacyTop(art: ArtBook, v: SoilVariant): Texture | null {
  const old = art[OLD_TILE[v]]
  if (!old) return null
  return cut(old, `top:${v}`, [[128, -E], [256 + E, 64], [128, 128 + E], [-E, 64]], OLD_TOP_ZOOM)
}

/** Peça da borda: arte do lote K, ou a face lateral do tile antigo de terra vazia (mesma em todos os lotes). */
function edgeTexture(art: ArtBook, side: 'sw' | 'se'): Texture | null {
  const old = art.soil_empty
  if (!old) return null
  // Cada face antiga tem contorno vertical nas duas pontas: lado a lado, isso marcava cada lote. Usa só
  // o miolo da face (x 6..122 na sw, 134..250 na se), esticado ao longo da aresta (a inclinação 1:2 fica).
  const a = 116 / 128
  return side === 'sw'
    ? cut(old, 'edge:sw', [[-E, 64], [128 + E, 128], [128 + E, 160], [-E, 96]], 1, [1 / a, -(a - 1) / (2 * a), 0, 1, -6 / a, (3 * (a - 1)) / a - 3])
    : cut(old, 'edge:se', [[128 - E, 128], [256 + E, 64], [256 + E, 96], [128 - E, 160]], 1,
      [1 / a, 0.5 - 1 / (2 * a), 0, 1, (128 * a - 134) / a, (134 - 128 * a) / (2 * a)])
}

/** Variante estável por lote (manifesto: (i·11 + j·7 + i·j·3) mod quantidade; i = coluna, j = fileira). */
function plotTexture(art: ArtBook, base: string, idx: number): Texture | null {
  const list = [art[base], art[`${base}_02`], art[`${base}_03`], art[`${base}_04`]].filter((t): t is Texture => !!t)
  if (!list.length) return null
  const { col: i, row: j } = plotCell(idx)
  return list[(i * 11 + j * 7 + i * j * 3) % list.length]
}

const pieceSprite = (t: Texture, x: number, y: number) => {
  const s = new Sprite(t)
  s.anchor.set(PIECE_ANCHOR.x / t.width, PIECE_ANCHOR.y / t.height)
  s.scale.set(K)
  s.position.set(x, y)
  return s
}

export class SoilField extends Container {
  private shadow = new Sprite()
  private rims = new Container() // friso dos montinhos ou lateral antiga: só no contorno
  private tops = new Container() // um montinho (ou topo) por lote, de trás para a frente
  private holes = new Container() // covas dos lotes vazios
  private topNodes = new Map<number, Sprite>()
  private holeNodes = new Map<number, Sprite>()
  private shapeKey = ''
  /** Lote = montinho (arte do lote K): sem lateral, só friso baixo. */
  mound = false

  constructor() {
    super()
    this.eventMode = 'none'
    this.shadow.alpha = 0.3
    this.tops.sortableChildren = true
    this.addChild(this.shadow, this.rims, this.tops, this.holes)
  }

  /**
   * `variants`: lotes comprados e a terra de cada um; `forSale`: lotes à venda (montinho verde, se houver
   * a arte; senão gramado). Devolve as laterais de cada lote comprado (área de toque).
   */
  update(variants: Map<number, SoilVariant>, art: ArtBook, fallback: number, forSale: number[] = []): Map<number, Sides> {
    this.mound = !!art.soil_plot_plowed
    const cover = this.mound && !!art.soil_plot_cover
    const ground = new Map<number, Texture | null>()
    for (const [idx, v] of variants) ground.set(idx, this.mound ? plotTexture(art, `soil_plot_${v}`, idx) : legacyTop(art, v))
    if (cover) for (const idx of forSale) ground.set(idx, plotTexture(art, 'soil_plot_cover', idx))
    for (const [idx, t] of ground) {
      let sp = this.topNodes.get(idx)
      if (!sp) {
        sp = new Sprite()
        const p = plotPos(idx), c = plotCell(idx)
        sp.position.set(p.x, p.y)
        sp.zIndex = c.col + c.row // de trás para a frente (o montinho da frente cobre a base do de trás)
        this.tops.addChild(sp)
        this.topNodes.set(idx, sp)
      }
      sp.texture = t ?? flatDiamond()
      sp.tint = t ? 0xffffff : fallback
      sp.anchor.set(PIECE_ANCHOR.x / sp.texture.width, PIECE_ANCHOR.y / sp.texture.height)
      sp.scale.set(K)
      // Covas só no lote arado vazio (manifesto: nem na cobertura verde, nem sob cultura).
      const wantHoles = this.mound && variants.get(idx) === 'plowed' && !!art.soil_plot_holes
      let h = this.holeNodes.get(idx)
      if (wantHoles && !h) {
        const p = plotPos(idx)
        h = pieceSprite(art.soil_plot_holes!, p.x, p.y)
        this.holes.addChild(h)
        this.holeNodes.set(idx, h)
      } else if (!wantHoles && h) { h.destroy(); this.holeNodes.delete(idx) }
    }
    for (const [idx, sp] of this.topNodes) {
      if (ground.has(idx)) continue
      sp.destroy()
      this.topNodes.delete(idx)
      this.holeNodes.get(idx)?.destroy()
      this.holeNodes.delete(idx)
    }
    // O bloco é a terra comprada + os montinhos verdes à venda (mesma altura): o friso contorna os dois.
    const soil = [...variants.keys()].sort((a, b) => a - b)
    const block = [...ground.keys()].sort((a, b) => a - b)
    const shape = `${this.mound}|${block.join(',')}`
    if (shape !== this.shapeKey) {
      this.shapeKey = shape
      if (this.mound) this.buildRims(block, art)
      else this.buildLegacyEdges(soil, art)
      this.drawShadow(block)
    }
    return fieldEdges(soil).sides
  }

  /** Topo de terra do lote (o destaque do mouse vai nele: hoverFx.ts). */
  top(idx: number): Sprite | undefined {
    return this.topNodes.get(idx)
  }

  /** Friso dos montinhos: uma peça por lado exposto e os cantos que fecham as pontas (plotRims). */
  private buildRims(block: number[], art: ArtBook) {
    this.rims.removeChildren().forEach((c) => c.destroy())
    for (const [idx, r] of plotRims(block)) {
      const p = plotPos(idx)
      for (const side of ['ne', 'nw', 'se', 'sw'] as const) {
        const t = r[side] ? art[`soil_plot_rim_${side}`] : null
        if (t) this.rims.addChild(pieceSprite(t, p.x, p.y))
      }
      for (const k of ['s', 'e', 'w'] as const) {
        const t = r[k] ? art[`soil_plot_rim_corner_${k}`] : null
        if (t) this.rims.addChild(pieceSprite(t, p.x, p.y))
      }
    }
  }

  /** Reserva sem a arte K: lateral recortada do tile antigo só no contorno (sw e se). */
  private buildLegacyEdges(soil: number[], art: ArtBook) {
    this.rims.removeChildren().forEach((c) => c.destroy())
    const { left, right } = fieldEdges(soil)
    const sw = edgeTexture(art, 'sw'), se = edgeTexture(art, 'se')
    for (const e of left) if (sw) { const p = plotPos(e.idx); this.rims.addChild(pieceSprite(sw, p.x, p.y)) }
    for (const e of right) if (se) { const p = plotPos(e.idx); this.rims.addChild(pieceSprite(se, p.x, p.y)) }
  }

  /** Sombra do bloco inteiro no gramado, para baixo e à direita (luz de cima à esquerda). */
  private drawShadow(soil: number[]) {
    this.shadow.texture.destroy(true)
    this.shadow.texture = Texture.EMPTY
    if (!soil.length || typeof document === 'undefined') return
    const side = this.mound ? MOUND_RIM : PLOT_SIDE
    const blur = 10, k = 1.5 // pixels de textura por unidade do mundo
    const xs: number[] = [], ys: number[] = []
    for (const i of soil) { const c = plotCorners(i); xs.push(c.left.x, c.right.x); ys.push(c.top.y, c.bottom.y + side) }
    const x0 = Math.min(...xs) - blur * 3, y0 = Math.min(...ys) - blur * 3
    const w = Math.max(...xs) + blur * 3 - x0, h = Math.max(...ys) + blur * 3 - y0
    const c = document.createElement('canvas')
    c.width = Math.ceil(w * k)
    c.height = Math.ceil(h * k)
    const g = c.getContext('2d')!
    g.scale(k, k)
    g.filter = `blur(${blur * 0.6}px)`
    g.fillStyle = '#1e3010'
    g.beginPath()
    for (const i of soil) {
      const p = plotCorners(i), dx = -x0 + SHADOW_OFFSET.x * 1.4, dy = -y0 + SHADOW_OFFSET.y * 1.4
      // Losango + espessura (o "pé" do bloco), já que a sombra vem da base.
      g.moveTo(p.top.x + dx, p.top.y + dy)
      g.lineTo(p.right.x + dx, p.right.y + dy)
      g.lineTo(p.right.x + dx, p.right.y + side + dy)
      g.lineTo(p.bottom.x + dx, p.bottom.y + side + dy)
      g.lineTo(p.left.x + dx, p.left.y + side + dy)
      g.lineTo(p.left.x + dx, p.left.y + dy)
      g.closePath()
    }
    g.fill('nonzero') // união dos lotes: a sombra não escurece onde dois lotes se encostam
    this.shadow.texture = Texture.from(c)
    this.shadow.position.set(x0, y0)
    this.shadow.scale.set(1 / k)
  }
}

/** Losango branco 256×128 (tingido) para quando não há arte de terra. */
function flatDiamond() {
  const hit = cache.get('flat')
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = ART_W
  c.height = ART_W / 2
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.beginPath()
  g.moveTo(128, -E); g.lineTo(256 + E, 64); g.lineTo(128, 128 + E); g.lineTo(-E, 64)
  g.fill()
  const t = Texture.from(c)
  cache.set('flat', t)
  return t
}
