// Profundidade "2.5D" barata: sombras de contato (uma textura de gradiente reaproveitada por todos
// os sprites, então tudo cai no mesmo lote de desenho) e a área de toque do lote com a lateral.
import { Container, Polygon, Sprite, Texture } from 'pixi.js'
import { TILE_H, TILE_W } from './iso'
import { ART_TILE_W } from './art'

let shadowTex: Texture | null = null

/** Elipse suave (preto no centro → transparente na borda), gerada uma vez num canvas 2D. */
function shadowTexture() {
  if (shadowTex) return shadowTex
  if (typeof document === 'undefined') return (shadowTex = Texture.WHITE)
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(0,0,0,1)')
  grad.addColorStop(0.55, 'rgba(0,0,0,0.7)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return (shadowTex = Texture.from(c))
}

/** Sombra de contato: elipse w×h centrada no ponto (pé do objeto). Tom marrom-esverdeado, não preto. */
export function contactShadow(w: number, h = w * 0.34, alpha = 0.32) {
  const s = new Sprite(shadowTexture())
  s.anchor.set(0.5)
  s.width = w
  s.height = h
  s.alpha = alpha
  s.tint = 0x1e3010
  s.eventMode = 'none'
  return s
}

// Luz de cima à esquerda (MANIFEST): a sombra escorrega um pouco para baixo e para a direita.
export const SHADOW_OFFSET = { x: 6, y: 3 }

/** Camada de sombras logo acima do gramado: as fixas (casa, árvores) e as que seguem os bichos. */
export class ShadowLayer extends Container {
  private followers: { shadow: Sprite; node: Container; body: Container; alpha: number; sx: number; sy: number }[] = []

  constructor() {
    super()
    this.eventMode = 'none'
  }

  /** Sombra parada no ponto (x, y) do mundo. */
  place(x: number, y: number, w: number, h?: number, alpha?: number) {
    const s = contactShadow(w, h, alpha)
    s.position.set(x + SHADOW_OFFSET.x, y + SHADOW_OFFSET.y)
    this.addChild(s)
    return s
  }

  /** Sombra que acompanha um bicho (node = pés no mundo; body = parte que pula). */
  follow(node: Container, body: Container, w: number, alpha = 0.34) {
    const shadow = contactShadow(w, w * 0.32, alpha)
    this.addChild(shadow)
    this.followers.push({ shadow, node, body, alpha, sx: shadow.scale.x, sy: shadow.scale.y })
    this.syncOne(this.followers[this.followers.length - 1])
  }

  /** Remove as sombras dos nós que já foram destruídos (ex.: cachorro trocado). */
  prune() {
    this.followers = this.followers.filter((f) => {
      if (!f.node.destroyed) return true
      f.shadow.destroy()
      return false
    })
  }

  sync() {
    for (const f of this.followers) this.syncOne(f)
  }

  private syncOne(f: ShadowLayer['followers'][number]) {
    if (f.node.destroyed) return
    f.shadow.position.set(f.node.x + SHADOW_OFFSET.x * 0.5, f.node.y + 1)
    // No pulinho a sombra encolhe e clareia (o corpo se afasta do chão).
    const lift = Math.min(1, Math.max(0, -f.body.y / 14))
    const k = 1 - lift * 0.18
    f.shadow.alpha = f.alpha * (1 - lift * 0.45)
    f.shadow.scale.set(f.sx * k, f.sy * k)
  }
}

// ---------- lote com espessura ----------

/** Altura da lateral de terra do tile (a arte tem 32 px de lateral em 256 de largura). */
export const PLOT_SIDE = (32 * TILE_W) / ART_TILE_W

/**
 * Área de toque do lote: losango de cima + as faces laterais de terra que aparecem. Com a terra
 * contínua só os lotes da borda externa mostram lateral (`sides`), então só eles ganham essa faixa.
 * Os lotes de trás ficam embaixo na ordem de desenho, então a lateral nunca "rouba" o
 * toque de quem está na frente: o Pixi testa primeiro quem está por cima.
 */
export function plotHitPolygon(sides = { left: true, right: true }, w = TILE_W, h = TILE_H, side = PLOT_SIDE): number[] {
  const l = sides.left ? side : 0, r = sides.right ? side : 0
  return [0, -h / 2, w / 2, 0, w / 2, r, 0, h / 2 + r, 0, h / 2 + l, -w / 2, l, -w / 2, 0]
}

/** Sombra das plantas sobre a terra: cresce com o estágio (só aparece entre as folhas). */
export function cropShadow(stage: number) {
  const k = Math.min(5, Math.max(0, stage)) / 5
  const s = contactShadow(TILE_W * (0.5 + 0.35 * k), TILE_H * (0.5 + 0.35 * k), 0.12 + 0.18 * k)
  s.position.set(SHADOW_OFFSET.x * 0.6, 4)
  return s
}

/** Coluna da planta acima do lote: meia-largura (fração de TILE_W) que conta como toque no lote. */
export const PLANT_HIT_HALF = 0.32
/** Marcador (✓, ✋, ⛏) que sobe e desce acima do lote: centro e raio de toque, já com o balanço. */
export const BADGE_HIT = { y: -78, r: 22 }

/**
 * Área de toque do lote para todas as ferramentas (seta, mão, regador…): o losango com as laterais
 * (plotHitPolygon) + a parte da planta que sobe acima dele (`plantTop` < 0: topo da parte opaca da arte,
 * em coordenadas do lote) + o marcador. Antes era só o losango: o toque no milho/girassol alto não chegava
 * ao lote (prévia de 09/10); a seta às vezes "funcionava" porque caía na terra do lote de trás.
 * O lote da frente fica por cima na ordem de desenho, então a coluna dele ganha do lote de trás que ela cobre.
 */
export function plotHitArea(poly: number[], plantTop: number, badge: boolean, w = TILE_W) {
  const base = new Polygon(poly), half = w * PLANT_HIT_HALF
  return {
    contains: (x: number, y: number) => base.contains(x, y)
      || (plantTop < 0 && y >= plantTop && y <= 0 && Math.abs(x) <= half)
      || (badge && Math.hypot(x, y - BADGE_HIT.y) <= BADGE_HIT.r),
  }
}

const opaque = new WeakMap<object, number>()
/** Fração (0–1, de cima) onde começa a parte opaca da textura (a arte tem folga transparente em cima).
 *  Lida uma vez por textura; sem canvas (testes) ou com erro, 0 = a textura inteira. */
export function opaqueTopFrac(tex: Texture): number {
  const key = tex.source as object
  const hit = opaque.get(key)
  if (hit != null) return hit
  let frac = 0
  try {
    const res = tex.source.resource as CanvasImageSource | undefined
    const { x, y, width, height } = tex.frame
    if (res && typeof document !== 'undefined') {
      const cv = document.createElement('canvas')
      cv.width = Math.max(1, Math.round(width)); cv.height = Math.max(1, Math.round(height))
      const ctx = cv.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(res, x, y, width, height, 0, 0, cv.width, cv.height)
      const data = ctx.getImageData(0, 0, cv.width, cv.height).data
      let row = 0
      search: for (; row < cv.height; row++) for (let col = 0; col < cv.width; col++) if (data[(row * cv.width + col) * 4 + 3] > 40) break search
      frac = row / cv.height
    }
  } catch { frac = 0 }
  opaque.set(key, frac)
  return frac
}
