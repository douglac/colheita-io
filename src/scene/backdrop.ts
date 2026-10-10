// Fundo com parallax leve: céu e morros distantes atrás da borda de cima do gramado.
// O gramado (perto) cobre a base dos morros; ao arrastar, céu e morros andam menos que a
// fazenda, então "escorregam" atrás da fileira de árvores da borda (parallax de verdade, sem 3D).
// Desempenho: morros e nuvens são texturas desenhadas uma vez em canvas (1 sprite cada) e tudo
// que sai da tela fica invisível (o Pixi nem processa).
import { Container, Sprite, Texture } from 'pixi.js'

/** y do mundo onde o gramado termina e começa o horizonte (só aparece arrastando para cima). */
export const HORIZON = -560

const HILLS_W = 4400 // largura em unidades do mundo
const RES = 0.5 // canvas em meia resolução (morro distante não precisa de detalhe)

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = Math.ceil(w)
  c.height = Math.ceil(h)
  draw(c.getContext('2d')!)
  return Texture.from(c)
}

const skyTexture = () => canvas(2, 128, (g) => {
  const grad = g.createLinearGradient(0, 0, 0, 128)
  grad.addColorStop(0, '#5fb8f0')
  grad.addColorStop(0.75, '#a9dcf7')
  grad.addColorStop(1, '#e4f6ff')
  g.fillStyle = grad
  g.fillRect(0, 0, 2, 128)
})

/**
 * Faixa de morros: silhueta ondulada com tufos redondos (mata bem longe) na crista.
 * O sprite tem âncora no rodapé; `height` é a altura média da crista acima do rodapé−depth.
 */
function hillsTexture(height: number, color: string, tuft: string, seed: number, depth: number) {
  const H = height * 1.3 + depth
  return canvas(HILLS_W * RES, H * RES, (g) => {
    g.scale(RES, RES)
    const crest = (x: number) => H - depth - height * (0.55 + 0.25 * Math.sin(x * 0.004 + seed) + 0.2 * Math.sin(x * 0.011 + seed * 2))
    g.fillStyle = color
    g.beginPath()
    g.moveTo(0, H)
    for (let x = 0; x <= HILLS_W; x += 20) g.lineTo(x, crest(x - HILLS_W / 2))
    g.lineTo(HILLS_W, H)
    g.fill()
    g.fillStyle = tuft
    for (let x = 10; x <= HILLS_W; x += 26) {
      const wx = x - HILLS_W / 2
      if (Math.sin(wx * 0.031 + seed * 3) <= -0.2) continue
      g.beginPath()
      g.arc(x, crest(wx) + 2, 9 + 5 * Math.abs(Math.sin(wx * 0.07 + seed)), 0, Math.PI * 2)
      g.fill()
    }
  })
}

const cloudTexture = () => canvas(130, 60, (g) => {
  g.fillStyle = 'rgba(255,255,255,0.92)'
  for (const [x, y, r] of [[65, 38, 0], [42, 26, 18], [80, 22, 23]]) {
    g.beginPath()
    if (r) g.arc(x, y, r, 0, Math.PI * 2)
    else g.ellipse(x, y, 62, 20, 0, 0, Math.PI * 2)
    g.fill()
  }
})

type Layer = { c: Container; k: number }

export class Backdrop {
  /** Vai no mundo ANTES do gramado (fica atrás dele). */
  readonly far = new Container()
  /** Vai no mundo DEPOIS do gramado: fileira de árvores na borda, cobrindo a emenda. */
  readonly edge = new Container()
  private layers: Layer[] = []
  private clouds: Sprite[] = []
  private trees: Sprite[] = []
  // Camadas trocáveis pela série da decoração (fundo do lote M): textura padrão de cada uma.
  private sky!: Sprite
  private hillBack!: Sprite
  private hillFront!: Sprite
  private rainbow: Sprite | null = null
  private skyLayer!: Container
  private base: { sky: Texture; cloud: Texture; back: Texture; front: Texture } | null = null

  constructor(tree?: Texture) {
    this.far.eventMode = 'none'
    this.edge.eventMode = 'none'
    // Céu (anda bem pouco), nuvens, morros do fundo (azulados pela distância) e da frente.
    const sky = new Container()
    const s = new Sprite(skyTexture())
    s.position.set(-2400, HORIZON - 1500)
    s.width = 4800
    s.height = 1800
    sky.addChild(s)
    this.sky = s
    this.skyLayer = sky
    const ct = cloudTexture()
    for (const [x, y, w] of [[-520, -760, 220], [-80, -820, 170], [360, -740, 260], [820, -800, 200], [-980, -790, 240]]) {
      const cl = new Sprite(ct)
      cl.anchor.set(0.5)
      cl.scale.set(w / 130)
      cl.position.set(x, y)
      sky.addChild(cl)
      this.clouds.push(cl)
    }
    const hill = (height: number, color: string, tuft: string, seed: number, base: number) => {
      const depth = 260 // parte escondida atrás do gramado (folga para o parallax vertical)
      const sp = new Sprite(hillsTexture(height, color, tuft, seed, depth))
      sp.anchor.set(0.5, 1)
      sp.scale.set(1 / RES)
      sp.position.set(0, base + depth)
      const c = new Container()
      c.addChild(sp)
      return { c, sp }
    }
    const { c: back, sp: hb } = hill(150, '#8fc3a4', '#7fb596', 1.3, HORIZON + 10)
    const { c: front, sp: hf } = hill(95, '#79b951', '#67a845', 4.1, HORIZON + 30)
    this.hillBack = hb
    this.hillFront = hf
    this.base = { sky: s.texture, cloud: ct, back: hb.texture, front: hf.texture }
    this.far.addChild(sky, back, front)
    this.layers.push({ c: sky, k: 0.6 }, { c: back, k: 0.42 }, { c: front, k: 0.25 })
    // Árvores na borda do gramado (perto: sem parallax).
    if (tree) {
      for (let i = 0, x = -1500; x <= 1500; i++, x += 58 + ((i * 37) % 30)) {
        const t = new Sprite(tree)
        t.anchor.set(0.5, 284 / 288)
        const w = 92 + ((i * 53) % 40)
        t.scale.set(w / tree.width)
        t.position.set(x, HORIZON + 26 + ((i * 29) % 22))
        t.tint = i % 2 ? 0xffffff : 0xe8f2dc
        this.edge.addChild(t)
        this.trees.push(t)
      }
    }
  }

  /**
   * Chamar a cada mudança de câmera: desloca as camadas contra o arraste (andam 1 − k do que o
   * mundo anda) e esconde o que está fora da tela.
   */
  follow(pan: { x: number; y: number }, scale: number, world: { x: number; y: number }, screen: { width: number; height: number }) {
    for (const l of this.layers) l.c.position.set((-pan.x * l.k) / scale, (-pan.y * l.k) / scale)
    // Retângulo visível em coordenadas do mundo.
    const x0 = -world.x / scale, x1 = (screen.width - world.x) / scale
    const y0 = -world.y / scale
    // Nada do fundo aparece se a tela começa abaixo da copa das árvores da borda.
    const show = y0 < HORIZON + 60
    this.far.visible = show
    this.edge.visible = show
    if (!show) return
    for (const t of this.trees) t.visible = t.x + 80 > x0 && t.x - 80 < x1
  }

  /**
   * Fundo da série (lote M): céu, nuvem, morros distantes e próximos (mesma geometria das camadas
   * desenhadas aqui: 2200 px = 4400 do mundo, base escondida atrás do gramado) e o arco-íris.
   * Sem tema (ou sem o arquivo), volta a camada padrão.
   */
  theme(t: { ceu?: Texture; nuvem?: Texture; distantes?: Texture; proximos?: Texture; arco?: Texture } | null) {
    const b = this.base!
    this.sky.texture = t?.ceu ?? b.sky
    this.sky.width = 4800
    this.sky.height = 1800
    for (const c of this.clouds) {
      const w = c.width
      c.texture = t?.nuvem ?? b.cloud
      c.scale.set(w / c.texture.width)
    }
    this.hillBack.texture = t?.distantes ?? b.back
    this.hillFront.texture = t?.proximos ?? b.front
    this.rainbow?.destroy()
    this.rainbow = null
    if (t?.arco) {
      // Arco-íris atrás das nuvens, na camada do céu (anda junto com ele).
      const r = new Sprite(t.arco)
      r.anchor.set(0.5, 1)
      r.scale.set(2.2)
      r.position.set(120, HORIZON + 120) // a base fica escondida atrás dos morros
      this.skyLayer.addChildAt(r, 1)
      this.rainbow = r
    }
  }

  /** Nuvens passando devagar (desligado com prefers-reduced-motion). */
  update(dt: number) {
    if (!this.far.visible) return
    for (const c of this.clouds) {
      c.x += dt * 6
      if (c.x > 1400) c.x = -1400
    }
  }
}
