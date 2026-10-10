// Ordem de desenho pelo pé (Evolução 31): as plantas dos lotes, os bichos, o guarda, os enfeites, a casa, a casinha,
// as árvores, as cercas e a carroça ficam numa camada só (sortableChildren), cada um com o zIndex do seu pé. Antes
// eram três camadas (casinha + cachorro, lotes, bichos + enfeites), e nenhuma ordem entre elas acertava tudo: o
// cavalo-guarda parado entre a carroça (atrás) e a planta do lote 0 (na frente) ganhava os varais na cabeça (QA nível
// máximo, 6ª e 7ª rodadas). O Pixi só reordena quando um zIndex muda (o setter ignora o mesmo valor): com nada
// andando, não há custo por quadro. A terra dos lotes fica embaixo da camada; balões, números, prévia e mão, em cima.
import { Rectangle, Sprite, Texture } from 'pixi.js'
import { TILE_H, TILE_W } from './iso'
import { FIELD_MARGIN, plotPos } from './layout'

/** Profundidade do pé (x, y): o y, com desempate pelo x (o da direita na frente) em menos de 0,1. */
export const footZ = (x: number, y: number) => y + x * 1e-4

/**
 * Quanto o pé da planta sobe acima da ponta de baixo do losango. O bicho fica a FIELD_MARGIN da roça (perpendicular à
 * borda, que sobe 1 a cada 2): na frente da borda, o mais alto que ele chega é 8,4 acima da ponta, na quina do lote
 * (o pavão em (−194, 71), 1 acima da ponta do lote 9, está na frente dele). Mais 2 de folga, porque o passeio
 * arredonda o chão numa grade de 2 (pastureBlockedFast). Atrás da roça ele fica a ≥ 57 da ponta: nada muda.
 */
export const PLOT_FOOT_LIFT = Math.ceil(TILE_H / 2 - FIELD_MARGIN * Math.hypot(1, 0.5)) + 2

/** Pé da planta do lote `idx` (ponta de baixo do losango, subida de PLOT_FOOT_LIFT). */
export function plotFootZ(idx: number) {
  const p = plotPos(idx)
  return footZ(p.x, p.y + TILE_H / 2 - PLOT_FOOT_LIFT)
}

/**
 * Borda de baixo do losango do lote (centro cx, cy) no x dado: é contra ela que um pé em x fica na frente ou atrás
 * da planta. Fora da largura do lote, a quina (cy). Usado pelo QA (scripts/qa/overlap.mjs faz a mesma conta).
 */
export const plotEdgeY = (cx: number, cy: number, x: number) => cy + Math.max(0, TILE_H / 2 - Math.abs(x - cx) * (TILE_H / TILE_W))

type Pt = { x: number; y: number }

/**
 * Peça de cerca diagonal fatiada na vertical: cada fatia ganha o pé da reta entre os dois postes (`a`, `b`, em px da
 * arte) no meio dela. Assim o bicho fica atrás da cerca onde o pé dele está atrás da reta, e na frente onde está na
 * frente. `ox`, `oy` = canto de cima-esquerda da peça no mundo; `k` = escala.
 */
export function fenceSlices(tex: Texture, k: number, ox: number, oy: number, a: Pt, b: Pt, slices = 8): Sprite[] {
  const sw = tex.width / slices, out: Sprite[] = []
  for (let i = 0; i < slices; i++) {
    const fx = i * sw
    const t = new Texture({ source: tex.source, frame: new Rectangle(tex.frame.x + fx, tex.frame.y, sw, tex.height) })
    const sp = new Sprite(t)
    sp.scale.set(k)
    sp.position.set(ox + fx * k, oy)
    const cx = fx + sw / 2
    const footY = a.y + ((b.y - a.y) * (cx - a.x)) / (b.x - a.x)
    sp.zIndex = footZ(ox + cx * k, oy + footY * k)
    sp.eventMode = 'none'
    out.push(sp)
  }
  return out
}
