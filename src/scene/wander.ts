// Bichos que passeiam pela fazenda (decoração viva): andam até um ponto
// sorteado dentro da área deles, balançam ao andar, viram para o lado do movimento e param um pouco.
import type { Container, Sprite, Texture } from 'pixi.js'
import { behindField, inPoly, type Area } from './layout'
import { footZ } from './depth-order'
import { syncLayer, type Layer } from './layers'

/** Quadros desenhados do bicho (se existirem): caminhada e parado. */
export type Anim = { sprite: Sprite; walk: Texture[]; idle: Texture[] }

export type { Area }

/** true = ponto ocupado (roça, casa, casinha, cerca): o bicho não pisa nem atravessa. */
export type Blocked = (x: number, y: number) => boolean

/** Bichos que se evitam (um não fica em cima do outro): todos os do rebanho compartilham a lista. */
export type Flock = Wanderer[]

/** Distância no chão isométrico (y vale dobrado). */
const groundDist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, (ay - by) * 2)

export class Wanderer {
  private tx = 0
  private ty = 0
  private wait = 0
  private t = Math.random() * 10
  private baseScale: number
  /** Área original quando o bicho foi levado para uma vizinha (roomPoint). */
  private home: Area | null = null
  /** Seguro na mão do jogador (arrastando): não anda nem anima. */
  held = false
  /** Posição comandada de fora (a patrulha do cachorro, patrol.ts): no lugar do passeio sorteado. */
  steer: (() => { x: number; y: number; facing: -1 | 1; walking: boolean }) | null = null
  /** Camadas por cima do corpo (acessórios do lote O): seguem o quadro, a âncora e a escala do sprite do bicho. */
  layers: Layer[] = []

  constructor(
    readonly node: Container, // posição = pé do bicho no mundo
    readonly body: Container, // o que balança/vira (filho de node)
    private area: Area,
    private speed: number, // unidades do mundo por segundo
    private facesLeft = true, // direção do desenho original
    private anim?: Anim,
    private blocked: Blocked = () => false,
    private flock: Flock = [], // os outros bichos (cada um ocupa um círculo de raio `foot` no chão)
    readonly foot = 0,
  ) {
    this.baseScale = Math.abs(body.scale.x)
    // Nasce num ponto livre da área (ou de uma vizinha; se não achar, fica no centro dela).
    const start = this.roomPoint() ?? { x: (area.x0 + area.x1) / 2, y: (area.y0 + area.y1) / 2 }
    node.position.set(start.x, start.y)
    node.zIndex = footZ(start.x, start.y) // ordem de desenho pelo pé desde o 1º quadro (parado, ele só ganharia zIndex ao andar)
    this.tx = start.x
    this.ty = start.y
    this.pick()
    this.wait = rand(0.5, 3)
  }

  /** Ponto livre da área (`spread` = só longe dos outros bichos; senão, qualquer chão livre). */
  freePoint(area: Area = this.area, spread = true, tries = 120, ok?: (x: number, y: number) => boolean) {
    // Na área vizinha (home ≠ null), todo destino evita o chão atrás da roça, não só o 1º (QA nível máximo, 7ª rodada:
    // o pato 4 passeava atrás dos lotes 13–14, por cima das plantas e do balão).
    if (!ok && this.home && area === this.area) ok = notBehindField
    for (let i = 0; i < tries; i++) {
      const x = rand(area.x0, area.x1), y = rand(area.y0, area.y1)
      if (area.poly && !inPoly(x, y, area.poly)) continue
      if (ok && !ok(x, y)) continue
      if (!this.blocked(x, y) && (!spread || !this.crowded(x, y, true))) return { x, y }
    }
    return null
  }

  /**
   * Lugar para ficar: primeiro longe dos outros bichos na própria área; se ela está tomada (enfeites de saves
   * antigos, bichos demais), passa a passear numa área vizinha (a mesma caixa crescida em volta, fora do
   * cercado e fora do chão atrás da roça) que tenha chão livre e espaço. Por último, qualquer chão livre da área (andando até lá, o passo
   * que aproxima de outro bicho continua barrado, então ninguém fica em cima de ninguém).
   */
  private roomPoint() {
    const p = this.freePoint()
    if (p) return p
    // Quem não anda (colmeia, cachorro dormindo) fica onde foi posto.
    if (this.speed && !this.area.poly) {
      for (const grow of NEIGHBOR_GROW) {
        const a = this.home ?? this.area
        const near: Area = { x0: a.x0 - grow, y0: a.y0 - grow / 2, x1: a.x1 + grow, y1: a.y1 + grow / 2 }
        const q = this.freePoint(near, true, 120, notBehindField)
        if (q) { this.home ??= this.area; this.area = near; return q }
      }
    }
    return this.freePoint(this.area, false, 40)
  }

  /**
   * (x, y) fica em cima de outro bicho? Conta onde ele está e para onde vai (`aims`), para dois não
   * escolherem o mesmo lugar. Andando (`aims` = false), só barra o passo que APROXIMA de quem já está
   * perto: dois que nasceram encostados conseguem se afastar.
   */
  crowded(x: number, y: number, aims = false) {
    for (const o of this.flock) {
      if (o === this || o.held || o.node.destroyed) continue
      const min = (this.foot + o.foot) * 1.15
      const d = groundDist(x, y, o.node.x, o.node.y)
      if (d < min && (aims || d < groundDist(this.node.x, this.node.y, o.node.x, o.node.y))) return true
      if (aims && groundDist(x, y, o.tx, o.ty) < min) return true
    }
    return false
  }

  /** O caminho reto até o destino passa por algum obstáculo? (amostra a cada ~8 unidades) */
  private pathBlocked(x: number, y: number) {
    const dx = x - this.node.x, dy = y - this.node.y
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 8))
    for (let i = 1; i <= steps; i++) if (this.blocked(this.node.x + (dx * i) / steps, this.node.y + (dy * i) / steps)) return true
    return false
  }

  private pick() {
    // Sorteia destinos até achar um livre e com caminho livre; sem opção, fica parado onde está.
    // Parado em chão bloqueado (solto atrás de um enfeite): qualquer destino livre serve, para sair dali.
    const stuck = this.blocked(this.node.x, this.node.y)
    for (let i = 0; i < 30; i++) {
      const p = i ? this.freePoint() : this.roomPoint()
      if (p && (stuck || !this.pathBlocked(p.x, p.y))) { this.tx = p.x; this.ty = p.y; return }
    }
    this.tx = this.node.x
    this.ty = this.node.y
  }

  /** Encostado em outro bicho (nasceu ou foi solto ali): desliza devagar para longe, sem pisar no bloqueado. */
  private separate(dt: number) {
    let px = 0, py = 0
    for (const o of this.flock) {
      if (o === this || o.held || o.node.destroyed) continue
      const dx = this.node.x - o.node.x, dy = (this.node.y - o.node.y) * 2
      const d = Math.hypot(dx, dy), min = (this.foot + o.foot) * 1.15
      if (d >= min) continue
      const k = (min - d) / min
      // Mesmo lugar exato: sai para um lado sorteado.
      const ux = d > 0.01 ? dx / d : Math.cos(this.t * 7), uy = d > 0.01 ? dy / d : Math.sin(this.t * 7)
      px += ux * k
      py += (uy * k) / 2
    }
    if (!px && !py) return
    const len = Math.hypot(px, py), step = 30 * dt
    const nx = this.node.x + (px / len) * step, ny = this.node.y + (py / len) * step
    if (this.blocked(nx, ny) || (this.area.poly && !inPoly(nx, ny, this.area.poly))) return
    this.node.x = nx
    this.node.y = ny
    this.node.zIndex = footZ(nx, ny)
  }

  /** Tem quadros desenhados (senão está no sprite parado de scene/, de outra moldura). */
  get animated() {
    return !!this.anim
  }

  /**
   * Troca os quadros (filhote → jovem → adulto); o tamanho do desenho é o mesmo (lote O). Quem nasceu no sprite
   * parado (os quadros não tinham chegado) passa a usar os quadros: quem chama acerta âncora e escala antes.
   */
  setAnim(anim: Anim) {
    if (!anim.walk.length && !anim.idle.length) return
    if (!this.anim) this.anim = { sprite: anim.sprite, walk: [], idle: [] }
    // Mantém o passo em que estava (o mesmo quadro na lista nova), para o desenho não pular para o "parado".
    const cur = this.anim.sprite.texture, w = this.anim.walk.indexOf(cur), i = this.anim.idle.indexOf(cur)
    this.anim.walk = anim.walk
    this.anim.idle = anim.idle
    this.anim.sprite.texture = (w >= 0 ? anim.walk[w] : i >= 0 ? anim.idle[i] : undefined) ?? anim.idle[0] ?? anim.walk[0] ?? cur
    this.syncLayers()
  }

  /** Acessórios no quadro do corpo (chamado a cada passo; quem troca a textura do corpo por fora chama também). */
  syncLayers() {
    if (!this.layers.length) return
    const body = (this.anim?.sprite ?? this.body.children[0]) as Sprite | undefined
    for (const l of this.layers) {
      if (body) syncLayer(body, this.anim, l)
      else l.sprite.visible = false
    }
  }

  update(dt: number) {
    this.step(dt)
    this.syncLayers()
  }

  private step(dt: number) {
    if (this.held) return
    if (this.steer) {
      this.t += dt
      const p = this.steer()
      this.node.x = p.x
      this.node.y = p.y
      this.node.zIndex = footZ(p.x, p.y)
      this.body.scale.x = ((p.facing < 0) === this.facesLeft ? 1 : -1) * this.baseScale
      const legs = p.walking ? this.frame(this.anim?.walk, 8) : this.frame(this.anim?.idle, 1.5)
      this.body.y = p.walking ? -Math.abs(Math.sin(this.t * 9)) * (legs ? 1 : 3) : 0
      this.body.rotation = 0
      return
    }
    if (!this.speed) {
      // Parado de vez (colmeia): só os quadros, mais rápidos (asas das abelhas).
      this.t += dt
      this.frame(this.anim?.idle, 5)
      return
    }
    if (this.foot) this.separate(dt)
    this.t += dt
    const s = this.baseScale
    if (this.wait > 0) {
      // Parado: respira devagar (pastando/olhando em volta).
      this.wait -= dt
      this.body.y = 0
      this.body.rotation = 0
      this.body.scale.y = s * (1 + Math.sin(this.t * 2.2) * 0.015)
      this.frame(this.anim?.idle, 1.5)
      if (this.wait <= 0) this.pick()
      return
    }
    const dx = this.tx - this.node.x, dy = this.ty - this.node.y
    const dist = Math.hypot(dx, dy)
    if (dist < 2) {
      this.wait = rand(2, 6)
      return
    }
    const step = Math.min(dist, this.speed * dt)
    const nx = this.node.x + (dx / dist) * step, ny = this.node.y + (dy / dist) * step
    // Rede de segurança: o caminho é conferido a cada ~8 unidades e pode raspar uma quina; nunca entra no bloqueado.
    if ((this.blocked(nx, ny) && !this.blocked(this.node.x, this.node.y)) || this.crowded(nx, ny)) { this.tx = this.node.x; this.ty = this.node.y; this.wait = rand(0.3, 1); return }
    this.node.x = nx
    this.node.y = ny
    // Vira para onde anda; passinho = pulinho + leve gingado.
    const left = dx < 0
    this.body.scale.x = (left === this.facesLeft ? 1 : -1) * s
    this.body.scale.y = s
    // Com quadros de caminhada as pernas já mexem: o gingado fica sutil.
    const legs = this.frame(this.anim?.walk, 8)
    this.body.y = -Math.abs(Math.sin(this.t * 9)) * (legs ? 1 : 3)
    this.body.rotation = Math.sin(this.t * 9) * (legs ? 0.015 : 0.04)
    this.node.zIndex = footZ(this.node.x, this.node.y)
  }

  /** Troca o quadro do sprite; devolve false se não há quadros desse tipo. */
  private frame(list: Texture[] | undefined, fps: number) {
    if (!this.anim || !list?.length) return false
    const i = Math.floor(this.t * fps) % list.length
    const tex = list[i]
    if (this.anim.sprite.texture !== tex) this.anim.sprite.texture = tex
    return true
  }

  /** Novo lugar (bicho solto pelo jogador): passa a passear em `area`, a partir de `at` (ou de um ponto livre dela). */
  setArea(area: Area, at?: { x: number; y: number }) {
    this.area = area
    this.home = null
    const p = at ?? this.roomPoint() ?? { x: (area.x0 + area.x1) / 2, y: (area.y0 + area.y1) / 2 }
    this.node.position.set(p.x, p.y)
    this.node.zIndex = footZ(p.x, p.y)
    this.tx = p.x
    this.ty = p.y
    this.wait = rand(1, 2.5)
    this.body.y = 0
    this.body.rotation = 0
  }

  /**
   * Ficou em chão bloqueado (ex.: um enfeite posto onde ele estava) ou em cima de um bicho que não anda
   * (a colmeia, criada depois dele): vai para um ponto livre da área. Encostado na colmeia ele não sai
   * sozinho, porque todo passo que a contorna chega mais perto dela.
   */
  unstick() {
    if (this.held) return
    const onStill = !!this.speed && this.flock.some((o) => o !== this && !o.speed && !o.node.destroyed
      && groundDist(this.node.x, this.node.y, o.node.x, o.node.y) < (this.foot + o.foot) * 1.15)
    if (this.blocked(this.node.x, this.node.y) || onStill) this.setArea(this.home ?? this.area)
  }

  /**
   * Corrida dirigida (o cachorro indo morder o ladrão): vai reto até (x, y) sem desviar, com as patas
   * mais rápidas. Chame com `held = true` para o passeio normal não brigar com a corrida. true = chegou.
   */
  dash(dt: number, x: number, y: number, speed: number): boolean {
    const done = this.dashStep(dt, x, y, speed)
    this.syncLayers()
    return done
  }

  private dashStep(dt: number, x: number, y: number, speed: number): boolean {
    this.t += dt
    const dx = x - this.node.x, dy = y - this.node.y
    const dist = Math.hypot(dx, dy)
    if (dist < 2) {
      this.body.y = 0
      this.body.rotation = 0
      this.frame(this.anim?.idle, 1.5)
      return true
    }
    const step = Math.min(dist, speed * dt)
    this.node.x += (dx / dist) * step
    this.node.y += (dy / dist) * step
    this.body.scale.x = ((dx < 0) === this.facesLeft ? 1 : -1) * this.baseScale
    const legs = this.frame(this.anim?.walk, 16)
    this.body.y = -Math.abs(Math.sin(this.t * 16)) * (legs ? 2 : 4)
    this.node.zIndex = footZ(this.node.x, this.node.y)
    return false
  }

  /** Pulinho de reação ao toque. */
  hop() {
    this.wait = Math.max(this.wait, 1.2)
    this.body.y = -10
  }
}

/** Quanto a área cresce (no mundo) em cada tentativa de achar uma vizinha com chão livre. */
const NEIGHBOR_GROW = [50, 100, 160]
const notBehindField = (x: number, y: number) => !behindField(x, y)

const rand = (a: number, b: number) => a + Math.random() * (b - a)
