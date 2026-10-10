// Decoração solta na cena (opção B estruturada): enfeites (na camada do pé, com bichos e plantas, ordenados pela
// profundidade), caminhos autoconectados no chão, a grade das zonas no modo edição e a prévia
// verde/vermelha do que está na mão. A regra (onde pode) é a mesma do servidor: game/decor-grid.ts.
// Arte do lote M (public/art/MANIFEST.md); sem a arte, placeholders em código.
import { Container, Graphics, Matrix, Sprite, type Texture } from 'pixi.js'
import { ORNAMENT_BY_ID, PATH_BY_ID, isPath } from '@/game/decor'
import {
  CELL_H, CELL_W, cellDiamond, decorGrid, footCenter, footprint, ornamentBase, ornamentBlocker, PATH_STEP, pathTiles, placeCheck, type Placed,
} from '@/game/decor-grid'
import type { Spots } from '@/game/pasture'
import type { ArtBook } from './art'
import { contactShadow, SHADOW_OFFSET } from './depth'
import { footZ } from './depth-order'
import { TILE_W } from './iso'

/** Escala da arte do lote M no mundo: a mesma dos lotes e das culturas (losango de 256 px = 132). */
const ART_SCALE = TILE_W / 256

export { ornamentBase }

/** Desenho de um enfeite, com a origem no pé (ornamentBase): sprite do lote M ou placeholder em código. */
export function ornamentNode(itemId: string, art: ArtBook): Container {
  const o = ORNAMENT_BY_ID[itemId]
  const c = new Container()
  // Fora do teste de toque do Pixi: o enfeite nunca rouba o toque dos lotes e dos bichos, e 40 enfeites
  // não pesam a cada movimento do dedo (no modo edição a cena acha o enfeite pela grade: ornamentAt).
  c.eventMode = 'none'
  c.interactiveChildren = false
  const w = (o?.w ?? 1) * CELL_W, h = (o?.h ?? 1) * CELL_H
  const lift = (((o?.w ?? 1) + (o?.h ?? 1)) * CELL_H) / 4 // do pé até o centro da pegada
  // Sombra de contato do tamanho da pegada (a luz vem de cima à esquerda).
  const sh = contactShadow(w * 0.9, h * 0.9, 0.3)
  sh.position.set(SHADOW_OFFSET.x * 0.6, SHADOW_OFFSET.y - lift)
  c.addChild(sh)
  const tex: Texture | undefined = art[`deco_${itemId}`]
  if (tex) {
    // Âncora do manifesto: centro horizontal, 4 px acima da base do canvas.
    const sp = new Sprite(tex)
    sp.anchor.set(0.5, (tex.height - 4) / tex.height)
    sp.scale.set(ART_SCALE)
    c.addChild(sp)
    return c
  }
  // Placeholder: bloco com a cor do enfeite, altura `tall`, topo claro (lido de longe como "objeto").
  const g = new Graphics()
  const color = o?.color ?? 0xcccccc, tall = Math.min(60, o?.tall ?? 24)
  const bw = w * 0.42, bh = Math.min(h * 0.42, bw / 2)
  g.poly([-bw, 0, 0, bh, 0, bh - tall, -bw, -tall]).fill({ color }).stroke({ width: 2, color: 0x3b2a1a, alpha: 0.5 })
  g.poly([bw, 0, 0, bh, 0, bh - tall, bw, -tall]).fill({ color: shade(color, 0.78) }).stroke({ width: 2, color: 0x3b2a1a, alpha: 0.5 })
  g.poly([0, -tall - bh, bw, -tall, 0, bh - tall, -bw, -tall]).fill({ color: shade(color, 1.18) }).stroke({ width: 2, color: 0x3b2a1a, alpha: 0.5 })
  g.y = -lift
  c.addChild(g)
  return c
}

const shade = (c: number, k: number) => {
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((c >> s) & 0xff) * k)))
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

// ---------- caminho: peças do lote M giradas no chão ----------

/** Gira a máscara 90° no chão: 1 (cima-esq.) → 2 (cima-dir.) → 4 (baixo-dir.) → 8 (baixo-esq.) → 1. */
const rotl = (m: number) => ((m << 1) | (m >> 3)) & 15
/** Peças da arte e as bocas delas: reta NO–SE, curva NO–NE, T NO+NE+SE, cruz (manifesto do lote M). */
const PIECES: [string, number][] = [['reta', 5], ['curva', 3], ['t', 7], ['cruz', 15]]

/** Qual peça e quantos giros de 90° desenham a máscara. Ponta e célula solta usam a reta. */
export function pathPiece(mask: number): { piece: string; turns: number } {
  for (const [piece, base] of PIECES) {
    let m = base
    for (let turns = 0; turns < 4; turns++, m = rotl(m)) if (m === mask) return { piece, turns }
  }
  return { piece: 'reta', turns: mask & 10 ? 1 : 0 }
}

/**
 * Giro de 90° no chão isométrico 2:1, em coordenadas da tela: x' = −2y, y' = x/2. É exato para o chão
 * plano (o losango vai nele mesmo), então a mesma peça serve nas quatro direções.
 */
function pathMatrix(turns: number, x: number, y: number) {
  const k = ART_SCALE // a peça de 256 px cobre um lote (2 × 2 células finas)
  let a = k, b = 0, c = 0, d = k
  for (let i = 0; i < turns; i++) [a, b, c, d] = [-2 * b, a / 2, -2 * d, c / 2]
  return new Matrix(a, b, c, d, x, y)
}

function pathSprite(itemId: string, mask: number, u: number, v: number, art: ArtBook): Sprite | null {
  const { piece, turns } = pathPiece(mask)
  const tex = art[`deco_${itemId}_${piece}`]
  if (!tex) return null
  const sp = new Sprite(tex)
  sp.anchor.set(0.5)
  const { x, y } = footCenter(u, v, PATH_STEP, PATH_STEP)
  sp.setFromMatrix(pathMatrix(turns, x, y))
  return sp
}

/** Losango de um bloco de células (a célula de caminho: 2 × 2). */
export function blockDiamond(u: number, v: number, w = PATH_STEP, h = PATH_STEP): number[] {
  const { x, y } = footCenter(u, v, w, h)
  const hw = ((w + h) * CELL_W) / 4, hh = ((w + h) * CELL_H) / 4
  return [x, y - hh, x + hw, y, x, y + hh, x - hw, y]
}

/** Placeholder do caminho: losango com borda nos lados sem vizinho. */
function drawPathCell(g: Graphics, u: number, v: number, itemId: string, mask: number) {
  const k = PATH_BY_ID[itemId]
  const d = blockDiamond(u, v)
  g.poly(d).fill({ color: k?.color ?? 0xc89a62 })
  const [tx, ty, rx, ry, bx, by, lx, ly] = d
  // Lados: 1 = cima-esquerda (esq→topo), 2 = cima-direita (topo→dir), 4 = baixo-direita (dir→base), 8 = baixo-esquerda (base→esq).
  const sides: [number, number, number, number, number][] = [[1, lx, ly, tx, ty], [2, tx, ty, rx, ry], [4, rx, ry, bx, by], [8, bx, by, lx, ly]]
  for (const [bit, x1, y1, x2, y2] of sides) {
    if (mask & bit) continue
    g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 3, color: k?.edge ?? 0x8d6a40, alpha: 0.9 })
  }
}

export type EditMode = 'off' | 'move' | 'place' | 'paint' | 'erase'

export class DecorLayer {
  /** No chão, logo acima do gramado: os caminhos. */
  readonly ground = new Container()
  /** Grade das zonas (só no modo edição), acima dos caminhos. */
  readonly grid = new Container()
  /** Por cima de tudo: prévia do que está na mão e destaque do selecionado. */
  readonly ghost = new Container()
  private pathG = new Graphics()
  private pathSprites = new Container()
  private gridG = new Graphics()
  private nodes = new Map<number, Container>()
  private key = ''
  placed: Placed[] = []
  /** Teste de ponto para os bichos (desviam dos enfeites). Atualiza a cada mudança. */
  blocked: (x: number, y: number) => boolean = () => false
  private gridMode: 'ornament' | 'path' | null = null

  constructor(private objects: Container, private art: ArtBook) {
    this.ground.eventMode = 'none'
    this.grid.eventMode = 'none'
    this.ghost.eventMode = 'none'
    this.ground.addChild(this.pathSprites, this.pathG)
    this.grid.addChild(this.gridG)
    this.grid.visible = false
  }

  /** Decoração da fazenda na tela (vem do servidor). Só redesenha o que mudou. */
  set(placed: Placed[]) {
    const key = JSON.stringify(placed)
    if (key === this.key) return
    this.key = key
    this.placed = placed
    const keep = new Set<number>()
    for (const p of placed) {
      if (isPath(p.itemId)) continue
      keep.add(p.id)
      let n = this.nodes.get(p.id)
      if (!n || n.label !== p.itemId) {
        n?.destroy({ children: true })
        n = ornamentNode(p.itemId, this.art)
        n.label = p.itemId
        this.objects.addChild(n)
        this.nodes.set(p.id, n)
      }
      const b = ornamentBase(p.itemId, p.u, p.v)
      n.position.set(b.x, b.y)
      // Profundidade: pelo pé (a ponta de baixo da pegada), na camada única com bichos, plantas e casas.
      n.zIndex = footZ(b.x, b.y)
    }
    for (const [id, n] of this.nodes) if (!keep.has(id)) { n.destroy({ children: true }); this.nodes.delete(id) }
    this.pathG.clear()
    this.pathSprites.removeChildren().forEach((c) => c.destroy())
    for (const t of pathTiles(placed)) {
      const sp = pathSprite(t.itemId, t.mask, t.u, t.v, this.art)
      if (sp) this.pathSprites.addChild(sp)
      else drawPathCell(this.pathG, t.u, t.v, t.itemId, t.mask)
    }
    const b = ornamentBlocker(placed)
    this.blocked = b
    if (this.gridMode) this.drawGrid(this.gridMode)
  }

  /** Nó do enfeite (para arrastar). */
  node(id: number) {
    return this.nodes.get(id) ?? null
  }

  /** Qual enfeite está sob o ponto do mundo (pela pegada; o da frente ganha). */
  ornamentAt(x: number, y: number): Placed | null {
    let best: Placed | null = null, bestZ = -Infinity
    for (const p of this.placed) {
      if (isPath(p.itemId)) continue
      const n = this.nodes.get(p.id)
      if (!n) continue
      const o = ORNAMENT_BY_ID[p.itemId]
      const b = ornamentBase(p.itemId, p.u, p.v)
      // Caixa do desenho: largura da pegada (com folga) e altura do enfeite acima do pé.
      const hw = (o.w + o.h) * (CELL_W / 4) + 8, tall = Math.max(o.tall, 30)
      if (x >= b.x - hw && x <= b.x + hw && y <= b.y + 4 && y >= b.y - tall && n.zIndex > bestZ) {
        best = p
        bestZ = n.zIndex
      }
    }
    return best
  }

  /** Mostra a grade: 'ornament' = só as faixas de decoração; 'path' = onde caminho pode (faixas, corredor e gramado). */
  showGrid(mode: 'ornament' | 'path' | null) {
    if (mode === this.gridMode) return
    this.gridMode = mode
    this.grid.visible = !!mode
    if (mode) this.drawGrid(mode)
  }

  private drawGrid(mode: 'ornament' | 'path') {
    const g = this.gridG
    g.clear()
    const busy = new Set<string>()
    for (const p of this.placed) for (const [u, v] of footprint(p.itemId, p.u, p.v)) busy.add(`${u},${v}`)
    const grid = decorGrid()
    // Caminho: grade do tamanho do lote (só os blocos 2 × 2 em que nenhuma célula está bloqueada).
    const cells = mode === 'ornament' ? grid.cells.filter((c) => c.kind === 'zone') : grid.cells.filter((c) => {
      if (c.u % PATH_STEP || c.v % PATH_STEP) return false
      return footprint('caminho_terra', c.u, c.v).every(([u, v]) => { const k = grid.kind(u, v); return k !== 'blocked' && k !== 'out' })
    })
    for (const c of cells) {
      const d = mode === 'ornament' ? cellDiamond(c.u, c.v) : blockDiamond(c.u, c.v)
      const used = busy.has(`${c.u},${c.v}`)
      g.poly(d).fill({ color: c.kind === 'zone' ? 0xfff6c8 : 0xd8f0ff, alpha: used ? 0.05 : 0.22 })
      g.poly(d).stroke({ width: 1.5, color: 0xffffff, alpha: used ? 0.25 : 0.7 })
    }
  }

  /**
   * Prévia do item na mão sobre a célula (u, v): pegada verde (pode) ou vermelha (não pode) e o desenho
   * meio transparente. Devolve o resultado da regra para a HUD mostrar o motivo.
   */
  preview(itemId: string | null, u: number, v: number, animals: Spots, skipId?: number) {
    this.ghost.removeChildren().forEach((c) => c.destroy({ children: true }))
    if (!itemId) return null
    const chk = placeCheck(itemId, u, v, this.placed, animals, skipId)
    const g = new Graphics()
    for (const [cu, cv] of footprint(itemId, u, v)) g.poly(cellDiamond(cu, cv)).fill({ color: chk.ok ? 0x44c767 : 0xff5a5f, alpha: 0.45 }).stroke({ width: 2, color: chk.ok ? 0x2f8f4a : 0xc0392b })
    this.ghost.addChild(g)
    if (!isPath(itemId)) {
      const n = ornamentNode(itemId, this.art)
      const b = ornamentBase(itemId, u, v)
      n.position.set(b.x, b.y)
      n.alpha = 0.8
      // O próprio desenho fica esverdeado (pode) ou avermelhado (não pode): dá para ver de longe.
      n.tint = chk.ok ? 0xb4ffb4 : 0xff8a8a
      this.ghost.addChild(n)
    }
    return chk
  }

  /**
   * Prévia do traço do pincel: células que vão virar caminho (verde/vermelho por célula) ou, sem item
   * (apagar), as que vão sair (amarelo).
   */
  previewCells(cells: [number, number][], itemId: string | null, animals: Spots) {
    this.ghost.removeChildren().forEach((c) => c.destroy({ children: true }))
    const g = new Graphics()
    const sim = [...this.placed]
    for (const [u, v] of cells) {
      if (!itemId) {
        const has = this.placed.some((p) => isPath(p.itemId) && p.u === u && p.v === v)
        g.poly(blockDiamond(u, v)).fill({ color: has ? 0xffc93c : 0xffffff, alpha: has ? 0.55 : 0.15 })
        continue
      }
      const chk = placeCheck(itemId, u, v, sim, animals)
      if (chk.ok) sim.push({ id: -1, itemId, u, v })
      g.poly(blockDiamond(u, v)).fill({ color: chk.ok ? 0x44c767 : 0xff5a5f, alpha: 0.5 }).stroke({ width: 1.5, color: chk.ok ? 0x2f8f4a : 0xc0392b })
    }
    this.ghost.addChild(g)
  }

  /** Destaque do enfeite escolhido (contorno amarelo da pegada). */
  highlight(p: Placed | null) {
    this.ghost.removeChildren().forEach((c) => c.destroy({ children: true }))
    if (!p) return
    const g = new Graphics()
    for (const [u, v] of footprint(p.itemId, p.u, p.v)) g.poly(cellDiamond(u, v)).fill({ color: 0xffc93c, alpha: 0.25 }).stroke({ width: 3, color: 0xffc93c })
    this.ghost.addChild(g)
  }

  /** Esconde o desenho de um enfeite (enquanto ele está na mão, a prévia faz o papel dele). */
  hide(id: number | null) {
    for (const [nid, n] of this.nodes) n.visible = nid !== id
  }

  destroy() {
    for (const n of this.nodes.values()) n.destroy({ children: true })
    this.nodes.clear()
  }
}

/** O que o modo edição da cena pede à página (que fala com o servidor). */
export type DecorEvent =
  | { kind: 'place'; itemId: string; u: number; v: number }
  | { kind: 'move'; id: number; u: number; v: number }
  | { kind: 'paint'; itemId: string; cells: [number, number][] }
  | { kind: 'erase'; cells: [number, number][] }
  | { kind: 'select'; id: number | null }
  | { kind: 'hint'; text?: string; bad?: boolean }

/** Estado do modo edição que a página passa para a cena. */
export type SceneEdit = { mode: EditMode; itemId?: string; selected?: number | null } | null
