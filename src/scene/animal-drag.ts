// Pegar um bicho e trocar de lugar: segurar ~300 ms em cima dele, arrastar e soltar em grama livre.
// Não briga com a câmera: se o dedo andar antes do tempo, é arraste da câmera; segundo dedo (pinça)
// cancela e o bicho volta. A regra de onde pode soltar é a mesma do servidor (src/game/pasture.ts).
import { Graphics } from 'pixi.js'
import { dropCheck, roamArea, type AnimalId } from '@/game/pasture'
import { footZ } from './depth-order'
import type { Wanderer } from './wander'

export const HOLD_MS = 300
const SLOP = 8 // px de tela que o dedo pode tremer antes de virar arraste da câmera
const TOUCH_LIFT = 44 // no celular, o bicho fica acima do dedo (senão o dedo cobre o marcador)
const RETURN_S = 0.25

export type Critter = { id: AnimalId; w: Wanderer; width: number; asleep?: boolean }
type Pt = { x: number; y: number }

type Opts = {
  /** Tela (px do canvas) → mundo. */
  toWorld: (p: Pt) => Pt
  /** Pode pegar este bicho agora? (dono, cachorro acordado) */
  canDrag: (c: Critter) => boolean
  calm: () => boolean
  onPick: (c: Critter) => void
  onDenied: (c: Critter) => void
  onDrop: (c: Critter, x: number, y: number) => void
  onReject: (c: Critter, reason: string) => void
  /** Teste a mais além do dropCheck (ex.: enfeite da decoração). Devolve o motivo ou null. */
  extraCheck?: (c: Critter, x: number, y: number) => string | null
}

export class AnimalDrag {
  private pending: { c: Critter; id: number; at: Pt; touch: boolean; timer: ReturnType<typeof setTimeout> } | null = null
  private held: { c: Critter; id: number; touch: boolean; from: Pt; marker: Graphics; scale: Pt; ok: boolean; reason: string } | null = null
  private returning: { c: Critter; from: Pt; to: Pt; t: number }[] = []

  constructor(private o: Opts) {}

  get holding() { return !!this.held }

  /** Dedo/mouse desceu em cima do bicho (evento do Pixi): começa a contar o "segurar". */
  press(c: Critter, pointerId: number, at: Pt, touch: boolean) {
    if (this.held || this.pending) return
    const timer = setTimeout(() => this.lift(), HOLD_MS)
    this.pending = { c, id: pointerId, at, touch, timer }
  }

  private lift() {
    const p = this.pending
    this.pending = null
    if (!p) return
    if (!this.o.canDrag(p.c)) { this.o.onDenied(p.c); return }
    const { w } = p.c
    // Termina um "voltar" em andamento antes de pegar de novo.
    this.returning = this.returning.filter((r) => r.c !== p.c)
    w.held = true
    const body = w.body
    const scale = { x: body.scale.x, y: body.scale.y }
    // "Sobe": maior, um pouco acima do chão, com a sombra/marcador nos pés.
    body.scale.set(scale.x * 1.15, scale.y * 1.15)
    body.y = -14
    body.rotation = 0
    const marker = new Graphics()
    w.node.addChildAt(marker, 0)
    this.held = { c: p.c, id: p.id, touch: p.touch, from: { x: w.node.x, y: w.node.y }, marker, scale, ok: true, reason: '' }
    w.node.zIndex = 1e6 // por cima de tudo enquanto está na mão
    this.o.onPick(p.c)
    this.follow(p.at)
  }

  /** Movimento do ponteiro (canvas). true = o bicho está na mão e consumiu o movimento (a câmera não anda). */
  move(pointerId: number, at: Pt) {
    if (this.pending && this.pending.id === pointerId && Math.hypot(at.x - this.pending.at.x, at.y - this.pending.at.y) > SLOP) this.abortPending()
    if (!this.held || this.held.id !== pointerId) return false
    this.follow(at)
    return true
  }

  private follow(at: Pt) {
    const h = this.held!
    const w = this.o.toWorld({ x: at.x, y: at.y - (h.touch ? TOUCH_LIFT : 0) })
    const p = { x: Math.round(w.x), y: Math.round(w.y) } // inteiro: o mesmo ponto que o servidor valida e guarda
    h.c.w.node.position.set(p.x, p.y)
    const chk = dropCheck(h.c.id, p.x, p.y)
    const extra = chk.ok ? this.o.extraCheck?.(h.c, p.x, p.y) ?? null : null
    h.ok = chk.ok && !extra
    h.reason = !chk.ok ? chk.reason : extra ?? ''
    const r = h.c.width * 0.42
    h.marker.clear()
    h.marker.ellipse(0, 0, r, r / 2).fill({ color: h.ok ? 0x44c767 : 0xe8473b, alpha: 0.45 }).stroke({ width: 3, color: h.ok ? 0x2e9e4f : 0xb3261e, alpha: 0.9 })
  }

  /** Soltou o dedo/botão. true = era um bicho na mão. */
  release(pointerId: number) {
    if (this.pending?.id === pointerId) this.abortPending()
    const h = this.held
    if (!h || h.id !== pointerId) return false
    this.held = null
    this.putDown(h)
    const { x, y } = h.c.w.node
    if (h.ok) {
      h.c.w.setArea(roamArea(h.c.id, x, y), { x, y })
      h.c.w.held = false
      this.o.onDrop(h.c, x, y)
    } else {
      this.o.onReject(h.c, h.reason)
      this.goBack(h.c, { x, y }, h.from)
    }
    return true
  }

  /** Pinça ou outro gesto: larga tudo e o bicho volta para onde estava. */
  cancel() {
    this.abortPending()
    const h = this.held
    if (!h) return
    this.held = null
    this.putDown(h)
    this.goBack(h.c, { x: h.c.w.node.x, y: h.c.w.node.y }, h.from)
  }

  private abortPending() {
    if (this.pending) clearTimeout(this.pending.timer)
    this.pending = null
  }

  private putDown(h: NonNullable<AnimalDrag['held']>) {
    h.marker.destroy()
    h.c.w.body.scale.set(h.scale.x, h.scale.y)
    h.c.w.body.y = 0
    h.c.w.node.zIndex = footZ(h.c.w.node.x, h.c.w.node.y)
  }

  private goBack(c: Critter, from: Pt, to: Pt) {
    if (this.o.calm()) { this.finish(c, to); return }
    this.returning.push({ c, from, to, t: 0 })
  }

  private finish(c: Critter, to: Pt) {
    c.w.node.position.set(to.x, to.y)
    c.w.node.zIndex = footZ(to.x, to.y)
    c.w.held = false
  }

  /** Animação de volta (lugar proibido): chamar a cada quadro, mesmo com movimento reduzido. */
  update(dt: number) {
    for (const r of this.returning) {
      r.t = Math.min(1, r.t + dt / RETURN_S)
      const k = 1 - (1 - r.t) ** 3 // desacelera no fim
      const { node } = r.c.w
      node.position.set(r.from.x + (r.to.x - r.from.x) * k, r.from.y + (r.to.y - r.from.y) * k - Math.sin(r.t * Math.PI) * 18)
      if (r.t >= 1) this.finish(r.c, r.to)
    }
    this.returning = this.returning.filter((r) => r.t < 1)
  }

  /** Bicho saiu da cena (troca de fazenda, cachorro recriado): esquece ele. */
  forget(c: Critter) {
    if (this.pending?.c === c) this.abortPending()
    if (this.held?.c === c) this.held = null
    this.returning = this.returning.filter((r) => r.c !== c)
  }
}
