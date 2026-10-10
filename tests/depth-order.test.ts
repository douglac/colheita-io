import { Container } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { FIXED_ORNAMENT, ornamentBase } from '../src/game/decor-grid'
import { footZ, PLOT_FOOT_LIFT, plotEdgeY, plotFootZ } from '../src/scene/depth-order'
import { TILE_H, TILE_W } from '../src/scene/iso'
import { FIELD_MARGIN, farmBlocked, plotPos } from '../src/scene/layout'

// Camada única ordenada pelo pé (Evolução 31): monta a camada como a cena (sortableChildren + zIndex do pé),
// põe os nós fora de ordem e confere quem é desenhado na frente de quem.
function layer(items: Record<string, number>) {
  const c = new Container()
  c.sortableChildren = true
  const nodes = new Map<string, Container>()
  for (const [label, z] of Object.entries(items).reverse()) {
    const n = new Container({ label })
    n.zIndex = z
    c.addChild(n)
    nodes.set(label, n)
  }
  c.sortChildren()
  const at = (label: string) => c.children.indexOf(nodes.get(label)!)
  return { c, nodes, front: (a: string, b: string) => at(a) > at(b) }
}

const cart = ornamentBase('lago_patinhos', FIXED_ORNAMENT.u, FIXED_ORNAMENT.v) // carroça/chafariz: pegada 2×2 fixa

describe('ordem de desenho pelo pé', () => {
  it('cavalo-guarda na frente da carroça e atrás da planta do lote 0 (P1 da 6ª/7ª rodada)', () => {
    // A ponta esquerda da patrulha, onde o QA pegou os varais por cima da cabeça.
    const horse = { x: 108, y: -123 }
    expect(horse.y).toBeGreaterThan(cart.y)
    const l = layer({ carroca: footZ(cart.x, cart.y), cavalo: footZ(horse.x, horse.y), lote0: plotFootZ(0) })
    expect(l.front('cavalo', 'carroca')).toBe(true)
    expect(l.front('lote0', 'cavalo')).toBe(true)
  })

  it('cavalo atrás da carroça fica atrás dela', () => {
    const l = layer({ carroca: footZ(cart.x, cart.y), cavalo: footZ(cart.x - 20, cart.y - 12), lote0: plotFootZ(0) })
    expect(l.front('carroca', 'cavalo')).toBe(true)
    expect(l.front('lote0', 'carroca')).toBe(true)
  })

  it('o mesmo cavalo troca de lugar com a carroça quando anda (reordena só quando o pé muda)', () => {
    const l = layer({ carroca: footZ(cart.x, cart.y), cavalo: footZ(108, cart.y - 10) })
    expect(l.front('carroca', 'cavalo')).toBe(true)
    const horse = l.nodes.get('cavalo')!
    horse.zIndex = footZ(108, cart.y + 10)
    expect(l.c.sortDirty).toBe(true)
    l.c.sortChildren()
    expect(l.front('cavalo', 'carroca')).toBe(true)
    // Parado: o mesmo zIndex não suja a camada (sem reordenar a cada quadro).
    horse.zIndex = footZ(108, cart.y + 10)
    expect(l.c.sortDirty).toBe(false)
  })

  it('bicho atrás da borda de trás da roça fica embaixo das plantas (P2)', () => {
    // O pato 4 da 7ª rodada, atrás dos lotes 13–14.
    for (const duck of [{ x: 354, y: 5 }, { x: 364, y: 28 }]) {
      const l = layer({ pato: footZ(duck.x, duck.y), lote13: plotFootZ(13), lote14: plotFootZ(14) })
      expect(l.front('lote13', 'pato')).toBe(true)
      expect(l.front('lote14', 'pato')).toBe(true)
    }
    // Solto à mão no chão livre mais perto da borda de trás, no meio de cada lote da fileira de trás.
    for (const idx of [0, 1, 2, 12, 13, 14]) {
      const p = plotPos(idx)
      let y = p.y - TILE_H / 2
      while (farmBlocked(p.x, y)) y -= 1
      const l = layer({ bicho: footZ(p.x, y), lote: plotFootZ(idx) })
      expect(l.front('lote', 'bicho'), `lote ${idx}, bicho em (${p.x}, ${y})`).toBe(true)
    }
  })

  it('enfeite alto atrás do lote 14 fica embaixo da planta (P3)', () => {
    const p = plotPos(14)
    const tree = { x: p.x + 30, y: p.y - TILE_H / 2 - 20 } // faixa à direita/atrás do lote 14
    const l = layer({ arvore: footZ(tree.x, tree.y), lote14: plotFootZ(14) })
    expect(l.front('lote14', 'arvore')).toBe(true)
  })

  it('bicho na frente da borda da roça fica por cima, até na quina do lote', () => {
    // O pavão da 7ª rodada: 32 abaixo da ponta esquerda da roça, 1 acima da ponta de baixo do lote 9.
    const pav = { x: -194, y: 71 }
    expect(pav.y).toBeLessThan(plotPos(9).y + TILE_H / 2)
    expect(layer({ pavao: footZ(pav.x, pav.y), lote9: plotFootZ(9) }).front('pavao', 'lote9')).toBe(true)
    // Pior caso: na frente da borda, o mais perto que o passeio deixa, na quina de cada lote da frente.
    const clear = FIELD_MARGIN * Math.hypot(1, 0.5)
    for (const idx of [9, 10, 11, 21, 22, 23, 14, 17, 20]) {
      const p = plotPos(idx)
      for (const side of [-1, 1]) {
        const x = p.x + (side * TILE_W) / 2, y = p.y + clear - 2 // 2 de folga: o passeio arredonda o chão
        expect(layer({ bicho: footZ(x, y), lote: plotFootZ(idx) }).front('bicho', 'lote'), `lote ${idx} lado ${side}`).toBe(true)
      }
    }
  })

  it('a ordem entre os lotes não muda (o de trás embaixo) e a borda segue o losango', () => {
    for (let a = 0; a < 24; a++) for (let b = 0; b < 24; b++) {
      if (plotPos(a).y < plotPos(b).y) expect(plotFootZ(a)).toBeLessThan(plotFootZ(b))
    }
    const p = plotPos(9)
    expect(plotEdgeY(p.x, p.y, p.x)).toBe(p.y + TILE_H / 2)
    expect(plotEdgeY(p.x, p.y, p.x - TILE_W / 2)).toBe(p.y)
    expect(plotEdgeY(p.x, p.y, p.x - TILE_W)).toBe(p.y)
    expect(PLOT_FOOT_LIFT).toBeGreaterThan(TILE_H / 2 - FIELD_MARGIN * Math.hypot(1, 0.5))
  })
})
