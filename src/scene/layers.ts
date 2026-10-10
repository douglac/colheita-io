// Camadas por cima do corpo do bicho (acessórios do lote O): a arte de cada peça é desenhada na mesma grade do
// adulto (192×192 a vaca, o burro e o cachorro), quadro a quadro. Então a camada só cai no lugar se usar o quadro
// do mesmo índice e a mesma âncora, escala e posição do sprite do corpo, e só se o corpo estiver num desses quadros
// (no sprite estático antigo, scene/cow.png, ou num quadro de outra arte, como o "mordendo" do guarda, ela some).
import type { Sprite, Texture } from 'pixi.js'
import type { AccessorySpot } from '@/game/livestock'

/** Quadros do corpo (os do adulto que a arte da camada acompanha). */
export type Frames = { walk: Texture[]; idle: Texture[] }

/** Uma peça vestida: o sprite dela e os quadros na mesma ordem dos do corpo. */
export type Layer = Frames & { sprite: Sprite }

/** Quadro da camada para o quadro em que o corpo está; null = o corpo não está em nenhum quadro da grade. */
export function layerFrame(bodyTex: Texture, body: Frames, layer: Frames): Texture | null {
  const w = body.walk.indexOf(bodyTex)
  if (w >= 0) return layer.walk[w] ?? null
  const i = body.idle.indexOf(bodyTex)
  if (i >= 0) return layer.idle[i] ?? null
  return null
}

/** Põe a camada no quadro, na âncora, na escala e na posição do corpo; esconde se o corpo saiu da grade. */
export function syncLayer(body: Sprite, frames: Frames | undefined, layer: Layer) {
  const sp = layer.sprite
  const tex = frames && !body.destroyed ? layerFrame(body.texture, frames, layer) : null
  sp.visible = !!tex && body.visible
  if (!tex) return
  if (sp.texture !== tex) sp.texture = tex
  sp.anchor.set(body.anchor.x, body.anchor.y)
  sp.scale.set(body.scale.x, body.scale.y)
  sp.position.set(body.position.x, body.position.y)
  sp.rotation = body.rotation
  sp.alpha = body.alpha
}

/** Ordem de desenho por cima do corpo: sela nas costas, depois o pescoço (lenço por baixo da coleira), por fim a cabeça. */
const SPOT_ORDER: Record<AccessorySpot, number> = { costas: 0, pescoco: 1, cabeca: 2 }
export function layerOrder(a: { id: string; spot: AccessorySpot }, b: { id: string; spot: AccessorySpot }) {
  return SPOT_ORDER[a.spot] - SPOT_ORDER[b.spot] || Number(b.id.endsWith('_lenco')) - Number(a.id.endsWith('_lenco'))
}
