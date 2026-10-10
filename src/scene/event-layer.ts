// Evento sazonal na cena (Evolução 09): a tigela de doces na frente da casa e os visitantes (fantasminha,
// zumbizinho) passeando. Evolução 13: objetos do evento (árvore de Natal, boneco de neve, baú, ovo gigante, Coelho
// Mágico) e os bichos de evento ganhos (coelho, gata, galinha), que ficam na fazenda o ano todo. Arte do lote S (public/art/event/<evento>/), carregada só quando há evento.
import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js'
import { bowlSrc, type BowlLook } from '@/game/events'
import { footZ } from './depth-order'
import { bindHover, type HoverFx } from './hoverFx'
import { Wanderer, type Area, type Blocked } from './wander'

/** Objeto do evento parado na fazenda (Evolução 13): a árvore de Natal (build), o boneco/baú/ovo gigante (help) e o
 *  Coelho Mágico (npc, 1º quadro da folha). Tocar abre a janela do evento na aba certa. */
export type SceneProp = { id: 'build' | 'help' | 'npc'; src: string; sheet?: boolean }
/** Bicho de evento (E14) que passeia na fazenda de quem ganhou: folha 4×2 como a dos visitantes. */
export type ScenePet = { id: string; src: string; line: string }

export type SceneEvent = {
  dir: string // public/art/event/<evento>
  bowl: BowlLook | null
  bowlArt?: string // prefixo da tigela (padrão "tigela"; "saco" no Carnaval, "pipoqueira" na Festa Junina)
  critters: { left: number; kinds: { id: string; line: string }[] } | null
  props?: SceneProp[]
  pets?: ScenePet[]
} | null

/** Pé da tigela no mundo: na frente da casa, à esquerda (fora da roça, do cercado e da área das galinhas). */
export const BOWL_SPOT = { x: -385, y: 40, w: 64 }
/**
 * Onde os visitantes passeiam: o gramado ao lado da casinha (fantasminhas) e o à esquerda da casa, na frente da
 * árvore (zumbizinhos). Antes os zumbizinhos usavam a frente da cerca, a mesma área dos porcos, já apertada pela
 * decoração (QA nível máximo, 4ª rodada). O gramado à esquerda do cercado é faixa de enfeite na borda da fazenda;
 * este fica fora das faixas (decor-grid) e de todas as áreas dos bichos.
 */
export const EVENT_AREAS: Area[] = [
  { x0: 325, y0: -145, x1: 400, y1: -95 },
  { x0: -425, y0: -110, x1: -355, y1: -5 },
]
const CRITTER_W = 62
/** Pé de cada objeto do evento e a largura na tela. O de ajuda fica no lugar da tigela (nenhum evento tem os dois). */
const PROP_SPOTS: Record<SceneProp['id'], { x: number; y: number; w: number }> = {
  help: { x: BOWL_SPOT.x, y: BOWL_SPOT.y, w: 72 },
  build: { x: -400, y: -48, w: 84 },
  // Coelho Mágico (só a Páscoa tem oficina; só o Natal tem árvore): o lugar da árvore. Em (−330, −20) o pé ficava
  // dentro do chão da casa e ele aparecia em cima da base dela (QA nível máximo, 6ª rodada).
  npc: { x: -400, y: -48, w: 70 },
}

type Critter = { w: Wanderer; n: number; line: string }

/** Folha 4×2 de células 256×256 (lote S): linha de cima caminhada, linha de baixo parado. */
function sheetFrames(sheet: Texture) {
  const cell = sheet.width / 4
  const at = (c: number, r: number) => new Texture({ source: sheet.source, frame: new Rectangle(sheet.frame.x + c * cell, sheet.frame.y + r * cell, cell, cell) })
  return { walk: [0, 1, 2, 3].map((c) => at(c, 0)), idle: [0, 1].map((c) => at(c, 1)) }
}

export class EventLayer {
  private bowl: Sprite | null = null
  private critters: Critter[] = []
  private props = new Map<string, Sprite>()
  private pets: Wanderer[] = []
  private propsKey = ''
  private petsKey = ''
  private key = ''
  private tex = new Map<string, Texture>()
  onBowlTap: () => void = () => {}
  /** Toque no visitante `n`: a página pede ao servidor; se der certo, chama shoo(n). */
  onCritterTap: (n: number) => void = () => {}
  /** Toque num objeto do evento (árvore, boneco, baú, ovo, Coelho Mágico). */
  onPropTap: (id: SceneProp['id']) => void = () => {}
  /** Toque num bicho de evento: a cena mostra a fala. */
  onPetTap: (x: number, y: number, line: string) => void = () => {}

  /**
   * `flock` é o rebanho da cena: os visitantes entram nele, então eles e os bichos desviam uns dos outros (antes o
   * zumbizinho andava por cima dos porcos), e a cena os faz andar junto com os bichos.
   */
  constructor(
    private layer: Container, private blocked: Blocked, private tapOk: () => boolean, private calm: boolean, private flock: Wanderer[],
    private hover?: HoverFx, private hoverOk: () => boolean = () => true,
  ) {}

  /** Destaque de clicável (hoverFx.ts), igual ao dos bichos da fazenda. */
  private hoverable(node: Container, fx?: Container) {
    if (this.hover) bindHover(this.hover, node, () => ({ fx }), (k) => (k === 'tap' ? this.tapOk() : this.hoverOk()))
  }

  private async load(url: string): Promise<Texture | null> {
    if (this.tex.has(url)) return this.tex.get(url)!
    try {
      const t = await Assets.load<Texture>(url)
      this.tex.set(url, t)
      return t
    } catch { return null }
  }

  /** Chão ocupado pela tigela (os bichos desviam). */
  occupied(x: number, y: number) {
    if (this.bowl && Math.hypot(x - BOWL_SPOT.x, (y - BOWL_SPOT.y) * 2) < BOWL_SPOT.w * 0.6) return true
    for (const id of this.props.keys()) {
      const p = PROP_SPOTS[id as SceneProp['id']]
      if (Math.hypot(x - p.x, (y - p.y) * 2) < p.w * 0.6) return true
    }
    return false
  }

  async set(ev: SceneEvent) {
    void this.setProps(ev?.props ?? [])
    void this.setPets(ev?.pets ?? [])
    const key = ev ? `${ev.dir}|${ev.bowlArt ?? ''}|${ev.bowl}|${ev.critters?.left ?? 0}` : ''
    if (key === this.key) return
    const prevDir = this.key.split('|')[0]
    this.key = key
    if (!ev) { this.clearEvent(); return }
    if (prevDir !== ev.dir) this.clearEvent()
    // Tigela: troca só a textura (vazia, pela metade, cheia).
    if (ev.bowl) {
      const t = await this.load(bowlSrc(ev.dir, ev.bowlArt, ev.bowl))
      if (t && this.key === key) {
        if (!this.bowl) {
          const sp = new Sprite(t)
          sp.anchor.set(96 / 192, 172 / 176)
          sp.scale.set(BOWL_SPOT.w / t.width)
          sp.position.set(BOWL_SPOT.x, BOWL_SPOT.y)
          sp.zIndex = footZ(BOWL_SPOT.x, BOWL_SPOT.y)
          sp.eventMode = 'static'
          sp.cursor = 'pointer'
          sp.on('pointertap', () => { if (this.tapOk()) this.onBowlTap() })
          this.hoverable(sp)
          this.layer.addChild(sp)
          this.bowl = sp
        } else this.bowl.texture = t
      }
    } else if (this.bowl) { this.bowl.destroy(); this.bowl = null }
    // Visitantes: só cria os que faltam (os espantados saem por shoo).
    const want = ev.critters ? ev.critters.left : 0
    while (this.critters.length > want) this.remove(this.critters[this.critters.length - 1])
    for (let n = this.critters.length; n < want; n++) {
      const kind = ev.critters!.kinds[n % ev.critters!.kinds.length]
      const sheet = await this.load(`${ev.dir}/${kind.id}_sheet.png`)
      if (!sheet || this.key !== key) return
      this.add(n, sheet, kind.line)
    }
  }

  /** Objetos do evento: recria só quando a arte de algum muda (nível da árvore, boneco pronto, baú aberto). */
  private async setProps(props: SceneProp[]) {
    const key = props.map((p) => `${p.id}:${p.src}`).join('|')
    if (key === this.propsKey) return
    this.propsKey = key
    for (const sp of this.props.values()) sp.destroy()
    this.props.clear()
    for (const p of props) {
      const t = await this.load(p.src)
      if (!t || this.propsKey !== key) continue
      const spot = PROP_SPOTS[p.id]
      const tex = p.sheet ? sheetFrames(t).idle[0] : t
      const sp = new Sprite(tex)
      // Pé da arte: árvore 256×320 (pé em 316), objetos 192×192 (pé em 188), folha 256×256 (pé em 250).
      sp.anchor.set(0.5, p.sheet ? 250 / 256 : tex.height >= 300 ? 316 / 320 : 188 / 192)
      sp.scale.set((spot.w * (p.sheet ? 1.25 : 1)) / tex.width)
      sp.position.set(spot.x, spot.y)
      sp.zIndex = footZ(spot.x, spot.y)
      sp.eventMode = 'static'
      sp.cursor = 'pointer'
      sp.on('pointertap', () => { if (this.tapOk()) this.onPropTap(p.id) })
      this.hoverable(sp)
      this.layer.addChild(sp)
      this.props.set(p.id, sp)
    }
  }

  /** Bichos de evento (E14): passeiam no gramado dos visitantes; tocar mostra a fala. */
  private async setPets(pets: ScenePet[]) {
    const key = pets.map((p) => p.id).join('|')
    if (key === this.petsKey) return
    this.petsKey = key
    for (const w of this.pets) { this.flock.splice(this.flock.indexOf(w), 1); w.node.destroy({ children: true }) }
    this.pets = []
    for (const [i, p] of pets.entries()) {
      const sheet = await this.load(p.src)
      if (!sheet || this.petsKey !== key) continue
      const { walk, idle } = sheetFrames(sheet)
      const sprite = new Sprite(idle[0])
      sprite.anchor.set(0.5, 250 / 256)
      sprite.scale.set((CRITTER_W * 1.25) / 256)
      const body = new Container()
      body.addChild(sprite)
      const node = new Container()
      node.addChild(body)
      node.eventMode = 'static'
      node.cursor = 'pointer'
      const w = new Wanderer(node, body, EVENT_AREAS[(i + 1) % EVENT_AREAS.length], 18, true, { sprite, walk, idle }, this.blocked, this.flock, 18)
      node.on('pointertap', () => { if (this.tapOk()) this.onPetTap(node.x, node.y - CRITTER_W, p.line) })
      this.hoverable(node, body)
      this.flock.push(w)
      this.layer.addChild(node)
      this.pets.push(w)
    }
  }

  private add(n: number, sheet: Texture, line: string) {
    const { walk, idle } = sheetFrames(sheet)
    const sprite = new Sprite(idle[0])
    sprite.anchor.set(0.5, 250 / 256)
    sprite.scale.set((CRITTER_W * 1.25) / 256) // a figura ocupa ~2/3 da célula
    const body = new Container()
    body.addChild(sprite)
    const node = new Container()
    node.addChild(body)
    node.eventMode = 'static'
    node.cursor = 'pointer'
    const w = new Wanderer(node, body, EVENT_AREAS[n % EVENT_AREAS.length], 22, true, { sprite, walk, idle }, this.blocked, this.flock, 18)
    this.flock.push(w)
    this.layer.addChild(node)
    const c = { w, n, line }
    node.on('pointertap', () => { if (this.tapOk()) this.onCritterTap(n) })
    this.hoverable(node, body)
    this.critters.push(c)
  }

  private remove(c: Critter) {
    this.critters = this.critters.filter((x) => x !== c)
    this.flock.splice(this.flock.indexOf(c.w), 1)
    c.w.node.destroy({ children: true })
  }

  /** Visitante espantado: fala, sobe e some. */
  shoo(n: number, tweens: ((dt: number) => boolean)[]) {
    const c = this.critters.find((x) => x.n === n) ?? this.critters[this.critters.length - 1]
    if (!c) return
    this.critters = this.critters.filter((x) => x !== c)
    this.flock.splice(this.flock.indexOf(c.w), 1)
    const node = c.w.node
    node.eventMode = 'none'
    let t = 0
    tweens.push((dt) => {
      if (node.destroyed) return false
      t += dt
      node.alpha = Math.max(0, 1 - t / 0.6)
      if (!this.calm) node.y -= 60 * dt
      if (t >= 0.6) { node.destroy({ children: true }); return false }
      return true
    })
    // Uma pessoa a menos: o próximo set() (com left − 1) não cria de novo.
    this.key = this.key.replace(/\|\d+$/, `|${this.critters.length}`)
  }

  /** Fala do visitante (antes de sumir). */
  lineOf(n: number) { return this.critters.find((x) => x.n === n)?.line ?? '' }
  pointOf(n: number) { const c = this.critters.find((x) => x.n === n); return c ? { x: c.w.node.x, y: c.w.node.y - CRITTER_W } : null }
  get bowlPoint() { return this.bowl ? { x: BOWL_SPOT.x, y: BOWL_SPOT.y - BOWL_SPOT.w * 0.8 } : null }

  private clearEvent() {
    this.bowl?.destroy()
    this.bowl = null
    for (const c of [...this.critters]) this.remove(c)
  }

  clear() {
    this.clearEvent()
    void this.setProps([])
    void this.setPets([])
  }
}
