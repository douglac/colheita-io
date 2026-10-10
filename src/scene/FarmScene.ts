// Cena da fazenda em PixiJS. Toda a arte é desenhada em código (placeholder próprio).
// Sem isto o Pixi 8 gera código com new Function, e a CSP do site (next.config.ts) bloqueia eval.
import 'pixi.js/unsafe-eval'
import { Application, Container, Graphics, Sprite, Text, Texture, TilingSprite } from 'pixi.js'
import { SEED_BY_ID } from '@/game/catalog'
import { DOG_BREEDS } from '@/game/config'
import { RIPE_STAGE } from '@/game/rules'
import { animKeys, ART_TILE_W, CROP_ANCHOR, cropKeys, deferredKeys, frames, GUARD_ART, loadArt, loadKeys, loadSeriesArt, type ArtBook, type SeriesArt } from './art'
import { diamond, TILE_H, TILE_W } from './iso'
import { DEFAULT_HERD, defaultArea, FOOT, herdIds, kindOf, pastureBlockedFast, roamArea, type AnimalId, type AnimalKind, type HerdKind, type Spots } from '@/game/pasture'
import { AnimalDrag, type Critter } from './animal-drag'
import { layerOrder } from './layers'
import { DOG_AREA, FENCE, PEN_ART_SCALE, PEN_PIECES, plotPos, PROPS, propTexture, sceneBounds, TREES } from './layout'
import { fenceSlices, footZ, plotFootZ } from './depth-order'
import { bindHover, HoverFx, overHtml } from './hoverFx'
import { Wanderer, type Anim } from './wander'
import { cropShadow, opaqueTopFrac, PLOT_SIDE, plotHitArea, plotHitPolygon, ShadowLayer } from './depth'
import { MOUND_RIM, SoilField, type SoilVariant } from './soil'
import { Lighting } from './lighting'
import { Backdrop, HORIZON } from './backdrop'
import { Particles, type Burst } from './particles'
import { Wind } from './wind'
import { patrolAt } from '@/game/patrol'
import { ACCESSORY_BY_ID, accSprite, type Look } from '@/game/livestock'
import { DEFAULT_SLOTS, type Slots } from '@/game/decor'
import { animalOnOrnament, cellAt, FIXED_ORNAMENT, PATH_STEP, pathCellOf, type Placed } from '@/game/decor-grid'
import { DecorLayer, ornamentBase, type DecorEvent, type SceneEdit } from './decor-layer'
import { EventLayer, type SceneEvent } from './event-layer'
import { PLOT_BUBBLE, PLOT_BUBBLE_ART } from './bubble-style'


// Geometria (lotes, obstáculos, áreas, cerca, enquadramento) em ./layout.ts
export { DOG_AREA, farmBlocked } from './layout'

export type ScenePlot = {
  idx: number
  state: 'empty' | 'growing' | 'ripe' | 'withered' | 'locked' // locked = terreno à venda
  seedId?: string
  stage?: number
  progress?: number // 0..1
  canSteal?: boolean
  pests?: number
  weeds?: number
  dry?: boolean
}

// patrol: semente e casa da patrulha (patrol.ts); o servidor decide a mordida pela mesma conta.
// clock: serverNow − Date.now(), para o cachorro da tela olhar para o mesmo lado que o do servidor.
export type SceneDog = { awake: boolean; breed?: string; patrol?: { seed: string; home: { x: number; y: number } }; clock?: number } | null
/** Idade do desenho e acessórios de cada bicho (servidor: AnimalView.look e FarmPayload.wear). */
/** `ready`: slots com o lote pronto (o adereço do bicho mostra o produto: ninho, balde e cesto cheios). */
export type SceneLooks = { looks: Partial<Record<string, Look>>; wear: Record<string, string[]>; ready?: string[] }

export { plotCell } from './layout'

export class FarmScene {
  private app = new Application()
  private world = new Container()
  // Terra da roça num bloco só (soil.ts), ABAIXO da camada do pé: a terra do lote da frente
  // nunca cobre a planta do lote de trás, e a lateral só aparece no contorno da roça.
  private soil = new SoilField()
  /**
   * Camada do pé (Evolução 31, depth-order.ts): plantas dos lotes, bichos, guarda, enfeites, casa, casinha, árvores,
   * cercas, adereços, carroça e objetos do evento, ordenados pelo zIndex do pé. O Pixi só reordena quando algum muda.
   */
  private depthLayer = new Container()
  /** Por cima da camada do pé: os marcadores dos lotes (✓, ✋, 💧, ⛏) e a barra de crescimento. */
  private markLayer = new Container()
  private plotMarks = new Map<number, Container>()
  private trees: Sprite[] = []
  /** Cerca da frente da roça: fatias (ou trechos do desenho provisório) na camada do pé. */
  private fieldFence: Container[] = []
  private dogNode: Container | null = null
  private plotNodes = new Map<number, Container>()
  private plotKeys = new Map<number, string>()
  private ready = false
  private destroyed = false
  private pending: { plots: ScenePlot[]; visiting: boolean; farm: string } | null = null
  private farm = ''
  private lastPlots = new Map<number, ScenePlot>()
  private hovered: number | null = null
  private art: ArtBook = {}
  private animals: Wanderer[] = []
  private dogWanderer: Wanderer | null = null
  private calm = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  /** Destaque de clicável (hoverFx.ts): bichos, casinha, lotes e objetos do evento. */
  private hover = new HoverFx(!!this.calm)
  // Profundidade e luz.
  private shadows = new ShadowLayer()
  private lighting = new Lighting(this.world)
  private backdrop: Backdrop | null = null
  private particles = new Particles(!this.calm)
  private wind = new Wind()
  /** false = lotes, bichos, casas, enfeites e evento não recebem toque, hover nem cursor (vitrine). Vale antes do mount. */
  objectInput = true
  /** false = sem arrastar nem zoom (pinça/roda). Vale antes do mount. */
  cameraInput = true
  onPlotTap: (idx: number) => void = () => {}
  onPlotHover: (idx: number | null, x: number, y: number) => void = () => {}
  /** Primeiro quadro com a fazenda desenhada (a tela de carregamento da visita sai só aqui: sem o quadro verde vazio). */
  onShown: () => void = () => {}
  onDogTap: () => void = () => {}
  /** Toque no bicho do rebanho (colher, roubar, alimentar, ficha). true = a página tratou: não cutuca. */
  onAnimalTap: (id: AnimalId) => boolean = () => false
  /** Mouse em cima do bicho (balão: alimento, estágio, produção). */
  onAnimalHover: (id: AnimalId | null, x: number, y: number) => void = () => {}
  /** Som do bicho: cutucar (toque rápido) ou pegar (segurou e levantou). */
  onAnimalSfx: (kind: AnimalKind, act: 'poke' | 'pick', breed?: string) => void = () => {}
  /** Bicho solto num lugar válido (o dono arrumou a fazenda): salvar no servidor. */
  onAnimalMove: (id: AnimalId, x: number, y: number) => void = () => {}
  /** Modo edição da decoração: pôr, mover, pintar, apagar, escolher (a página fala com o servidor). */
  onDecor: (ev: DecorEvent) => void = () => {}
  // Decoração (frente J): peças da série nos lugares fixos e enfeites/caminhos soltos na grade.
  private decor: DecorLayer | null = null
  private slots: Slots = { ...DEFAULT_SLOTS }
  private slotsKey = ''
  private pendingDecor: { slots: Slots; placed: Placed[] } | null = null
  private edit: SceneEdit = null
  private houseC = new Container()
  private penSprites: Sprite[] = []
  private fixedOrnament: Container | null = null
  private houseGlows: Sprite[] = []
  private doghouseNode: Sprite | null = null
  /** Chão onde o bicho não pisa: o de sempre (pasture.ts) e os enfeites da decoração. */
  private walkBlocked = (x: number, y: number) => pastureBlockedFast(x, y) || (this.decor?.blocked(x, y) ?? false) || (this.eventLayer?.occupied(x, y) ?? false)
  // Evento sazonal (Evolução 09): tigela de doces e visitantes. Toques vão para a página.
  private eventLayer: EventLayer | null = null
  private pendingEvent: SceneEvent | undefined
  onBowlTap: () => void = () => {}
  onCritterTap: (n: number) => void = () => {}
  onPropTap: (id: 'build' | 'help' | 'npc') => void = () => {}
  // Por cima de tudo: balões dos lotes e números da mordida.
  private overlay = new Container()
  private tweens: ((dt: number) => boolean)[] = []
  private bubbles = new Map<number, Container>()
  private dogBusy = false
  private critters = new Map<AnimalId, Critter>()
  private spots: Spots = {}
  private spotsKey = ''
  private editable = false // fazenda própria: dá para mudar bicho de lugar
  private dogBreed: string | undefined
  private dogAttack: { sprite: Sprite; tex: Texture; idle: Texture[] } | null = null
  private pokedAt = new Map<AnimalId, number>()
  private drag = new AnimalDrag({
    toWorld: (p) => this.world.toLocal(p),
    canDrag: (c) => this.editable && !c.asleep && !this.edit,
    calm: () => !!this.calm,
    onPick: (c) => { this.longPressed = true; this.onAnimalSfx(kindOf(c.id), 'pick', this.dogBreed) },
    onDenied: (c) => { this.longPressed = true; this.say(c, c.asleep ? 'Zzz…' : 'Só o dono\nmuda de lugar') },
    onDrop: (c, x, y) => { this.spots = { ...this.spots, [c.id]: { x, y } }; this.placed.set(c.id, `${x},${y}`); this.onAnimalMove(c.id, x, y) },
    onReject: (c, reason) => this.say(c, reason),
    extraCheck: (c, x, y) => (this.decor && animalOnOrnament(c.id, x, y, this.decor.placed) ? 'Em cima do enfeite não dá' : null),
  })

  async mount(el: HTMLElement) {
    // Celular: menos pixels e sem antialias (sprites não precisam) = menos GPU e bateria.
    const mobile = window.matchMedia('(pointer: coarse)').matches
    await this.app.init({
      resizeTo: el, backgroundAlpha: 0, antialias: !mobile, autoDensity: true,
      resolution: Math.min(window.devicePixelRatio, mobile ? 1.5 : 2), ...(mobile ? { powerPreference: 'low-power' as const } : {}),
    })
    if (mobile) this.app.ticker.maxFPS = 30
    this.art = await loadArt()
    // Das culturas e das idades/acessórios dos bichos, já entra só o que esta fazenda mostra agora; o resto vem depois.
    await loadKeys(this.art, [...this.cropsOf(this.pending?.plots ?? []), ...this.looksArt(this.pendingLooks)])
    if (this.destroyed) { this.app.destroy(true); return }
    this.artLoaded = true
    el.appendChild(this.app.canvas)
    // Gramado cobre o canvas inteiro (fora do mundo, que só escala o cenário).
    // Gramado DENTRO do mundo: anda junto ao arrastar e acompanha o zoom. Textura espelhada 2×2
    // (repete sem emenda), grande o bastante para cobrir qualquer enquadramento da câmera.
    const tile = this.art.ground_tile
    if (tile) {
      // Céu e morros atrás; o gramado começa no horizonte e cobre a base dos morros.
      this.backdrop = new Backdrop(this.art.tree)
      this.world.addChild(this.backdrop.far)
      const g = new TilingSprite({ texture: tile, width: 6000, height: 4000 })
      g.anchor.set(0.5, 0)
      g.y = HORIZON
      g.tileScale.set(0.75)
      this.world.addChild(g, this.backdrop.edge)
    } else this.world.addChild(this.drawGround())
    // Sombras logo acima do gramado; a do bloco de terra vem junto com a terra (soil.ts). Por cima da terra, a camada
    // do pé (tudo que tem altura); acima dela, marcadores dos lotes, prévia da decoração, partículas e balões.
    this.depthLayer.sortableChildren = true
    this.drawTrees()
    this.drawHouse()
    // Decoração solta: caminhos no chão (abaixo das sombras), grade do modo edição e, por cima, a prévia.
    this.decor = new DecorLayer(this.depthLayer, this.art)
    this.world.addChild(this.decor.ground, this.decor.grid, this.shadows, this.soil, this.depthLayer, this.markLayer,
      this.decor.ghost, this.particles, this.overlay)
    // Cenário que nunca recebe toque fica fora do teste de toque do Pixi (feito a cada movimento do ponteiro).
    for (const c of [...this.world.children.filter((c) => c !== this.depthLayer)]) {
      c.eventMode = 'none'
      c.interactiveChildren = false
    }
    this.addStaticShadows()
    // Cercado e adereços (lote J): ordenados pelo pé, como os bichos.
    this.drawPen()
    this.drawProps()
    this.eventLayer = new EventLayer(this.depthLayer, this.walkBlocked, () => this.tapOk() && !this.edit, !!this.calm, this.animals, this.hover, () => !this.edit && !this.panning())
    this.eventLayer.onBowlTap = () => this.onBowlTap()
    this.eventLayer.onCritterTap = (n) => this.onCritterTap(n)
    this.eventLayer.onPropTap = (id) => this.onPropTap(id)
    this.eventLayer.onPetTap = (x, y, line) => this.floatOver(x, y, line, 0x7a3fc4)
    if (this.pendingEvent !== undefined) void this.eventLayer.set(this.pendingEvent)
    this.applySlots(this.pendingDecor?.slots ?? this.slots, true)
    if (this.pendingDecor) this.decor.set(this.pendingDecor.placed)
    // Bichos de enfeite (só entram se a arte existir): o rebanho do dono (setHerd); até chegar, o de sempre.
    this.setHerd(this.pendingHerd ?? herdIds(DEFAULT_HERD))
    if (this.pendingLooks) this.setLooks(this.pendingLooks)
    this.app.ticker.add((t) => {
      const dt = Math.min(0.05, t.deltaMS / 1000)
      this.drag.update(dt) // bicho voltando de lugar proibido: anima mesmo com movimento reduzido (é curto e funcional)
      this.tweens = this.tweens.filter((f) => f(dt)) // balões, "−N ouro" e a corrida do cachorro (cada um sabe do movimento reduzido)
      this.shadows.sync() // a sombra acompanha o bicho na mão também com movimento reduzido
      this.hover.update(dt) // o destaque de clicável (com movimento reduzido: só o tom e o contorno, sem o pulinho)
      // A patrulha do cachorro é regra (de frente/de costas decide a mordida): roda mesmo com movimento reduzido.
      if (this.dogWanderer?.steer) this.dogWanderer.update(dt)
      if (this.calm) return
      for (const a of this.animals) a.update(dt) // inclui os visitantes do evento
      if (!this.dogWanderer?.steer) this.dogWanderer?.update(dt)
      const secs = performance.now() / 1000
      this.bobbers = this.bobbers.filter((b) => !b.node.destroyed)
      for (const b of this.bobbers) {
        b.node.y = -78 + Math.sin(secs * 3 + b.phase) * 4
        if (b.pulse) b.node.scale.set(1 + Math.max(0, Math.sin(secs * 4 + b.phase)) * 0.12)
      }
      this.wind.update(secs)
      this.particles.update(dt)
      this.backdrop?.update(dt)
    })
    this.app.stage.addChild(this.world, this.lighting.lights)
    this.lighting.start()
    this.app.renderer.on('resize', () => this.layout())
    // A câmera (attachGestures) escuta o canvas direto, fora do Pixi: continua andando sem os objetos.
    if (!this.objectInput) lockObjects(this.app.stage)
    if (this.cameraInput) this.attachGestures(this.app.canvas)
    this.ready = true
    // QA no navegador: window.__farm dá acesso à cena. Em dev sempre; no build de produção só com ?perf=1 (medir o
    // toque no build real, scripts/qa/perf.mjs --prod). A cena é só desenho: o servidor confere toda ação.
    if (process.env.NODE_ENV === 'development' || new URLSearchParams(location.search).has('perf')) Object.assign(window, { __farm: this })
    this.layout()
    if (this.pending) this.setPlots(this.pending.plots, this.pending.visiting, this.pending.farm)
    if (this.pendingDog !== undefined) this.setDog(this.pendingDog)
    this.placeAnimals()
    // Dois quadros: o 1º render do Pixi (no ticker) já foi para a tela.
    requestAnimationFrame(() => requestAnimationFrame(() => { if (!this.destroyed) this.onShown() }))
    // Resto da arte em segundo plano, 4 downloads por vez (deixa a rede livre para as ações do jogador).
    setTimeout(() => void loadKeys(this.art, deferredKeys(), 4).then(() => this.refreshArt()), 1500)
  }

  /** Chaves de cultura que faltam para desenhar esses lotes. */
  private cropsOf(plots: ScenePlot[]): string[] {
    const seeds = new Set(plots.map((p) => p.seedId).filter((id): id is string => !!id && !this.art[`${id}_0`]))
    return [...seeds].flatMap(cropKeys)
  }

  /** Desenhos de idade e de acessório que essa aparência usa. */
  private looksArt(l: SceneLooks | null): string[] {
    if (!l) return []
    const out: string[] = []
    for (const [id, look] of Object.entries(l.looks)) if (look && look !== 'adult') out.push(...animKeys(`${kindOf(id as AnimalId)}_${look}`))
    for (const accs of Object.values(l.wear)) for (const a of accs) if (ACCESSORY_BY_ID[a]) out.push(...animKeys(accSprite(ACCESSORY_BY_ID[a])))
    return out
  }

  /** Chegou arte nova: redesenha lotes e bichos que estavam no desenho provisório. */
  private refreshArt() {
    if (this.destroyed || !this.ready) return
    this.plotKeys.clear()
    if (this.plotArgs) this.setPlots(this.plotArgs.plots, this.plotArgs.visiting, this.plotArgs.farm)
    this.looksKey = ''
    if (this.lastLooks) this.setLooks(this.lastLooks)
  }

  private plotArgs: { plots: ScenePlot[]; visiting: boolean; farm: string } | null = null
  private lastLooks: SceneLooks | null = null
  private cropsLoading = new Set<string>()

  private pendingDog: SceneDog | undefined
  private dogClock = 0

  /** Cachorro ao lado da casinha. Sem ração ele dorme (mais apagado, com "Zz"). */
  private dogKey = ''

  setDog(dog: SceneDog) {
    if (!this.ready) { this.pendingDog = dog; return }
    this.dogClock = dog?.clock ?? 0 // o acerto do relógio muda a cada carregamento: não redesenha o cachorro por isso
    const key = JSON.stringify(dog ? { ...dog, clock: undefined } : dog)
    if (key === this.dogKey) return
    this.dogKey = key
    this.dogBreed = dog?.breed
    const old = this.critters.get('dog')
    if (old) { this.drag.forget(old); this.critters.delete('dog'); this.placed.delete('dog') }
    this.dogNode?.destroy({ children: true })
    this.dogNode = null
    this.doghouseNode?.destroy()
    this.shadows.prune()
    const house = this.makeDoghouse()
    this.doghouseNode = house
    if (house) {
      house.zIndex = footZ(house.x, DOGHOUSE_FOOT_Y) // o cachorro passa atrás ou na frente conforme o pé dele
      // Tocar na casinha também mostra o cachorro (raça, ração e prazo).
      house.eventMode = 'static'
      this.doghouseEvents(house)
      this.depthLayer.addChild(house)
    }
    if (!dog) return
    const c = new Container()
    // Quadros da raça (vira-lata e salsicha são variações de cor; Pastor usa o "dog" original, maior).
    const id = dog.breed && frames(this.art, `dog_${dog.breed}`, 'walk').length ? `dog_${dog.breed}` : 'dog'
    const width = DOG_BREEDS[dog.breed ?? '']?.width ?? 78
    const guard = GUARD_ART[dog.breed ?? '']
    const sleep = frames(this.art, id, 'sleep')
    const made = !dog.awake && sleep.length ? (() => {
      const s = new Sprite(sleep[0]); s.anchor.set(0.5, 0.95); s.scale.set(width / sleep[0].width)
      return { sprite: s, anim: { sprite: s, walk: [], idle: sleep } as Anim }
    })() : this.animalSprite(id, width, guard?.foot)
    const sp = made?.sprite
    // Guarda (cabra, cavalo, avestruz): o quadro "mordendo" entra na corrida até o ladrão (biteTo).
    const attack = this.art[`${id}_attack`]
    this.dogAttack = sp && attack && made?.anim ? { sprite: sp, tex: attack, idle: made.anim.idle } : null
    if (sp) c.addChild(sp)
    else {
      const g = new Graphics()
      g.ellipse(0, -18, 20, 14).fill(0x2b2b2b)
      g.circle(14, -32, 11).fill(0x2b2b2b)
      g.circle(18, -34, 2.5).fill(0xffffff)
      c.addChild(g)
    }
    const node = new Container()
    node.addChild(c)
    node.eventMode = 'static'
    node.cursor = 'pointer'
    this.depthLayer.addChild(node)
    this.dogNode = node
    this.dogWanderer = null
    this.shadows.follow(node, c, width * 0.75)
    if (!dog.awake) {
      // Sem ração: dorme encostado na casinha.
      c.alpha = 0.75
      const z = new Text({ text: 'Zz', style: { fontSize: 18, fill: 0xffffff, fontWeight: '800', stroke: { color: 0x3b2a1a, width: 4 } } })
      z.position.set(14, -86)
      c.addChild(z)
      // Mesmo ponto no nó e no Wanderer parado (antes ele levava o cachorro para (200, −70), atrás das plantas da roça).
      const bed = { x: 165, y: -95 }
      node.position.set(bed.x, bed.y)
      node.zIndex = footZ(bed.x, bed.y)
      this.shadows.sync()
      // Dormindo com quadros: só "respira" (Wanderer parado para sempre).
      if (made?.anim) this.dogWanderer = new Wanderer(node, c, { x0: bed.x, y0: bed.y, x1: bed.x, y1: bed.y }, 0, true, made.anim)
      // Dormindo não sai do lugar, mas dá para cutucar (e o "segurar" avisa que ele está dormindo).
      if (this.dogWanderer) this.critterEvents({ id: 'dog', w: this.dogWanderer, width, asleep: true })
      return
    }
    // Acordado: patrulha em volta da casinha.
    // Quadros novos olham para a esquerda; o sprite antigo (scene/dog.png) olha de frente.
    // Patrulha na frente da casinha, entre ela e a roça (visível também no celular em pé).
    this.dogWanderer = new Wanderer(node, c, DOG_AREA, 45, !!made?.anim, made?.anim, this.walkBlocked)
    // Com a patrulha do servidor, ele anda e vira exatamente como o servidor calcula: de costas para o lote, a
    // mordida quase não acontece.
    if (dog.patrol) {
      const { seed, home } = dog.patrol
      this.dogWanderer.steer = () => patrolAt(seed, home, Date.now() + this.dogClock)
    }
    this.critterEvents({ id: 'dog', w: this.dogWanderer, width })
    this.looksKey = '' // acessórios do cachorro novo
    this.placeAnimals()
    this.shadows.sync()
  }

  /** Sprite do bicho: animado se houver quadros (public/art/animals), senão a imagem parada de scene/. */
  private animalSprite(id: string, width: number, foot = 0.95): { sprite: Sprite; anim?: Anim } | null {
    const walk = frames(this.art, id, 'walk'), idle = frames(this.art, id, 'idle')
    const first = idle[0] ?? walk[0]
    if (first) {
      const sprite = new Sprite(first)
      sprite.anchor.set(0.5, foot)
      sprite.scale.set(width / first.width)
      return { sprite, anim: { sprite, walk, idle } }
    }
    const sp = this.sprite(id, { x: 0.5, y: 0.95 }, width)
    return sp ? { sprite: sp } : null
  }

  private pendingHerd: AnimalId[] | null = null
  private artLoaded = false
  private herdKey = ''

  /**
   * Rebanho do dono (ids com cópias: "cow", "cow2"…). Cria os que faltam e tira os que saíram.
   * Bicho cuja arte não existe fica de fora (sem placeholder no meio do pasto).
   */
  setHerd(ids: AnimalId[]) {
    if (!this.artLoaded) { this.pendingHerd = ids; return }
    const key = ids.join(',')
    if (key === this.herdKey) return
    this.herdKey = key
    const keep = new Set(ids)
    for (const [id, c] of this.critters) {
      if (id === 'dog' || keep.has(id)) continue
      this.drag.forget(c)
      this.critters.delete(id)
      this.placed.delete(id)
      this.animals.splice(this.animals.indexOf(c.w), 1) // no lugar: a camada do evento usa o mesmo array
      c.w.node.destroy({ children: true })
    }
    this.shadows.prune()
    for (const id of ids) if (!this.critters.has(id)) this.addAnimal(id)
    this.placeAnimals()
    // A colmeia nasce depois dos outros bichos e pode cair em cima de um deles: quem ficou ali sai.
    for (const a of this.animals) a.unstick()
  }

  /** Bicho de enfeite passeando na área dele (toque: pulinho e o som do bicho; segurar: pegar e mudar de lugar). */
  private addAnimal(id: AnimalId) {
    const kind = kindOf(id) as HerdKind
    const spec = ANIMAL_SPEC[kind]
    const made = this.animalSprite(kind, spec.width, spec.foot)
    if (!made) return
    const c = new Container()
    c.addChild(made.sprite)
    const node = new Container()
    node.addChild(c)
    node.eventMode = 'static'
    node.cursor = 'pointer'
    // Todos os quadros olham para a esquerda (lotes G e J); a vaca antiga (scene/cow.png) também.
    // `animals` é o rebanho: cada um evita os outros (um não fica em cima do outro).
    // Separação pelo desenho (não só pelos pés): dois bichos não se cobrem.
    const w = new Wanderer(node, c, defaultArea(id), spec.speed, true, made.anim, this.walkBlocked, this.animals, Math.max(FOOT[kind], spec.width * 0.4))
    this.depthLayer.addChild(node)
    this.animals.push(w)
    this.shadows.follow(node, c, spec.width * spec.shadow)
    this.critterEvents({ id, w, width: spec.width })
  }

  /**
   * Cerca do cercado com as peças pen_fence_* (lote J). Cada peça é diagonal, então é fatiada na
   * vertical e cada fatia é ordenada pelo pé da cerca naquele x: o bicho de dentro fica sempre atrás
   * da cerca da frente e na frente da cerca do fundo (com a folga de 14 da cerca em layout.ts).
   */
  private drawPen(series?: SeriesArt) {
    const SLICES = 8
    for (const sp of this.penSprites) sp.destroy()
    this.penSprites = []
    // Peças da série (lote M) quando a cerca equipada não é a do Sítio; senão, as do lote J (frente D).
    const deco = !!(series?.cerca_ne && series.cerca_nw)
    for (const piece of PEN_PIECES) {
      const up = piece.b[1] < piece.a[1] // sobe para a direita = "ne" (ou o portão)
      const tex = deco
        ? (piece.gate ? series!.cerca_portao ?? series!.cerca_ne : up ? series!.cerca_ne : series!.cerca_nw)
        : this.art[piece.gate ? 'pen_fence_gate' : up ? 'pen_fence_ne' : 'pen_fence_nw']
      if (!tex) return
      // Postes na arte. Lote J: ne (64,176)→(192,112); nw (64,112)→(192,176). Lote M: ne (32,164)→(224,68);
      // nw (32,68)→(224,164), passo de 192 px (o portão sobe como o ne).
      const artA = deco ? { x: 32, y: up ? 164 : 68 } : { x: 64, y: up ? 176 : 112 }
      const artB = deco ? { x: 224, y: up ? 68 : 164 } : { x: 192, y: up ? 112 : 176 }
      const k = deco ? Math.hypot(piece.b[0] - piece.a[0], piece.b[1] - piece.a[1]) / Math.hypot(artB.x - artA.x, artB.y - artA.y) : PEN_ART_SCALE
      const ox = piece.a[0] - artA.x * k, oy = piece.a[1] - artA.y * k // canto de cima-esquerda da peça no mundo
      // Pé da cerca no meio de cada fatia (reta entre os dois postes, estendida até as pontas da peça).
      for (const sp of fenceSlices(tex, k, ox, oy, artA, artB, SLICES)) {
        this.depthLayer.addChild(sp)
        this.penSprites.push(sp)
      }
    }
    if (this.penShadows) return
    this.penShadows = true
    for (let i = 0; i < PEN_PIECES.length; i++) {
      const { a } = PEN_PIECES[i]
      this.shadows.place(a[0], a[1] - 2, 12, 5, 0.3)
    }
  }

  private penShadows = false

  /** Ninho, balde de leite e cesto de lã (lote J): decoração fixa, com sombra e ordenada pelo pé. */
  private drawProps() {
    for (const p of PROPS) {
      const sp = this.sprite(p.key, { x: 0.5, y: 0.94 }, p.w)
      if (!sp) continue
      this.propSprites.set(p.key, sp)
      sp.position.set(p.x, p.y)
      sp.zIndex = footZ(p.x, p.y)
      sp.eventMode = 'none'
      this.depthLayer.addChild(sp)
      this.shadows.place(p.x, p.y - 2, p.w * 0.85, p.w * 0.3, 0.3)
    }
  }

  private propSprites = new Map<string, Sprite>()

  /** Adereço cheio quando o bicho dele tem lote pronto (o toque continua no bicho). Sem a variante, fica o vazio. */
  private fillProps(ready: readonly string[]) {
    for (const p of PROPS) {
      const sp = this.propSprites.get(p.key)
      const tex = this.art[propTexture(p, ready)] ?? this.art[p.key]
      if (sp && tex && sp.texture !== tex) sp.texture = tex
    }
  }

  /** Toque rápido = cutucar (ou a ação do bicho: colher, roubar, alimentar); segurar = pegar e mudar de lugar. */
  private critterEvents(c: Critter) {
    this.critters.set(c.id, c)
    const node = c.w.node
    node.on('pointertap', () => {
      if (!this.tapOk() || this.edit) return
      if (c.id !== 'dog' && this.onAnimalTap(c.id)) return
      this.poke(c)
    })
    if (c.id !== 'dog') {
      node.on('pointerover', (e) => this.onAnimalHover(c.id, e.global.x, e.global.y))
      node.on('pointerout', () => this.onAnimalHover(null, 0, 0))
    }
    // Destaque no corpo (com os acessórios); o pulinho no nó dos pés, que o passeio e o arrasto não escalam.
    bindHover(this.hover, node, () => ({ fx: c.w.body, light: this.lightCritter(c.id) }), (k) => this.hoverOk(k))
    node.on('pointerdown', (e) => {
      if (this.pointers.size <= 1) this.drag.press(c, e.pointerId, { x: e.global.x, y: e.global.y }, e.pointerType === 'touch')
    })
  }

  /** Destaque pode agora? Não no modo editar nem arrastando a câmera; no toque, só se o toque valeu. */
  private hoverOk(kind: 'hover' | 'tap') {
    return !this.edit && (kind === 'tap' ? this.tapOk() : !this.panning())
  }

  private panning() {
    return this.moved && this.pointers.size > 0
  }

  private visiting() {
    return !!this.plotArgs?.visiting
  }

  /** Na fazenda do amigo, destaque cheio só onde há o que roubar (ovo, leite, mel); nos outros, o leve. */
  private lightCritter(id: AnimalId) {
    return this.visiting() && (id === 'dog' || !this.lastLooks?.ready?.includes(id))
  }

  /** Cutucar: som próprio, fala e pulinho (sem pulinho com movimento reduzido). Intervalo mínimo por bicho. */
  private poke(c: Critter) {
    const now = performance.now()
    if (now - (this.pokedAt.get(c.id) ?? -1e9) < 700) return
    this.pokedAt.set(c.id, now)
    if (!this.calm && !c.asleep) c.w.hop()
    this.onAnimalSfx(kindOf(c.id), 'poke', this.dogBreed)
    this.say(c, c.asleep ? 'Zzz…' : SAY[kindOf(c.id)])
  }

  /** Balãozinho de texto em cima do bicho: na camada dos balões (por cima de tudo), acompanhando os pés dele. */
  private say(c: Critter, text: string) {
    const node = c.w.node
    if (node.destroyed) return
    const t = new Text({ text, style: { fontSize: 18, fill: 0xffffff, fontWeight: '900', stroke: { color: 0x3b2a1a, width: 4 }, align: 'center' } })
    t.anchor.set(0.5, 1)
    this.overlay.addChild(t)
    const follow = () => {
      if (t.destroyed) return false
      if (node.destroyed) { t.destroy(); return false }
      t.position.set(node.x, node.y - c.width * 0.9)
      return true
    }
    follow()
    this.tweens.push(follow)
    setTimeout(() => t.destroy(), text.length > 6 ? 1500 : 900)
  }

  // ---------- falas e efeitos sobre os lotes ----------

  /** Ponto do lote (em cima da planta) em coordenadas do canvas: a frutinha sai daqui. */
  plotPoint(idx: number): { x: number; y: number } | null {
    if (!this.ready) return null
    const pos = plotPos(idx)
    const p = this.world.toGlobal({ x: pos.x, y: pos.y - 34 })
    return { x: p.x, y: p.y }
  }

  /** Ponto do bicho (em cima dele) em coordenadas do canvas: o produto sobe daqui. */
  animalPoint(id: AnimalId): { x: number; y: number } | null {
    const c = this.critters.get(id)
    if (!this.ready || !c || c.w.node.destroyed) return null
    const p = this.world.toGlobal({ x: c.w.node.x, y: c.w.node.y - c.width * 0.6 })
    return { x: p.x, y: p.y }
  }

  /** Balão de gibi em cima do bicho ("Porco: não há nada para pegar aqui."). */
  sayAnimal(id: AnimalId, text: string) {
    const c = this.critters.get(id)
    if (c) this.say(c, text.replace(/: /, ':\n'))
  }

  private looksKey = ''

  /** Desenho da idade (filhote, jovem, adulto) e acessórios por cima do adulto (lote O). */
  setLooks(l: SceneLooks) {
    if (!this.artLoaded) { this.pendingLooks = l; return }
    this.lastLooks = l
    this.fillProps(l.ready ?? [])
    const key = JSON.stringify([l.looks, l.wear, this.herdKey, this.dogKey])
    if (key === this.looksKey) return
    this.looksKey = key
    const missing: string[] = []
    for (const c of this.critters.values()) {
      const kind = kindOf(c.id)
      const look = kind === 'dog' ? 'adult' : l.looks[c.id] ?? 'adult'
      const body = c.w.body.children[0] as Sprite | undefined
      if (kind !== 'dog' && body) {
        const base = look === 'adult' ? kind : `${kind}_${look}`
        const walk = frames(this.art, base, 'walk'), idle = frames(this.art, base, 'idle')
        const first = idle[0] ?? walk[0]
        if (first && !c.w.animated) {
          // Nasceu no sprite parado (os quadros não tinham chegado): passa para a grade dos quadros.
          const spec = ANIMAL_SPEC[kind as HerdKind]
          body.anchor.set(0.5, spec.foot ?? 0.95)
          body.scale.set(spec.width / first.width)
        }
        if (first) c.w.setAnim({ sprite: body, walk, idle })
      }
      // Acessórios: só no adulto (a arte é do adulto) e só por cima dos quadros dele (layers.ts).
      for (const layer of c.w.layers) layer.sprite.destroy()
      c.w.layers = []
      if (look !== 'adult' || c.asleep || !body) continue
      // Guardas (cabra, cavalo, avestruz) têm arte de outra grade: a coleira do cachorro não serve.
      if (kind === 'dog' && GUARD_ART[this.dogBreed ?? '']) continue
      const worn = (l.wear[c.id] ?? []).map((id) => ACCESSORY_BY_ID[id]).filter((a) => a && a.animal === kind).sort(layerOrder)
      if (worn.length && !c.w.animated && kind !== 'dog') missing.push(...animKeys(kind))
      let at = c.w.body.getChildIndex(body)
      for (const acc of worn) {
        const walk = frames(this.art, accSprite(acc), 'walk'), idle = frames(this.art, accSprite(acc), 'idle')
        const first = idle[0] ?? walk[0]
        if (!first) continue
        const sp = new Sprite(first)
        sp.eventMode = 'none'
        c.w.body.addChildAt(sp, ++at)
        c.w.layers.push({ sprite: sp, walk, idle })
      }
      c.w.syncLayers()
    }
    // Quem veste algo e ainda está no sprite parado: tenta de novo os quadros do adulto (uma vez por bicho).
    const retry = missing.filter((k) => !this.art[k] && !this.framesRetried.has(k))
    if (retry.length) {
      for (const k of retry) this.framesRetried.add(k)
      void loadKeys(this.art, retry).then(() => this.refreshArt())
    }
  }

  private framesRetried = new Set<string>()

  private pendingLooks: SceneLooks | null = null

  /** Centro do lote na tela (pixels do canvas): onde um toque acerta o lote. Usado pelos testes e2e. */
  plotCenter(idx: number): { x: number; y: number } | null {
    if (!this.ready) return null
    const p = this.world.toGlobal(plotPos(idx))
    return { x: p.x, y: p.y }
  }

  /** Tamanho mínimo legível: os balões não encolhem junto com a fazenda no celular. */
  private readable() {
    return Math.max(1, 0.85 / (this.world.scale.x || 1))
  }

  /** Balão de fala em cima do lote ("Não seja tão ganancioso!"). Um por lote; o novo troca o anterior. */
  sayAt(idx: number, text: string) {
    if (!this.ready) return
    this.bubbles.get(idx)?.destroy({ children: true })
    const pos = plotPos(idx)
    const b = new Container()
    const st = PLOT_BUBBLE
    const t = new Text({ text, style: { fontSize: 17, fill: st.text, fontWeight: '900', align: 'center', wordWrap: true, wordWrapWidth: 190 } })
    t.anchor.set(0.5, 1)
    const art = this.bubbleArt(t.width, t.height)
    if (art) {
      // Arte do lote W: escala única para o texto caber no miolo; a ponta da cauda fica em (0, 0), como no desenho.
      const { sprite, inner } = art
      t.anchor.set(0.5, 0.5)
      t.position.set(0, -sprite.height * (PLOT_BUBBLE_ART.tip - (inner.y0 + inner.y1) / 2))
      b.addChild(sprite, t)
    } else {
      const w = t.width + 24, h = t.height + 14
      const g = new Graphics()
      g.roundRect(-w / 2, -h - 12, w, h, st.radius).fill(st.fill).stroke({ width: st.strokeWidth, color: st.stroke })
      g.poly([-9, -14, 9, -14, 0, 0]).fill(st.fill)
      g.moveTo(-9, -12).lineTo(0, 0).lineTo(9, -12).stroke({ width: st.strokeWidth, color: st.stroke })
      t.position.set(0, -19)
      b.addChild(g, t)
    }
    b.position.set(pos.x, pos.y - 46)
    const k = this.readable()
    b.scale.set(this.calm ? k : k * 0.4)
    this.overlay.addChild(b)
    this.bubbles.set(idx, b)
    let age = 0
    const life = Math.max(1.6, 0.9 + text.length * 0.05)
    this.tweens.push((dt) => {
      if (b.destroyed) return false
      age += dt
      if (!this.calm && age < 0.18) b.scale.set(k * (0.4 + (0.6 * age) / 0.18) * (1 + Math.sin((age / 0.18) * Math.PI) * 0.08))
      else b.scale.set(k)
      if (age > life) b.alpha = Math.max(0, 1 - (age - life) / 0.3)
      if (age > life + 0.3) {
        b.destroy({ children: true })
        if (this.bubbles.get(idx) === b) this.bubbles.delete(idx)
        return false
      }
      return true
    })
  }

  /** Balão da arte (o menor tamanho que, na escala do texto, não precisa ser ampliado); null sem o arquivo. */
  private bubbleArt(textW: number, textH: number) {
    const inner = PLOT_BUBBLE_ART.inner
    const pad = 10
    for (const key of PLOT_BUBBLE_ART.sizes) {
      const tex = this.art[key]
      if (!tex) continue
      const scale = Math.max((textW + pad) / (tex.width * (inner.x1 - inner.x0)), (textH + pad) / (tex.height * (inner.y1 - inner.y0)), 0.45)
      if (scale > 1 && key !== PLOT_BUBBLE_ART.sizes[PLOT_BUBBLE_ART.sizes.length - 1]) continue
      const sprite = new Sprite(tex)
      sprite.anchor.set(0.5, PLOT_BUBBLE_ART.tip)
      sprite.scale.set(scale)
      return { sprite, inner }
    }
    return null
  }

  /** Baú do tesouro achado ao cavar (lote W, A6): sobe fechado em cima do lote, abre com as moedas e some. */
  chestAt(idx: number) {
    const closed = this.art.bau_fechado, open = this.art.bau_aberto
    if (!this.ready || !closed || !open) return
    const pos = plotPos(idx)
    const s = new Sprite(closed)
    s.anchor.set(0.5, 1)
    const k = this.readable() * (64 / closed.width)
    s.scale.set(k)
    s.position.set(pos.x, pos.y - 6)
    this.overlay.addChild(s)
    let age = 0
    this.tweens.push((dt) => {
      if (s.destroyed) return false
      age += dt
      if (!this.calm) s.y = pos.y - 6 - Math.min(age, 0.35) * 90
      if (age > 0.45 && s.texture !== open) s.texture = open
      if (!this.calm && age > 0.45 && age < 0.65) s.scale.set(k * (1 + Math.sin(((age - 0.45) / 0.2) * Math.PI) * 0.12))
      if (age > 1.6) s.alpha = Math.max(0, 1 - (age - 1.6) / 0.4)
      if (age > 2) { s.destroy(); return false }
      return true
    })
  }

  /** Número que sobe e some em cima do lote ("−27 ouro" vermelho da mordida). */
  floatAt(idx: number, text: string, color = 0xff4d4f) {
    const pos = plotPos(idx)
    // Um pouco à direita do centro: o cachorro para à esquerda e late em cima dele.
    this.floatOver(pos.x + 40, pos.y - 30, text, color)
  }

  private floatOver(x0: number, y0: number, text: string, color = 0xff4d4f) {
    if (!this.ready) return
    const t = new Text({ text, style: { fontSize: 26, fill: color, fontWeight: '900', stroke: { color: 0xffffff, width: 5 } } })
    t.anchor.set(0.5, 1)
    t.position.set(x0, y0)
    t.scale.set(this.readable())
    this.overlay.addChild(t)
    let age = 0
    this.tweens.push((dt) => {
      if (t.destroyed) return false
      age += dt
      if (!this.calm) t.y = y0 - age * 40
      if (age > 1.2) t.alpha = Math.max(0, 1 - (age - 1.2) / 0.5)
      if (age > 1.7) { t.destroy(); return false }
      return true
    })
  }

  /**
   * Mordida visível: o cachorro sai da casinha correndo até o lote do ladrão, late, aparece o
   * "−N ouro" e ele volta. Com movimento reduzido (ou sem cachorro na cena) só late e mostra o número.
   */
  bite(idx: number, text: string) {
    if (!this.ready) return
    const pos = plotPos(idx)
    // Para na frente do lote, um pouco à esquerda do centro (a planta continua visível).
    this.biteTo({ x: pos.x - 30, y: pos.y + TILE_H / 2 - 8 }, () => this.floatAt(idx, text, text.startsWith('+') ? 0x2fa84f : undefined))
  }

  /** Mordida no ladrão de um bicho: o cachorro corre até o bicho. */
  biteAnimal(id: AnimalId, text: string) {
    const c = this.critters.get(id)
    if (!this.ready || !c || c.w.node.destroyed) return
    const n = c.w.node
    this.biteTo({ x: n.x + 30, y: n.y + 6 }, () => this.floatOver(n.x + 40, n.y - c.width * 0.6, text, text.startsWith('+') ? 0x2fa84f : undefined))
  }

  private biteTo(spot: { x: number; y: number }, show: () => void) {
    const dog = this.dogWanderer
    const bark = () => {
      this.onAnimalSfx('dog', 'poke', this.dogBreed)
      show() // dono ganha (verde); ladrão perde (vermelho)
      const c = this.critters.get('dog')
      if (c) this.say(c, DOG_BREEDS[this.dogBreed ?? '']?.cry ?? 'Au! Au!')
      if (this.dogAttack && !this.dogAttack.sprite.destroyed) this.dogAttack.sprite.texture = this.dogAttack.tex // "mordendo"
      this.dogWanderer?.syncLayers()
    }
    const calmDown = () => {
      const a = this.dogAttack
      if (a && !a.sprite.destroyed && a.sprite.texture === a.tex && a.idle[0]) a.sprite.texture = a.idle[0]
      this.dogWanderer?.syncLayers()
    }
    if (!dog || dog.node.destroyed || this.calm || this.dogBusy) {
      bark()
      // Parado (movimento reduzido): mostra o "mordendo" no lugar por um instante. Já correndo, a corrida mostra.
      if (this.dogAttack && dog && !dog.node.destroyed && !this.dogBusy) {
        this.dogBusy = true
        dog.held = true
        setTimeout(() => { calmDown(); dog.held = false; this.dogBusy = false }, 1100)
      } else if (!this.dogBusy) calmDown()
      return
    }
    this.dogBusy = true
    const node = dog.node, home = { x: node.x, y: node.y }
    dog.held = true
    // Na corrida até o ladrão ele passa por cima dos lotes e dos enfeites (a mordida tem que aparecer): a corrida
    // (dash) põe o zIndex do pé a cada passo, e aqui ele é trocado pelo de cima de tudo até voltar.
    let phase: 'go' | 'stay' | 'back' = 'go', wait = 0
    this.tweens.push((dt) => {
      if (node.destroyed) { this.dogBusy = false; return false }
      if (phase === 'go') {
        if (dog.dash(dt, spot.x, spot.y, 520)) { phase = 'stay'; bark() }
      } else if (phase === 'stay') {
        wait += dt
        dog.body.y = wait < 0.6 ? -Math.abs(Math.sin(wait * 14)) * 6 : 0 // pulinhos latindo
        if (wait > 1.1) { phase = 'back'; calmDown() }
      } else if (dog.dash(dt, home.x, home.y, 300)) {
        node.zIndex = footZ(node.x, node.y)
        dog.held = false
        this.dogBusy = false
        return false
      }
      node.zIndex = BITE_Z
      this.shadows.sync()
      return true
    })
  }

  /**
   * Onde o dono deixou cada bicho (vem do servidor). `editable` = fazenda própria (visitante só cutuca).
   * Bicho sem lugar salvo passeia na área padrão dele.
   */
  setAnimals(spots: Spots, editable: boolean) {
    this.editable = editable
    const key = JSON.stringify(spots)
    if (key === this.spotsKey) return
    this.spotsKey = key
    this.spots = spots
    this.placeAnimals()
  }

  // Último lugar aplicado a cada bicho ('' = área padrão): só reposiciona quando muda.
  private placed = new Map<AnimalId, string>()

  private placeAnimals() {
    if (!this.ready) return
    for (const c of this.critters.values()) {
      if (c.asleep || c.w.held) continue
      const spot = this.spots[c.id]
      const k = spot ? `${spot.x},${spot.y}` : ''
      if (this.placed.has(c.id) && this.placed.get(c.id) === k) continue
      const first = !this.placed.has(c.id)
      this.placed.set(c.id, k)
      if (spot) c.w.setArea(roamArea(c.id, spot.x, spot.y), spot)
      else if (!first) c.w.setArea(defaultArea(c.id)) // voltou para a área padrão (ex.: visita a outra fazenda)
    }
  }

  /** Evento sazonal na fazenda (tigela e visitantes); null = sem evento. */
  setEvent(ev: SceneEvent) {
    if (!this.eventLayer) { this.pendingEvent = ev; return }
    void this.eventLayer.set(ev)
  }

  /** Visitante espantado (o servidor aceitou): fala e some. */
  shooCritter(n: number) {
    const p = this.eventLayer?.pointOf(n)
    if (p) this.floatOver(p.x, p.y, this.eventLayer!.lineOf(n).replace('\n', ' '), 0x7a3fc4)
    this.eventLayer?.shoo(n, this.tweens)
  }

  /** Ponto da tigela na tela (os números da ação sobem dali). */
  bowlPoint(): { x: number; y: number } | null {
    const p = this.eventLayer?.bowlPoint
    return p ? this.world.toGlobal(p) : null
  }

  destroy() {
    this.destroyed = true
    this.lighting.destroy()
    if (this.ready) this.app.destroy(true, { children: true })
  }

  // ---------- decoração (frente J) ----------

  /** Decoração da fazenda na tela (vem do servidor): peças equipadas e enfeites/caminhos soltos. */
  setDecor(slots: Slots, placed: Placed[]) {
    if (!this.ready || !this.decor) { this.pendingDecor = { slots, placed }; return }
    this.applySlots(slots)
    this.decor.set(placed)
    // Bicho que estava onde agora há enfeite (chegou depois dele ou foi posto em cima) sai dali; senão fica preso.
    for (const a of this.animals) a.unstick()
    // Selecionado que sumiu (guardado) sai do destaque.
    if (this.edit?.selected != null && !placed.some((p) => p.id === this.edit!.selected)) this.decor.highlight(null)
    else if (this.edit?.mode === 'move' && this.edit.selected != null) this.decor.highlight(placed.find((p) => p.id === this.edit!.selected) ?? null)
  }

  private seriesReq = 0

  /** Troca as peças dos lugares fixos (opção A). Carrega a arte da série só quando ela entra em uso. */
  private applySlots(slots: Slots, force = false) {
    const key = JSON.stringify(slots)
    if (!force && key === this.slotsKey) return
    this.slotsKey = key
    this.slots = slots
    const req = ++this.seriesReq
    const need = [...new Set(Object.values(slots))]
    void Promise.all(need.map((id) => loadSeriesArt(id).then((a) => [id, a] as const))).then((list) => {
      if (req !== this.seriesReq || this.destroyed) return
      const art = Object.fromEntries(list) as Record<string, SeriesArt>
      this.setHouse(art[slots.casa])
      this.setDoghouse(art[slots.casinha])
      this.setFieldFence(art[slots.cerca])
      this.drawPen(slots.cerca === 'sitio' ? undefined : art[slots.cerca])
      this.setFixedOrnament(art[slots.enfeite])
      const f = art[slots.fundo]
      this.backdrop?.theme(slots.fundo === 'sitio' && !f?.fundo_morros_distantes ? null : {
        ceu: f?.fundo_ceu, nuvem: f?.fundo_nuvem, distantes: f?.fundo_morros_distantes, proximos: f?.fundo_morros_proximos, arco: f?.fundo_arco_iris,
      })
    })
  }

  private setHouse(a: SeriesArt | undefined) {
    this.houseC.removeChildren().forEach((c) => c.destroy({ children: true }))
    this.lighting.removeGlows(this.houseGlows)
    this.houseGlows = []
    const tex = a?.casa
    if (!tex) { this.houseC.addChild(this.oldHouse()); return }
    // Lote M: 320×320, âncora (160,316); mesmo tamanho e mesmo pé da casa de antes (220 de largura).
    const sp = new Sprite(tex)
    sp.anchor.set(0.5, 316 / 320)
    sp.scale.set(HOUSE_W / 320)
    sp.position.set(HOUSE_FOOT.x, HOUSE_FOOT.y)
    this.houseC.addChild(sp)
    // Janelas e luz da porta de cada casa (px no desenho de 320): acendem à noite.
    const k = HOUSE_W / 320
    const at = (px: number, py: number) => ({ x: HOUSE_FOOT.x + (px - 160) * k, y: HOUSE_FOOT.y + (py - 316) * k })
    for (const [px, py, w, h, alpha] of HOUSE_LIGHTS[this.slots.casa] ?? []) {
      const p = at(px, py)
      this.houseGlows.push(this.lighting.addGlow(p.x, p.y, w, h, alpha))
    }
  }

  private seriesDoghouse: Texture | null = null

  /** Casinha do cachorro da série (lote M: 192×192, âncora (96,188)); sem ela, a de scene/. */
  private makeDoghouse(): Sprite | null {
    const tex = this.seriesDoghouse
    let house: Sprite | null
    if (tex) {
      house = new Sprite(tex)
      house.anchor.set(0.5, 188 / 192)
      house.scale.set(110 / 192)
      house.position.set(250, -103)
    } else {
      house = this.sprite('doghouse', { x: 0.5, y: 0.8 }, 110)
      house?.position.set(250, -120)
    }
    return house
  }

  private doghouseEvents(house: Sprite) {
    house.cursor = 'pointer'
    house.on('pointertap', () => { if (this.tapOk()) this.onDogTap() })
    bindHover(this.hover, house, () => ({ light: this.visiting() }), (k) => this.hoverOk(k))
  }

  private setDoghouse(a: SeriesArt | undefined) {
    this.seriesDoghouse = a?.casinha ?? null
    const old = this.doghouseNode
    if (!old || old.destroyed) return
    const fresh = this.makeDoghouse()
    if (!fresh) return
    fresh.zIndex = footZ(fresh.x, DOGHOUSE_FOOT_Y)
    fresh.eventMode = old.eventMode
    this.doghouseEvents(fresh)
    this.depthLayer.addChild(fresh)
    old.destroy()
    this.doghouseNode = fresh
  }

  /**
   * Cerca da frente da roça com os módulos da série (cerca_ne: postes (32,164) e (224,68), passo de 192 px), fatiada
   * como a do cercado: cada fatia com o pé da reta no x dela, na camada do pé (o porco atrás dela fica atrás).
   */
  private setFieldFence(a: SeriesArt | undefined) {
    for (const c of this.fieldFence) c.destroy({ children: true })
    this.fieldFence = []
    const tex = a?.cerca_ne
    const parts = tex ? this.fenceModules(tex) : this.oldFence()
    for (const c of parts) {
      c.eventMode = 'none'
      this.depthLayer.addChild(c)
      this.fieldFence.push(c)
    }
  }

  private fenceModules(tex: Texture): Sprite[] {
    const [[ax, ay], [bx, by]] = FENCE
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 110))
    const k = Math.hypot(bx - ax, by - ay) / n / Math.hypot(192, 96)
    const out: Sprite[] = []
    for (let i = 0; i < n; i++) {
      const px = ax + ((bx - ax) * i) / n, py = ay + ((by - ay) * i) / n
      out.push(...fenceSlices(tex, k, px - 32 * k, py - 164 * k, { x: 32, y: 164 }, { x: 224, y: 68 }))
    }
    return out
  }

  /** Enfeite fixo da série (carroça, fonte, boneco de neve) no lugar reservado da grade, ordenado pelo pé. */
  private setFixedOrnament(a: SeriesArt | undefined) {
    this.fixedOrnament?.destroy({ children: true })
    this.fixedOrnament = null
    const tex = a?.enfeite
    if (!tex) return
    const f = FIXED_ORNAMENT
    const c = new Container()
    const base = ornamentBase('lago_patinhos', f.u, f.v) // mesma pegada 2×2
    const sp = new Sprite(tex)
    sp.anchor.set(144 / 288, 252 / 256)
    sp.scale.set(TILE_W / 256)
    c.addChild(sp)
    c.position.set(base.x, base.y)
    c.zIndex = footZ(base.x, base.y)
    c.eventMode = 'none'
    this.depthLayer.addChild(c)
    this.shadows.place(base.x, base.y - 16, 110, 40, 0.3)
    this.fixedOrnament = c
  }

  /** Modo edição (martelo). null = fora: os enfeites não recebem toque e a grade some. */
  setEdit(edit: SceneEdit) {
    const key = JSON.stringify(edit)
    if (key === this.editKey && this.decor) return
    this.editKey = key
    const was = this.edit
    this.edit = edit
    if (edit) this.hover.clear() // editando a decoração, os bichos e a casinha não são o alvo do clique
    if (!this.decor) return
    this.decor.showGrid(!edit ? null : edit.mode === 'paint' || edit.mode === 'erase' ? 'path' : 'ornament')
    if (!edit || was?.mode !== edit.mode || was?.itemId !== edit.itemId) { this.held = null; this.stroke = null; this.decor.hide(null) }
    if (edit?.mode === 'move') this.decor.highlight(this.decor.placed.find((p) => p.id === edit.selected) ?? null)
    else if (!edit || edit.mode !== 'place') this.decor.highlight(null)
  }

  private editKey = ''
  // Enfeite na mão (mover): id, célula de partida e o deslocamento de onde o dedo pegou.
  private held: { p: Placed; du: number; dv: number; u: number; v: number; ok: boolean; reason: string } | null = null
  // Pincel do caminho (pintar/apagar): células já passadas no traço.
  private stroke: { cells: [number, number][]; seen: Set<string>; last: { u: number; v: number } } | null = null

  private worldCell(screen: { x: number; y: number }) {
    const w = this.world.toLocal(screen)
    return cellAt(w.x, w.y)
  }

  /** Começo de um gesto com um dedo no modo edição. true = a decoração ficou com o gesto (sem câmera). */
  private editDown(at: { x: number; y: number }): boolean {
    const e = this.edit, d = this.decor
    if (!e || !d) return false
    if (e.mode === 'move') {
      const w = this.world.toLocal(at)
      const p = d.ornamentAt(w.x, w.y)
      this.onDecor({ kind: 'select', id: p?.id ?? null })
      if (!p) { d.highlight(null); return false }
      const c = cellAt(w.x, w.y)
      this.held = { p, du: c.u - p.u, dv: c.v - p.v, u: p.u, v: p.v, ok: true, reason: '' }
      d.highlight(p)
      return true
    }
    if (e.mode === 'paint' || e.mode === 'erase') {
      const f = this.worldCell(at), c = pathCellOf(f.u, f.v)
      this.stroke = { cells: [], seen: new Set(), last: c }
      this.strokeAdd(c.u, c.v)
      return true
    }
    return false
  }

  private strokeAdd(u: number, v: number) {
    const st = this.stroke!, d = this.decor!, e = this.edit!
    // Liga a célula anterior à nova passo a passo (o dedo rápido não deixa buraco no caminho).
    let { u: cu, v: cv } = st.last
    const steps: [number, number][] = []
    while (cu !== u || cv !== v) {
      if (cu !== u) cu += Math.sign(u - cu) * PATH_STEP
      else cv += Math.sign(v - cv) * PATH_STEP
      steps.push([cu, cv])
    }
    if (!st.cells.length) steps.unshift([u, v])
    for (const [a, b] of steps) {
      const k = `${a},${b}`
      if (st.seen.has(k)) continue
      st.seen.add(k)
      st.cells.push([a, b])
    }
    st.last = { u, v }
    d.previewCells(st.cells, e.mode === 'erase' ? null : e.itemId ?? null, this.spots)
  }

  private editMove(at: { x: number; y: number }): boolean {
    const e = this.edit, d = this.decor
    if (!e || !d) return false
    if (this.held) {
      const c = this.worldCell(at)
      const u = c.u - this.held.du, v = c.v - this.held.dv
      this.held.u = u
      this.held.v = v
      d.hide(this.held.p.id)
      const chk = d.preview(this.held.p.itemId, u, v, this.spots, this.held.p.id)
      this.held.ok = !!chk?.ok
      this.held.reason = chk && !chk.ok ? chk.reason : ''
      return true
    }
    if (this.stroke) {
      const f = this.worldCell(at), c = pathCellOf(f.u, f.v)
      if (c.u !== this.stroke.last.u || c.v !== this.stroke.last.v) this.strokeAdd(c.u, c.v)
      return true
    }
    if (e.mode === 'place' && e.itemId && this.pointers.size === 0) {
      // Mouse passando: a prévia segue o ponteiro (no toque ela aparece onde o dedo tocar).
      const c = this.worldCell(at)
      const chk = d.preview(e.itemId, c.u, c.v, this.spots)
      this.onDecor({ kind: 'hint', text: chk && !chk.ok ? chk.reason : undefined, bad: !!chk && !chk.ok })
    }
    return false
  }

  private editUp(at: { x: number; y: number }, tap: boolean) {
    const e = this.edit, d = this.decor
    if (!e || !d) return
    if (this.held) {
      const h = this.held
      this.held = null
      d.hide(null)
      d.highlight(h.p)
      if (h.u === h.p.u && h.v === h.p.v) return
      if (h.ok) this.onDecor({ kind: 'move', id: h.p.id, u: h.u, v: h.v })
      else this.onDecor({ kind: 'hint', text: h.reason, bad: true })
      return
    }
    if (this.stroke) {
      const cells = this.stroke.cells
      this.stroke = null
      d.preview(null, 0, 0, this.spots)
      if (e.mode === 'erase') this.onDecor({ kind: 'erase', cells })
      else if (e.itemId) this.onDecor({ kind: 'paint', itemId: e.itemId, cells })
      return
    }
    if (e.mode === 'place' && e.itemId && tap) {
      const c = this.worldCell(at)
      const chk = d.preview(e.itemId, c.u, c.v, this.spots)
      if (chk?.ok) this.onDecor({ kind: 'place', itemId: e.itemId, u: c.u, v: c.v })
      else this.onDecor({ kind: 'hint', text: chk?.reason, bad: true })
    }
  }

  // ---------- câmera: arrastar, pinça e roda do mouse ----------

  private zoom = 1 // multiplicador do usuário sobre o enquadramento automático
  private pan = { x: 0, y: 0 } // deslocamento em pixels de tela
  private pointers = new Map<number, { x: number; y: number }>()
  private gesture: { dist: number; zoom: number; mid: { x: number; y: number } } | null = null
  private moved = false // o último toque virou arraste: não conta como clique no lote
  private pressTimer: ReturnType<typeof setTimeout> | null = null
  private longPressed = false

  /** Toque no lote só vale se não foi arraste nem toque longo. */
  private tapOk() {
    return !this.moved && !this.longPressed
  }

  private attachGestures(canvas: HTMLCanvasElement) {
    canvas.style.touchAction = 'none'
    const rel = (e: PointerEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    // Mouse saiu do canvas (HUD, barra, tutorial por cima da cena): o destaque e o lote sob o mouse apagam.
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
      this.hover.leave()
      if (this.hovered != null) { this.hovered = null; this.redrawHover() }
    })
    canvas.addEventListener('pointerdown', (e) => {
      if (this.pointers.size === 0) { this.moved = false; this.longPressed = false }
      this.pointers.set(e.pointerId, rel(e))
      if (this.pointers.size === 2) { this.drag.cancel(); this.editCancel(); this.startPinch() }
      // Modo edição: um dedo em cima de um enfeite (mover) ou o pincel do caminho ficam com o gesto.
      else if (this.pointers.size === 1 && this.editDown(rel(e))) {
        this.editGesture = true
        canvas.setPointerCapture(e.pointerId)
      }
    })
    canvas.addEventListener('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId)
      if (!prev) { if (this.edit) this.editMove(rel(e)); return }
      const p = rel(e)
      this.pointers.set(e.pointerId, p)
      if (this.editGesture && this.pointers.size === 1) {
        if (Math.hypot(p.x - prev.x, p.y - prev.y) > 0) this.moved = true
        this.editMove(p)
        return
      }
      // Bicho na mão: o dedo leva o bicho, não a câmera.
      if (this.drag.move(e.pointerId, p)) {
        if (!canvas.hasPointerCapture(e.pointerId)) canvas.setPointerCapture(e.pointerId)
        this.moved = true
        return
      }
      if (this.pointers.size >= 2 && this.gesture) {
        const [a, b] = [...this.pointers.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        this.zoomAt(this.gesture.mid, (this.gesture.zoom * dist) / this.gesture.dist)
        this.moved = true
        return
      }
      const dx = p.x - prev.x, dy = p.y - prev.y
      if (!this.moved && Math.hypot(dx, dy) < 2) return
      // Só vira arraste depois de uns pixels: toque com o dedo tremendo ainda é toque.
      this.dragAcc += Math.hypot(dx, dy)
      if (this.dragAcc > 8) {
        if (!this.moved && this.hovered != null) { this.hovered = null; this.redrawHover(); this.onPlotHover(null, 0, 0) }
        this.moved = true
        this.cancelLongPress()
        this.pan.x += dx
        this.pan.y += dy
        this.layout()
      }
    })
    const up = (e: PointerEvent) => {
      if (e.type === 'pointercancel') { this.drag.cancel(); this.editCancel() }
      else this.drag.release(e.pointerId)
      // Fim do gesto de edição (ou toque simples para pôr o enfeite na mão).
      if (this.edit && e.type !== 'pointercancel' && this.pointers.size === 1 && (this.editGesture || !this.moved)) this.editUp(rel(e), !this.moved)
      if (this.pointers.size <= 1) this.editGesture = false
      this.pointers.delete(e.pointerId)
      if (this.pointers.size < 2) this.gesture = null
      if (this.pointers.size === 0) this.dragAcc = 0
      this.cancelLongPress()
    }
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      this.zoomAt(rel(e), this.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))
    }, { passive: false })
  }

  private dragAcc = 0
  private editGesture = false

  /** Pinça no meio de um gesto de edição: desfaz o que estava na mão. */
  private editCancel() {
    if (!this.decor) return
    if (this.held) { this.decor.hide(null); this.decor.highlight(this.held.p) }
    if (this.stroke) this.decor.preview(null, 0, 0, this.spots)
    this.held = null
    this.stroke = null
    this.editGesture = false
  }

  private startPinch() {
    const [a, b] = [...this.pointers.values()]
    this.gesture = { dist: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), zoom: this.zoom, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
    this.cancelLongPress()
  }

  /** Zoom mantendo fixo o ponto da tela sob os dedos/mouse. */
  private zoomAt(at: { x: number; y: number }, next: number) {
    const z = Math.max(0.7, Math.min(3, next))
    const before = this.world.toLocal(at)
    this.zoom = z
    this.layout()
    const after = this.world.toGlobal(before)
    this.pan.x += at.x - after.x
    this.pan.y += at.y - after.y
    this.layout()
  }

  private cancelLongPress() {
    if (this.pressTimer) clearTimeout(this.pressTimer)
    this.pressTimer = null
  }

  private plotCount = 6
  private shown = false
  private topInset = 64

  /** Altura real do que fica por cima da cena no topo (HUD, Assistente, faixa da visita): a fazenda enquadra abaixo. */
  setTopInset(px: number) {
    const top = Math.round(Math.max(64, Math.min(260, px)))
    if (Math.abs(top - this.topInset) < 4) return
    this.topInset = top
    if (this.app?.renderer) this.layout()
  }

  private layout() {
    const { width, height } = this.app.screen
    // Enquadra a roça do tamanho atual + casa, casinha e cerca (layout.ts), descontando a HUD em cima
    // e ferramentas/abas embaixo.
    const portrait = height > width * 1.1
    const b = sceneBounds(this.plotCount)
    const top = this.topInset, bottom = portrait ? 150 : 96
    const availH = Math.max(160, height - top - bottom)
    const base = Math.min(width / b.w, availH / b.h)
    // Zoom padrão = tudo cabe (roça, casa, casinha, cerca); a pinça aproxima a partir daí.
    const fit = Math.min(base, 1.8)
    const scale = fit * this.zoom
    // Não deixa a fazenda sair da tela.
    const mx = (b.w / 2) * scale, my = (b.h / 2) * scale
    this.pan.x = Math.max(-mx, Math.min(mx, this.pan.x))
    // Para cima vai um pouco além: dá para ver o horizonte (céu e morros com parallax, backdrop.ts).
    this.pan.y = Math.max(-my, Math.min(my + 220 * scale, this.pan.y))
    this.world.scale.set(scale)
    this.world.position.set(width / 2 - b.cx * scale + this.pan.x, top + availH / 2 - b.cy * scale + this.pan.y)
    this.backdrop?.follow(this.pan, scale, this.world.position, this.app.screen)
    this.lighting.follow()
  }

  // ---------- cenário fixo ----------

  private sprite(key: string, anchor: { x: number; y: number }, width?: number) {
    const tex = this.art[key]
    if (!tex) return null
    const sp = new Sprite(tex)
    sp.anchor.set(anchor.x, anchor.y)
    if (width) sp.scale.set(width / tex.width)
    return sp
  }

  /** Placeholder sem a arte: ilha de grama desenhada em código. */
  private drawGround() {
    const g = new Graphics()
    // Ilha de grama em losango grande, com borda de terra (dá o volume 2.5D).
    const w = TILE_W * 5.6, h = TILE_H * 5.6
    g.poly([0, -h / 2 + 18, w / 2, 18, 0, h / 2 + 18, -w / 2, 18]).fill(0x9a6b3c)
    g.poly(diamond(0, 0, w, h)).fill(0x8fd14f)
    g.poly(diamond(0, 0, w * 0.92, h * 0.92)).fill(0x9bdc5a)
    // Tufos de grama e florzinhas espalhados (posições fixas para não "piscar").
    const spots = [[-250, -10], [230, 20], [-120, 140], [150, -120], [60, 170], [-200, 70], [250, -40], [-40, -170]]
    for (const [x, y] of spots) {
      g.ellipse(x, y, 10, 4).fill(0x7cc043)
      g.circle(x - 4, y - 3, 2.5).fill(0xffffff)
      g.circle(x + 5, y - 2, 2.5).fill(0xffe14d)
    }
    return g
  }

  /** Árvores perto da casa e da casinha (posições em layout.ts; bicho não fica em cima), com sombra e vento. */
  private drawTrees() {
    const tex = this.art.tree
    if (!tex) return
    for (const { x, y, w } of TREES) {
      const t = new Sprite(tex)
      t.anchor.set(0.5, 284 / 288)
      t.scale.set(w / tex.width)
      t.position.set(x, y)
      t.zIndex = footZ(x, y)
      t.eventMode = 'none'
      this.depthLayer.addChild(t)
      this.trees.push(t)
      this.shadows.place(x, y - 4, w * 0.8, w * 0.28, 0.36)
      this.wind.add(t, 0.022, 1.1)
    }
  }

  /** Sombras do cenário fixo e as janelas da casa que acendem à noite. */
  private addStaticShadows() {
    // Sombra da casa (as janelas que acendem à noite dependem da série: applySlots).
    this.shadows.place(-222, -44, 210, 70, 0.3)
    if (this.art.doghouse) this.shadows.place(250, -124, 104, 36, 0.3)
    // Cerca: uma sombrinha por mourão (os mesmos 9 de oldFence).
    const [[ax, ay], [bx, by]] = FENCE
    for (let i = 0; i <= 8; i++) this.shadows.place(ax + ((bx - ax) * i) / 8, ay + ((by - ay) * i) / 8, 16, 7, 0.32)
  }

  /** A casa (a da série ou a antiga) entra na camada do pé num contêiner só, com o pé da casa. */
  private drawHouse() {
    this.houseC.zIndex = footZ(HOUSE_FOOT.x, HOUSE_FOOT.y)
    this.houseC.eventMode = 'none'
    this.houseC.interactiveChildren = false
    this.depthLayer.addChild(this.houseC)
  }

  /** Casa antiga (scene/house.png) ou placeholder: só se a série não tiver casa. */
  private oldHouse() {
    const c = new Container()
    const house = this.sprite('house', { x: 0.5, y: 0.85 }, 220)
    if (house) {
      house.position.set(-230, -40)
      c.addChild(house)
      return c
    }
    const g = new Graphics()
    // Casinha isométrica: paredes, telhado vermelho, porta e janela.
    const bx = -205, by = -120
    g.poly([bx - 60, by, bx, by + 30, bx, by + 100, bx - 60, by + 70]).fill(0xfff1d6).stroke({ width: 2, color: 0x8a5a2b })
    g.poly([bx, by + 30, bx + 70, by - 5, bx + 70, by + 65, bx, by + 100]).fill(0xf6dcb0).stroke({ width: 2, color: 0x8a5a2b })
    g.poly([bx - 70, by + 2, bx - 10, by - 60, bx + 80, by - 8, bx, by + 38]).fill(0xe8473b).stroke({ width: 2, color: 0x9b2a22 })
    g.poly([bx - 10, by - 60, bx + 80, by - 8, bx + 70, by - 5, bx - 15, by - 52]).fill(0xc7362c)
    g.poly([bx + 25, by + 50, bx + 45, by + 40, bx + 45, by + 75, bx + 25, by + 85]).fill(0x9c6331)
    g.poly([bx - 45, by + 35, bx - 20, by + 47, bx - 20, by + 67, bx - 45, by + 55]).fill(0x7fd3ff).stroke({ width: 2, color: 0xffffff })
    c.addChild(g)
    return c
  }

  /** Cerca antiga em código (só se a série não tiver as peças de cerca): um trecho por vão, cada um com o seu pé. */
  private oldFence(): Graphics[] {
    // Cerquinha na frente da roça (posição em layout.ts).
    const [[ax, ay], [bx, by]] = FENCE
    const at = (i: number) => ({ x: ax + ((bx - ax) * i) / 8, y: ay + ((by - ay) * i) / 8 })
    const out: Graphics[] = []
    for (let i = 0; i < 8; i++) {
      const a = at(i), b = at(i + 1), g = new Graphics()
      g.moveTo(a.x, a.y - 14).lineTo(b.x, b.y - 14).stroke({ width: 4, color: 0xf0dcb8 })
      g.moveTo(a.x, a.y - 4).lineTo(b.x, b.y - 4).stroke({ width: 4, color: 0xf0dcb8 })
      for (const p of i === 7 ? [a, b] : [a]) g.rect(p.x - 3, p.y - 26, 6, 26).fill(0xfff6e0).stroke({ width: 1.5, color: 0xb98b54 })
      g.zIndex = footZ((a.x + b.x) / 2, (a.y + b.y) / 2)
      out.push(g)
    }
    return out
  }

  // ---------- lotes ----------

  setPlots(plots: ScenePlot[], visiting: boolean, farm = '') {
    if (!this.ready) { this.pending = { plots, visiting, farm }; return }
    this.plotArgs = { plots, visiting, farm }
    // Cultura nova (plantou, ou visita antes de a arte toda chegar): baixa e redesenha; até lá, o provisório.
    const missing = this.cropsOf(plots).filter((k) => !this.cropsLoading.has(k))
    if (missing.length) {
      for (const k of missing) this.cropsLoading.add(k)
      void loadKeys(this.art, missing).then(() => this.refreshArt())
    }
    // Marca de desempenho: primeiro quadro com a roça desenhada (medido em scripts/qa/perf.mjs).
    if (!this.shown && plots.length) {
      this.shown = true
      requestAnimationFrame(() => requestAnimationFrame(() => performance.mark('cf:farm-visible')))
    }
    if (plots.length !== this.plotCount) { this.plotCount = plots.length; this.layout() }
    // Trocou de fazenda (visita): não é ação no lote, então sem partículas desta vez.
    const sameFarm = farm === this.farm
    this.farm = farm
    // Terra: um bloco só; lateral só no contorno externo dos lotes comprados (field.ts).
    const variants = new Map(plots.filter((p) => p.state !== 'locked').map((p) => [p.idx, soilVariant(p)]))
    const forSale = plots.filter((p) => p.state === 'locked').map((p) => p.idx)
    const allSides = this.soil.update(variants, this.art, 0x8c5530, forSale)
    for (const p of plots) {
      const sides = allSides.get(p.idx) ?? { left: false, right: false }
      let node = this.plotNodes.get(p.idx)
      if (!node) {
        node = new Container()
        const pos = plotPos(p.idx)
        node.position.set(pos.x, pos.y)
        node.zIndex = plotFootZ(p.idx) // pé da planta: ponta de baixo do losango (depth-order.ts)
        node.eventMode = 'static'
        node.cursor = 'pointer'
        node.on('pointertap', () => { if (this.tapOk()) this.onPlotTap(p.idx) })
        // Toque longo (celular): mostra o balão do lote sem agir.
        node.on('pointerdown', (e) => {
          if (e.pointerType !== 'touch') return
          const { x, y } = e.global
          this.cancelLongPress()
          this.pressTimer = setTimeout(() => { this.longPressed = true; this.onPlotHover(p.idx, x, y) }, 450)
        })
        // Arrastando a câmera ou pinçando: sem balão (cada lote cruzado redesenharia a página).
        node.on('pointerover', (e) => {
          if ((this.moved && this.pointers.size) || overHtml(e)) return
          this.hovered = p.idx; this.redrawHover(); this.onPlotHover(p.idx, e.global.x, e.global.y)
        })
        node.on('pointermove', (e) => { if (this.hovered === p.idx && !(this.moved && this.pointers.size)) this.onPlotHover(p.idx, e.global.x, e.global.y) })
        node.on('pointerout', () => {
          if (this.hovered === p.idx) { this.hovered = null; this.onPlotHover(null, 0, 0) }
          this.redrawHover()
        })
        this.depthLayer.addChild(node)
        this.plotNodes.set(p.idx, node)
        const marks = new Container()
        marks.position.set(pos.x, pos.y)
        this.markLayer.addChild(marks)
        this.plotMarks.set(p.idx, marks)
      }
      const marks = this.plotMarks.get(p.idx)!
      // Só redesenha o lote se algo visível mudou (o relógio do jogo chama isto a cada segundo).
      const key = JSON.stringify([p.state, p.seedId, p.stage, p.canSteal, p.pests, p.weeds, p.dry, visiting, sides.left, sides.right,
        p.progress == null ? null : Math.round(p.progress * 50)])
      const before = this.lastPlots.get(p.idx)
      this.lastPlots.set(p.idx, p)
      if (this.plotKeys.get(p.idx) === key) continue
      this.plotKeys.set(p.idx, key)
      // Toque: losango + só as laterais de terra que aparecem (lote à venda não tem lateral).
      const hit = p.state === 'locked' ? { left: false, right: false } : sides
      const fx = sameFarm && before ? plotBurst(before, p) : null
      if (fx) this.particles.burst(fx, node.x, node.y, p.seedId ? SEED_BY_ID[p.seedId]?.leaf : undefined)
      node.removeChildren().forEach((c) => c.destroy())
      marks.removeChildren().forEach((c) => c.destroy({ children: true }))
      const drawn = p.state === 'locked' ? { c: this.drawForSale(), top: 0, badge: false } : this.drawPlot(p, visiting, marks)
      node.addChild(drawn.c)
      // Toque igual para todas as ferramentas: losango + planta acima dele + marcador (depth.ts, plotHitArea).
      node.hitArea = plotHitArea(plotHitPolygon(hit, TILE_W, TILE_H, this.soil.mound ? MOUND_RIM : PLOT_SIDE), drawn.top, drawn.badge)
      node.label = String(p.idx)
    }
    // Lotes que deixaram de existir (ex.: visita a uma fazenda menor).
    const keep = new Set(plots.map((p) => p.idx))
    for (const [idx, node] of this.plotNodes) {
      if (keep.has(idx)) continue
      node.destroy({ children: true })
      this.plotMarks.get(idx)?.destroy({ children: true })
      this.plotMarks.delete(idx)
      this.plotNodes.delete(idx)
      this.plotKeys.delete(idx)
      this.lastPlots.delete(idx)
    }
    this.redrawHover()
  }

  private redrawHover() {
    // Lote: a terra e a planta ganham o destaque leve dos bichos (contorno creme e tom mais claro), sem o pulinho
    // (a planta não descola da terra). Antes o lote só ficava um pouco transparente.
    for (const [idx, node] of this.plotNodes) {
      const top = this.soil.top(idx), marks = this.plotMarks.get(idx)
      for (const n of [node, top, marks]) {
        if (!n) continue
        if (this.hovered === idx) this.hover.on(n, { light: true, bump: false })
        else this.hover.off(n)
      }
    }
  }

  /** Terreno à venda: grama com contorno tracejado e plaquinha. */
  private drawForSale() {
    const c = new Container()
    const g = new Graphics()
    const pts = diamond(0, 0, TILE_W - 14, TILE_H - 7)
    // Com o montinho verde (lote K) o lote já se mostra: fica só a plaquinha. Sem ele, contorno tracejado na grama.
    for (let i = 0; i < 4 && !this.art.soil_plot_cover; i++) {
      const [x1, y1, x2, y2] = [pts[i * 2], pts[i * 2 + 1], pts[(i * 2 + 2) % 8], pts[(i * 2 + 3) % 8]]
      for (let t = 0; t < 1; t += 0.2) {
        g.moveTo(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t).lineTo(x1 + (x2 - x1) * (t + 0.1), y1 + (y2 - y1) * (t + 0.1))
      }
    }
    g.stroke({ width: 3, color: 0xffffff, alpha: 0.8 })
    g.rect(-3, -34, 6, 34).fill(0x8a5a2b)
    g.roundRect(-30, -58, 60, 28, 6).fill(0xf6dcb0).stroke({ width: 3, color: 0x8a5a2b })
    const t = new Text({ text: 'À venda', style: { fontSize: 13, fill: 0x6b3f1f, fontWeight: '800' } })
    t.anchor.set(0.5)
    t.position.set(0, -44)
    c.addChild(g, t)
    c.alpha = 0.9
    return c
  }

  /**
   * Planta do lote (a terra é da SoilField) e, em `marks` (camada de cima), os marcadores. Sem sprite da cultura:
   * placeholder em código.
   */
  private drawPlot(p: ScenePlot, visiting: boolean, marks: Container) {
    const c = new Container()
    const scale = TILE_W / ART_TILE_W
    const cropKey = p.seedId && (p.state === 'withered' ? `${p.seedId}_withered` : p.state !== 'empty' ? `${p.seedId}_${p.stage ?? 0}` : '')
    const crop = cropKey ? this.sprite(cropKey, CROP_ANCHOR, ART_TILE_W * scale) : null
    // Topo da parte visível da planta (para a área de toque); o desenho provisório fica perto da terra.
    let top = 0
    if (crop) {
      top = crop.y - crop.anchor.y * crop.height + opaqueTopFrac(crop.texture) * crop.height
      // Debaixo da planta (manifesto do lote P): no estágio 0 as covas (as sementes assentam nelas); depois a
      // sombra do lote K (oval difusa, cresce com a planta); sem ela, a sombra de contato.
      const stage = p.state === 'withered' ? RIPE_STAGE : p.stage ?? 0
      const under = p.state === 'growing' && stage === 0 ? this.art.soil_plot_holes : this.art.soil_plot_shadow
      if (under) {
        const sh = new Sprite(under)
        sh.anchor.set(0.5, 0.5)
        sh.scale.set(scale)
        if (under === this.art.soil_plot_shadow) sh.alpha = p.state === 'withered' ? 0.6 : 0.5 + 0.5 * Math.min(1, stage / RIPE_STAGE)
        c.addChild(sh)
      } else if (p.state !== 'withered') c.addChild(cropShadow(stage))
      c.addChild(crop)
      // Madura balança no vento (pivô = centro do lote, onde ficam as bases das plantas).
      if (p.state === 'ripe') this.wind.add(crop, 0.035, 1.6)
    } else if (p.state === 'growing' || p.state === 'ripe' || p.state === 'withered') {
      const seed = p.seedId ? SEED_BY_ID[p.seedId] : undefined
      const crops = new Graphics()
      const spots: [number, number][] = [[0, -12], [-26, 0], [26, 0], [0, 12]]
      for (const [x, y] of spots) this.drawCrop(crops, x, y, p, seed?.id ?? '', seed?.color ?? 0xffffff, seed?.leaf ?? 0x4caf50)
      c.addChild(crops)
      top = Math.min(0, crops.getLocalBounds().minY)
    }
    const badge = this.drawOverlays(c, p, visiting, marks)
    return { c, top, badge }
  }

  /** Pragas, ervas e seca por cima da planta: usa os sprites de overlay se existirem. */
  private drawCare(c: Container, p: ScenePlot) {
    const scale = TILE_W / ART_TILE_W
    const add = (key: string, draw: (g: Graphics) => void) => {
      const sp = this.sprite(key, CROP_ANCHOR, ART_TILE_W * scale)
      if (sp) { c.addChild(sp); return }
      const g = new Graphics()
      draw(g)
      c.addChild(g)
    }
    const weeds = Math.min(3, p.weeds ?? 0), pests = Math.min(3, p.pests ?? 0)
    const spots: [number, number][] = [[-30, 4], [26, -2], [0, 16]]
    if (weeds) add(`weed_${weeds}`, (g) => {
      for (const [x, y] of spots.slice(0, weeds)) {
        for (const dx of [-5, 0, 5]) g.moveTo(x, y).quadraticCurveTo(x + dx, y - 10, x + dx * 2, y - 18).stroke({ width: 3, color: 0x5d8a1e })
      }
    })
    if (pests) add(`pest_${pests}`, (g) => {
      for (const [x, y] of spots.slice(0, pests)) {
        g.ellipse(x + 6, y - 18, 9, 5).fill(0x7bc043).stroke({ width: 2, color: 0x2f5d12 })
        g.circle(x + 15, y - 19, 4).fill(0x4f8a24)
        g.circle(x + 16, y - 20, 1.2).fill(0xffffff)
      }
    })
    if (p.dry) add('dry', (g) => {
      for (const [x1, y1, x2, y2] of [[-30, 2, -14, 8], [6, -10, 20, -2], [-6, 14, 10, 18]]) g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 2, color: 0x5a3418 })
    })
  }

  /**
   * Pragas, ervas e seca vão na planta (`c`); marcador e barra de crescimento, em `m` (por cima da camada do pé: bicho
   * ou enfeite na frente do lote não cobre o ✓). Devolve se pôs marcador acima do lote (entra na área de toque).
   */
  private drawOverlays(c: Container, p: ScenePlot, visiting: boolean, m: Container): boolean {
    if (p.state === 'growing' || p.state === 'ripe') this.drawCare(c, p)
    if (p.state === 'growing' && p.dry) {
      m.addChild(this.badge('💧', 0x4aa8e8))
      return true
    }
    if (p.state === 'growing' && p.progress != null) {
      const bar = new Graphics()
      bar.roundRect(-30, -58, 60, 9, 4).fill(0x3b2a1a)
      bar.roundRect(-29, -57, Math.max(4, 58 * p.progress), 7, 3).fill(0x7be05a)
      m.addChild(bar)
    }

    if (p.state === 'ripe') {
      const show = visiting ? p.canSteal : true
      if (show) { m.addChild(this.badge(visiting ? '✋' : '✓', visiting ? 0xffc93c : 0x44c767, true)); return true }
    }
    if (p.state === 'withered' && !visiting) { m.addChild(this.badge('⛏', 0xd9a066)); return true }
    return false
  }

  // Marcadores sobre os lotes (pronto, pegar, seca, enxada): sobem e descem; o de colheita pulsa.
  private bobbers: { node: Container; phase: number; pulse: boolean }[] = []

  private badge(label: string, color: number, pulse = false) {
    const b = new Container()
    this.bobbers.push({ node: b, phase: Math.random() * Math.PI * 2, pulse })
    const g = new Graphics()
    g.circle(0, 0, 15).fill(color).stroke({ width: 3, color: 0xffffff })
    g.poly([-6, 12, 6, 12, 0, 22]).fill(color)
    const t = new Text({ text: label, style: { fontSize: 16, fill: 0xffffff, fontWeight: '700' } })
    t.anchor.set(0.5)
    b.addChild(g, t)
    b.position.set(0, -78)
    return b
  }

  private drawCrop(g: Graphics, x: number, y: number, p: ScenePlot, seedId: string, fruit: number, leaf: number) {
    if (p.state === 'withered') {
      g.moveTo(x, y).lineTo(x - 6, y - 14).stroke({ width: 3, color: 0x8b6b3a })
      g.moveTo(x, y).lineTo(x + 7, y - 10).stroke({ width: 3, color: 0xa08048 })
      return
    }
    const stage = p.stage ?? 0
    if (stage === 0) {
      g.ellipse(x, y, 7, 3).fill(0x5a3418)
      g.circle(x, y - 1, 2).fill(0xf5e6b8)
      return
    }
    const h = [0, 10, 15, 21, 25, 28][stage]
    // Talo e folhas.
    g.moveTo(x, y).lineTo(x, y - h).stroke({ width: 3, color: leaf })
    g.ellipse(x - 6, y - h * 0.55, 7, 3.5).fill(leaf)
    g.ellipse(x + 6, y - h * 0.7, 7, 3.5).fill(leaf)
    if (stage >= 3) g.ellipse(x, y - h, 6, 4).fill(leaf)
    if (stage === 4) {
      g.circle(x - 3, y - h - 3, 3).fill(0xffffff)
      g.circle(x + 3, y - h - 2, 3).fill(0xfff38a)
    }
    if (stage === RIPE_STAGE) {
      if (seedId === 'milho') {
        g.roundRect(x - 4, y - h - 4, 8, 18, 4).fill(fruit).stroke({ width: 1.5, color: 0xd9a400 })
      } else if (seedId === 'nabo') {
        g.circle(x, y - 2, 7).fill(fruit).stroke({ width: 1.5, color: 0xb07cd6 })
        g.ellipse(x, y - 6, 6, 3).fill(0xb07cd6)
      } else {
        g.circle(x - 5, y - h + 4, 5).fill(fruit)
        g.circle(x + 5, y - h + 6, 5).fill(fruit)
        g.circle(x - 4, y - h + 3, 1).fill(0xfff38a)
        g.circle(x + 6, y - h + 5, 1).fill(0xfff38a)
      }
    }
  }
}

/** Terra do lote: arada (vazio), seca (murcho) ou úmida (plantado). */
const soilVariant = (p: ScenePlot): SoilVariant => (p.state === 'empty' ? 'plowed' : p.state === 'withered' || p.dry ? 'dry' : 'moist')

// Casa da série (lote M): mesma largura e mesmo pé da casa de antes (scene/house.png a 220, pé em y −12).
const HOUSE_W = 220
const HOUSE_FOOT = { x: -230, y: -12 }
/** Pé da casinha na ordem de desenho (a quina de baixo do desenho fica em ~−101; a de onde o cachorro passa, mais alta). */
const DOGHOUSE_FOOT_Y = -120
/** Cachorro correndo até o ladrão: por cima de tudo da camada do pé até voltar. */
const BITE_Z = 1e5
/**
 * Luzes da noite em cada casa: [x, y, largura, altura, intensidade] em px do desenho de 320×320 (janelas
 * e a luz da porta no chão). Medidas nas casas do lote M.
 */
const HOUSE_LIGHTS: Record<string, [number, number, number, number, number][]> = {
  sitio: [[110, 192, 40, 46, 1], [236, 198, 40, 46, 1], [142, 262, 70, 36, 0.55]],
  arco_iris: [[83, 190, 40, 46, 1], [250, 200, 40, 46, 1], [135, 130, 34, 38, 0.9], [128, 262, 70, 36, 0.55]],
  inverno: [[82, 196, 40, 46, 1], [236, 190, 40, 46, 1], [106, 136, 34, 38, 0.9], [118, 264, 70, 36, 0.55]],
}

const SAY: Record<AnimalKind, string> = {
  cow: 'Muu!', sheep: 'Méé!', pig: 'Óinc!', chicken: 'Có!', dog: 'Au!',
  donkey: 'Ii-óó!', peacock: 'Mi-áu!', duck: 'Quá quá!', rabbit: '*fun fun*', goat: 'Bééé!', bee: 'Bzzz!',
}

/** Tamanho na cena (largura do quadro), velocidade e largura da sombra (fração) de cada bicho. */
/** `speed` 0 = não anda (a colmeia só bate as asas das abelhas); `foot` = pé no quadro (padrão 0,95). */
const ANIMAL_SPEC: Record<HerdKind, { width: number; speed: number; shadow: number; foot?: number }> = {
  cow: { width: 96, speed: 18, shadow: 0.72 }, sheep: { width: 70, speed: 16, shadow: 0.72 },
  pig: { width: 64, speed: 20, shadow: 0.72 }, chicken: { width: 42, speed: 30, shadow: 0.6 },
  donkey: { width: 92, speed: 17, shadow: 0.66 }, peacock: { width: 66, speed: 22, shadow: 0.5 },
  duck: { width: 40, speed: 24, shadow: 0.6 }, rabbit: { width: 34, speed: 34, shadow: 0.6 }, goat: { width: 66, speed: 19, shadow: 0.66 },
  bee: { width: 72, speed: 0, shadow: 0.55, foot: 0.84 }, // colmeia de palha com 3 quadros de abelhas (lote Q, A2)
}

/** Qual rajada de partículas uma mudança de estado do lote merece (null = nenhuma). */
/**
 * Vitrine: nenhum objeto da cena (lote, bicho, cachorro, casa, enfeite, tigela, visitante) recebe toque, hover ou
 * cursor. O Pixi escuta o movimento no document inteiro: sem isto o hover ainda chegaria aos lotes e bichos.
 */
export function lockObjects(stage: Container) {
  stage.eventMode = 'none'
  stage.interactiveChildren = false
}

export function plotBurst(a: ScenePlot, b: ScenePlot): Burst | null {
  if (a.state === 'ripe' && b.state !== 'ripe') return 'harvest' // colheu (ou roubaram)
  if (a.state === 'ripe' && b.state === 'ripe' && a.canSteal && !b.canSteal) return 'harvest' // você pegou
  if (a.state === 'withered' && b.state === 'empty') return 'dust' // limpou com a enxada
  if (a.state === 'empty' && b.state === 'growing') return 'dust' // arou e plantou
  if (a.dry && !b.dry && b.state !== 'empty') return 'water' // regou
  if ((b.weeds ?? 0) < (a.weeds ?? 0)) return 'leaves' // tirou erva
  if ((b.pests ?? 0) < (a.pests ?? 0)) return 'dust' // tirou praga
  if (a.state === 'growing' && b.state === 'ripe') return 'sparkle' // amadureceu
  return null
}
