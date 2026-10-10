// Partículas pequenas das ações: respingo ao regar, poeira ao limpar/arar, folhas e brilho ao colher.
// Pool fixo de sprites com 3 texturas geradas em canvas (tudo no mesmo lote de desenho).
import { Container, Sprite, Texture } from 'pixi.js'

export type Burst = 'water' | 'dust' | 'harvest' | 'sparkle' | 'leaves'

type P = { s: Sprite; vx: number; vy: number; g: number; life: number; max: number; spin: number; s0: number; s1: number; a: number }

const MAX = 160

function canvasTex(draw: (g: CanvasRenderingContext2D) => void, w = 16, h = 16) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  return Texture.from(c)
}

let tex: { dot: Texture; leaf: Texture; star: Texture } | null = null
function textures() {
  if (tex) return tex
  return (tex = {
    dot: canvasTex((g) => {
      const r = g.createRadialGradient(8, 8, 0, 8, 8, 8)
      r.addColorStop(0, 'rgba(255,255,255,1)')
      r.addColorStop(0.6, 'rgba(255,255,255,0.85)')
      r.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = r
      g.fillRect(0, 0, 16, 16)
    }),
    leaf: canvasTex((g) => {
      g.fillStyle = '#fff'
      g.beginPath()
      g.ellipse(8, 4, 7, 3.2, 0, 0, Math.PI * 2)
      g.fill()
    }, 16, 8),
    star: canvasTex((g) => {
      g.fillStyle = '#fff'
      g.beginPath()
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4, r = i % 2 ? 2.2 : 8
        g.lineTo(8 + Math.cos(a) * r, 8 + Math.sin(a) * r)
      }
      g.fill()
    }),
  })
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)

export class Particles extends Container {
  private live: P[] = []
  private free: Sprite[] = []

  constructor(private enabled = true) {
    super()
    this.eventMode = 'none'
  }

  private spawn(t: Texture, x: number, y: number, o: Partial<P> & { tint: number }) {
    if (this.live.length >= MAX) return
    const s = this.free.pop() ?? this.addChild(new Sprite())
    s.texture = t
    s.anchor.set(0.5)
    s.visible = true
    s.tint = o.tint
    s.position.set(x, y)
    s.rotation = Math.random() * Math.PI
    const p: P = { s, vx: 0, vy: 0, g: 0, life: 0, max: 0.8, spin: 0, s0: 0.5, s1: 0.5, a: 1, ...o }
    s.scale.set(p.s0)
    s.alpha = p.a
    this.live.push(p)
  }

  /** Uma rajada no ponto (x, y) do mundo (centro do lote). */
  burst(kind: Burst, x: number, y: number, color?: number) {
    if (!this.enabled) return
    const t = textures()
    if (kind === 'water') {
      for (let i = 0; i < 16; i++) {
        this.spawn(t.dot, x + rand(-30, 30), y - rand(24, 40), {
          tint: i % 4 ? 0x6cc6ff : 0xe8f7ff, vx: rand(-55, 55), vy: rand(-90, -20), g: 300, max: rand(0.5, 0.8), s0: rand(0.3, 0.5), s1: 0.2,
        })
      }
      for (let i = 0; i < 6; i++) {
        this.spawn(t.dot, x + rand(-40, 40), y + rand(-12, 14), { tint: 0xbfe8ff, vx: rand(-20, 20), vy: rand(-12, -4), max: 0.6, s0: 0.3, s1: 1.1, a: 0.7 })
      }
    } else if (kind === 'dust') {
      for (let i = 0; i < 14; i++) {
        this.spawn(t.dot, x + rand(-44, 44), y + rand(-14, 18), {
          tint: i % 3 ? 0xc9a072 : 0xe2c79c, vx: rand(-40, 40), vy: rand(-36, -8), g: -12, max: rand(0.7, 1.1), s0: rand(0.6, 0.9), s1: rand(1.6, 2.2), a: 0.65,
        })
      }
    } else if (kind === 'harvest' || kind === 'leaves') {
      const n = kind === 'harvest' ? 10 : 7
      for (let i = 0; i < n; i++) {
        this.spawn(t.leaf, x + rand(-34, 34), y - rand(10, 30), {
          tint: i % 3 ? color ?? 0x6cc24a : 0x9be05f, vx: rand(-70, 70), vy: rand(-170, -80), g: 260, max: rand(0.8, 1.1), s0: 1, s1: 0.8, spin: rand(-8, 8),
        })
      }
      if (kind === 'harvest') this.burst('sparkle', x, y)
    } else if (kind === 'sparkle') {
      for (let i = 0; i < 9; i++) {
        this.spawn(t.star, x + rand(-40, 40), y - rand(10, 50), {
          tint: i % 3 ? 0xfff27a : 0xffffff, vx: rand(-15, 15), vy: rand(-60, -25), max: rand(0.7, 1.1), s0: rand(0.5, 0.9), s1: 0.1, spin: rand(-3, 3),
        })
      }
    }
  }

  update(dt: number) {
    if (!this.live.length) return
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i]
      p.life += dt
      const k = p.life / p.max
      if (k >= 1) {
        p.s.visible = false
        this.free.push(p.s)
        this.live.splice(i, 1)
        continue
      }
      p.vy += p.g * dt
      p.s.x += p.vx * dt
      p.s.y += p.vy * dt
      p.s.rotation += p.spin * dt
      p.s.scale.set(p.s0 + (p.s1 - p.s0) * k)
      p.s.alpha = p.a * (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3)
    }
  }
}
