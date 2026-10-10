// Destaque de "dá para clicar" (mouse em cima do bicho, da casinha, da tigela, dos objetos do evento): o tom clareia
// com um toque dourado, um contorno creme abraça a silhueta e o objeto dá um pulinho de ~4% ao entrar. Um filtro só
// (um passe), e só no objeto em hover: ao sair, volta tudo exatamente como estava (escala, filtros) e o filtro sai.
// No toque não há hover: um flash curto do mesmo efeito confirma o toque. Movimento reduzido: sem o pulinho.
import { defaultFilterVert, Filter, GlProgram, GpuProgram, UniformGroup, type Container, type FederatedPointerEvent } from 'pixi.js'

/** Entrada e saída do tom/contorno (s). */
export const HOVER_S = 0.13
/** Flash do toque (s), contando a subida. */
export const FLASH_S = 0.15
/** Pulinho de escala no destaque cheio. */
const BUMP = 0.04
/** Contorno em px de tela (não muda com o zoom do mundo). */
const RING = 2.5
/** Creme do jogo (o mesmo tom do botão de convite). */
const CREAM = [1, 0.96, 0.78] as const

const frag = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize; // mesma precisão do vertex (senão o programa não liga)
uniform highp vec4 uInputClamp;
uniform float uK;
uniform float uRing;
uniform vec3 uColor;

float around(vec2 uv, float r) {
  float a = 0.0;
  for (int i = 0; i < 12; i++) {
    float t = float(i) * 0.5235988;
    vec2 p = clamp(uv + vec2(cos(t), sin(t)) * r * uInputSize.zw, uInputClamp.xy, uInputClamp.zw);
    a = max(a, texture(uTexture, p).a);
  }
  return a;
}

void main() {
  vec4 c = texture(uTexture, vTextureCoord);
  float ring = max(around(vTextureCoord, uRing * 0.5), around(vTextureCoord, uRing));
  float halo = around(vTextureCoord, uRing + 1.5) * 0.45;
  float o = max(ring, halo) * (1.0 - c.a) * uK;
  vec3 lit = min(c.rgb * (1.0 + 0.14 * uK) + vec3(0.05, 0.035, 0.0) * uK * c.a, vec3(c.a));
  finalColor = vec4(lit + uColor * o, c.a + o);
}
`

const wgsl = `
struct GlobalFilterUniforms {
  uInputSize: vec4<f32>, uInputPixel: vec4<f32>, uInputClamp: vec4<f32>,
  uOutputFrame: vec4<f32>, uGlobalFrame: vec4<f32>, uOutputTexture: vec4<f32>,
};
struct HoverUniforms { uK: f32, uRing: f32, uColor: vec3<f32> };
@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> hover: HoverUniforms;
struct VSOutput { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32> };

@vertex
fn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput {
  var p = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
  p.x = p.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
  p.y = p.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
  return VSOutput(vec4(p, 0.0, 1.0), aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw));
}

fn around(uv: vec2<f32>, r: f32) -> f32 {
  var a = 0.0;
  for (var i = 0; i < 12; i++) {
    let t = f32(i) * 0.5235988;
    let p = clamp(uv + vec2(cos(t), sin(t)) * r * gfu.uInputSize.zw, gfu.uInputClamp.xy, gfu.uInputClamp.zw);
    a = max(a, textureSampleLevel(uTexture, uSampler, p, 0.0).a);
  }
  return a;
}

@fragment
fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let c = textureSampleLevel(uTexture, uSampler, uv, 0.0);
  let ring = max(around(uv, hover.uRing * 0.5), around(uv, hover.uRing));
  let halo = around(uv, hover.uRing + 1.5) * 0.45;
  let o = max(ring, halo) * (1.0 - c.a) * hover.uK;
  let lit = min(c.rgb * (1.0 + 0.14 * hover.uK) + vec3(0.05, 0.035, 0.0) * hover.uK * c.a, vec3(c.a));
  return vec4(lit + hover.uColor * o, c.a + o);
}
`

let programs: { gl: GlProgram; gpu: GpuProgram } | null = null

/** Filtro do destaque: `k` de 0 (nada) a 1 (destaque cheio). */
export class HoverFilter extends Filter {
  constructor() {
    programs ??= {
      gl: GlProgram.from({ vertex: defaultFilterVert, fragment: frag, name: 'hover-filter' }),
      gpu: GpuProgram.from({ vertex: { source: wgsl, entryPoint: 'mainVertex' }, fragment: { source: wgsl, entryPoint: 'mainFragment' } }),
    }
    super({
      glProgram: programs.gl,
      gpuProgram: programs.gpu,
      resources: {
        hover: new UniformGroup({
          uK: { value: 0, type: 'f32' },
          uRing: { value: RING, type: 'f32' },
          uColor: { value: new Float32Array(CREAM), type: 'vec3<f32>' },
        }),
      },
      padding: Math.ceil(RING + 3),
      resolution: 'inherit',
      antialias: 'inherit',
    })
  }

  get k(): number { return this.resources.hover.uniforms.uK }
  set k(v: number) { this.resources.hover.uniforms.uK = v }
}

type Live = {
  /** Escala (o pulinho) vai aqui: o nó dos pés, que ninguém mais escala (o corpo é do passeio e do arrasto). */
  node: Container
  /** Filtro vai aqui: o corpo inteiro (com os acessórios), sem o balão de fala. */
  fx: Container
  base: { x: number; y: number }
  prev: Filter[] | null
  filter: HoverFilter
  strength: number
  bump: boolean
  /** Tom/contorno: progresso linear 0..1 e para onde vai. */
  t: number
  to: 0 | 1
  /** Pulinho: mola (posição e velocidade), 0 = escala de sempre. */
  s: number
  v: number
  /** Flash do toque: tempo até começar a sair. */
  flash: number
}

export type HoverOpts = {
  /** Onde vai o filtro (padrão: o próprio nó). Nos bichos, o `body` do Wanderer. */
  fx?: Container
  /** Versão leve (visita, bicho sem ação): metade do contorno, do brilho e do pulinho. */
  light?: boolean
  /** false = sem o pulinho (o lote: a planta não pode descolar da terra). */
  bump?: boolean
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/** Destaques em andamento. Um objeto só aparece aqui enquanto tem efeito (o resto da cena não paga nada). */
export class HoverFx {
  private live = new Map<Container, Live>()
  /** O que está sob o mouse (um só): o Pixi às vezes não manda o `pointerout` (ver bindHover). */
  private pointed: Container | null = null

  constructor(private calm = false, private make: () => HoverFilter = () => new HoverFilter()) {}

  /** Quantos objetos estão com o filtro agora (testes e medição). */
  get active() { return this.live.size }

  on(node: Container, opts: HoverOpts = {}) {
    if (node.destroyed) return
    let l = this.live.get(node)
    if (!l) {
      const fx = opts.fx ?? node
      const filter = this.make()
      const prev = fx.filters?.length ? [...fx.filters] : null
      l = { node, fx, base: { x: node.scale.x, y: node.scale.y }, prev, filter, strength: 1, bump: true, t: 0, to: 1, s: 0, v: 0, flash: 0 }
      fx.filters = prev ? [...prev, filter] : [filter]
      this.live.set(node, l)
    }
    l.strength = opts.light ? 0.5 : 1
    l.bump = opts.bump ?? true
    l.to = 1
    l.flash = 0
  }

  off(node: Container) {
    const l = this.live.get(node)
    if (l) { l.to = 0; l.flash = 0 }
  }

  get pointing() { return this.pointed }

  /** Mouse entrou no objeto: o anterior (se o Pixi não avisou a saída dele) sai junto. */
  point(node: Container, opts: HoverOpts = {}) {
    if (this.pointed && this.pointed !== node) this.off(this.pointed)
    this.pointed = node
    this.on(node, opts)
  }

  unpoint(node: Container) {
    if (this.pointed === node) this.pointed = null
    this.off(node)
  }

  /** Mouse saiu da cena (para a barra, a HUD, o tutorial, fora da janela): nada fica aceso. */
  leave() {
    if (this.pointed) this.off(this.pointed)
    this.pointed = null
  }

  /** Toque (sem hover no celular): o mesmo efeito, curtinho. */
  flash(node: Container, opts: HoverOpts = {}) {
    this.on(node, opts)
    const l = this.live.get(node)
    if (l) l.flash = FLASH_S
  }

  /** Tira tudo na hora (objeto saindo da cena, modo editar). */
  clear(node?: Container) {
    for (const l of node ? [this.live.get(node)].filter((x): x is Live => !!x) : [...this.live.values()]) this.restore(l)
  }

  update(dt: number) {
    for (const l of this.live.values()) {
      if (l.node.destroyed || l.fx.destroyed) { this.live.delete(l.node); continue }
      if (l.flash > 0 && (l.flash -= dt) <= 0) l.to = 0
      l.t = l.to ? Math.min(1, l.t + dt / HOVER_S) : Math.max(0, l.t - dt / HOVER_S)
      l.filter.k = smooth(l.t) * l.strength
      // Pulinho: mola um pouco solta (passa ~10% do alvo e assenta), contínua mesmo invertendo no meio.
      if (!this.calm) {
        const target = l.bump ? l.to * BUMP * l.strength : 0
        for (let left = dt; left > 0; left -= 1 / 240) {
          const h = Math.min(left, 1 / 240)
          l.v += (-(l.s - target) * 1400 - l.v * 42) * h
          l.s += l.v * h
        }
        l.node.scale.set(l.base.x * (1 + l.s), l.base.y * (1 + l.s))
      }
      // Assentou (0,1% de escala é menos de 1 px): volta ao exato de antes.
      if (!l.to && !l.t && Math.abs(l.s) < 1e-3 && Math.abs(l.v) < 0.05) this.restore(l)
    }
  }

  private restore(l: Live) {
    this.live.delete(l.node)
    if (this.pointed === l.node) this.pointed = null
    if (!l.node.destroyed) l.node.scale.set(l.base.x, l.base.y)
    if (!l.fx.destroyed) l.fx.filters = l.prev
    l.filter.destroy()
  }
}

/**
 * O cursor está em cima de HTML (HUD, barra, tutorial) e não do canvas? O Pixi segue testando a cena por baixo
 * com o `pointermove` do documento e manda `pointerover` sem o `pointerout` correspondente quando o mouse volta.
 */
export function overHtml(e: FederatedPointerEvent) {
  if (typeof document === 'undefined' || !document.elementFromPoint) return false
  const el = document.elementFromPoint(e.clientX, e.clientY)
  return !!el && el.tagName !== 'CANVAS'
}

/**
 * Liga o destaque num objeto clicável: mouse em cima = destaque; toque = flash curto. `opts` é lido a cada
 * entrada (a versão leve pode mudar: a visita começou, o bicho ficou pronto). `allow` = pode agora? (arrastando
 * a câmera, modo editar, toque que virou arraste: não). Quem usa chama `fx.leave()` quando o mouse sai do canvas.
 */
export function bindHover(fx: HoverFx, node: Container, opts: () => HoverOpts = () => ({}), allow: (kind: 'hover' | 'tap') => boolean = () => true) {
  const mouse = (e: FederatedPointerEvent) => e.pointerType === 'mouse' || e.pointerType === 'pen'
  node.on('pointerover', (e) => { if (mouse(e) && allow('hover') && !overHtml(e)) fx.point(node, opts()) })
  node.on('pointerout', (e) => { if (mouse(e)) fx.unpoint(node) })
  // Entrou por baixo de um HTML (o tutorial) e saiu dele ainda em cima do objeto: acende agora; o contrário apaga.
  node.on('pointermove', (e) => {
    if (!mouse(e)) return
    const mine = fx.pointing === node
    if (mine === !overHtml(e)) return
    if (mine) fx.unpoint(node)
    else if (allow('hover')) fx.point(node, opts())
  })
  node.on('pointertap', (e) => { if (!mouse(e) && allow('tap')) fx.flash(node, opts()) })
}
