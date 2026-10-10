// Luz por hora do dia no horário de Brasília. Custo zero de GPU: só a tinta (multiplicação de cor)
// do mundo, herdada pelos filhos no Pixi 8, mais umas luzinhas aditivas nas janelas à noite.
import { Container, Sprite, Texture } from 'pixi.js'

const TZ = 'America/Sao_Paulo'

/** Hora decimal (0–24) em Brasília. */
export function brasiliaHour(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(now)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return get('hour') + get('minute') / 60
}

// Quadros-chave: [hora, tinta, noite 0..1]. A noite fica azulada mas clara o bastante para jogar.
const KEYS: [number, number, number][] = [
  [0, 0x8494c8, 1],
  [5, 0x8494c8, 1],
  [6.5, 0xffcfb0, 0.35], // amanhecer rosado
  [8, 0xfff0d6, 0], // manhã quente
  [11, 0xffffff, 0], // meio do dia e tarde neutros
  [16, 0xffffff, 0],
  [17.5, 0xffe2c2, 0], // fim de tarde dourado
  [18.6, 0xe6bcc4, 0.5], // crepúsculo
  [19.6, 0x8494c8, 1],
  [24, 0x8494c8, 1],
]

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const mix = (a: number, b: number, t: number) => {
  const ch = (c: number, s: number) => (c >> s) & 0xff
  return (Math.round(lerp(ch(a, 16), ch(b, 16), t)) << 16) | (Math.round(lerp(ch(a, 8), ch(b, 8), t)) << 8) | Math.round(lerp(ch(a, 0), ch(b, 0), t))
}

/** Tinta do mundo e quanto é noite (0 = dia, 1 = noite) para uma hora decimal. */
export function lightAt(hour: number): { tint: number; night: number } {
  const h = ((hour % 24) + 24) % 24
  for (let i = 1; i < KEYS.length; i++) {
    const [h1, c1, n1] = KEYS[i]
    if (h > h1) continue
    const [h0, c0, n0] = KEYS[i - 1]
    const t = (h - h0) / (h1 - h0 || 1)
    return { tint: mix(c0, c1, t), night: lerp(n0, n1, t) }
  }
  return { tint: KEYS[0][1], night: KEYS[0][2] }
}

let glowTex: Texture | null = null
function glowTexture() {
  if (glowTex) return glowTex
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,214,120,1)')
  grad.addColorStop(0.35, 'rgba(255,180,80,0.55)')
  grad.addColorStop(1, 'rgba(255,160,60,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return (glowTex = Texture.from(c))
}

/** Hora forçada para QA: ?hora=20.5 na URL. */
function forcedHour(): number | null {
  if (typeof location === 'undefined') return null
  const v = new URLSearchParams(location.search).get('hora')
  return v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null
}

/**
 * Luz do dia: pinta o mundo e acende as luzes à noite. As luzes ficam numa camada própria,
 * fora do mundo pintado (senão a tinta azul apagaria o amarelo), com a mesma câmera.
 */
export class Lighting {
  readonly lights = new Container()
  private timer: ReturnType<typeof setInterval> | null = null
  private glows: { s: Sprite; a: number }[] = []

  constructor(private world: Container) {
    this.lights.eventMode = 'none'
  }

  /** Luzinha quente (janela, lampião) no ponto do mundo; aparece só à noite. */
  addGlow(x: number, y: number, w: number, h = w, alpha = 0.9): Sprite {
    const s = new Sprite(glowTexture())
    s.anchor.set(0.5)
    s.position.set(x, y)
    s.width = w
    s.height = h
    s.blendMode = 'add'
    s.alpha = 0
    this.lights.addChild(s)
    this.glows.push({ s, a: alpha })
    this.apply()
    return s
  }

  /** Apaga luzes que deixaram de existir (ex.: a casa trocou de série e as janelas mudaram de lugar). */
  removeGlows(list: Sprite[]) {
    const gone = new Set(list)
    this.glows = this.glows.filter((g) => !gone.has(g.s))
    for (const s of list) s.destroy()
  }

  start() {
    this.apply()
    // A luz muda devagar: conferir a cada 30 s basta.
    this.timer = setInterval(() => this.apply(), 30_000)
  }

  apply(hour = forcedHour() ?? brasiliaHour()) {
    const { tint, night } = lightAt(hour)
    this.world.tint = tint
    this.lights.visible = night > 0.05
    for (const g of this.glows) g.s.alpha = g.a * night
  }

  /** A camada de luzes segue a câmera do mundo (chamar no layout). */
  follow() {
    this.lights.position.copyFrom(this.world.position)
    this.lights.scale.copyFrom(this.world.scale)
  }

  destroy() {
    if (this.timer) clearInterval(this.timer)
  }
}
