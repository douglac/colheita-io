import { describe, expect, it } from 'vitest'
import { DRAG_SLOP, DragGate, edges, itemTarget, pageTarget, revealTarget, wheelToX } from '@/components/hscroll-math'

// 20 itens de 84 px com 8 px entre eles: começam a cada 92 px. Faixa visível de 400 px.
const starts = Array.from({ length: 20 }, (_, i) => i * 92)
const scroll = 19 * 92 + 84 // 1832
const at = (left: number) => ({ left, width: 400, scroll })

describe('faixa horizontal: pontas', () => {
  it('no começo só dá para ir para a direita; no fim, só para a esquerda', () => {
    expect(edges(at(0))).toEqual({ overflow: true, atStart: true, atEnd: false })
    expect(edges(at(scroll - 400))).toEqual({ overflow: true, atStart: false, atEnd: true })
    expect(edges(at(scroll - 400.6))).toMatchObject({ atEnd: true }) // arredondamento do navegador
    expect(edges(at(300))).toMatchObject({ atStart: false, atEnd: false })
  })
  it('sem transbordar, não há para onde rolar', () => {
    expect(edges({ left: 0, width: 400, scroll: 400 })).toEqual({ overflow: false, atStart: true, atEnd: true })
  })
})

describe('faixa horizontal: página', () => {
  it('avança uma largura visível, parando no item que estava cortado na borda', () => {
    // visíveis 0..400: o item que começa em 368 está cortado → vira o primeiro da próxima página
    expect(pageTarget(at(0), 1, starts)).toBe(368)
    expect(pageTarget(at(0), 1)).toBe(400) // sem itens: exatamente a largura visível
  })
  it('para no fim e no começo (seta desabilita)', () => {
    expect(pageTarget(at(1300), 1, starts)).toBe(scroll - 400)
    expect(pageTarget(at(200), -1, starts)).toBe(0)
    expect(edges(at(pageTarget(at(1300), 1, starts))).atEnd).toBe(true)
  })
  it('voltar uma página deixa o primeiro item inteiro', () => {
    const left = pageTarget(at(920), -1, starts)
    expect(starts).toContain(left)
    expect(left).toBeGreaterThanOrEqual(920 - 400)
  })
  it('ida e volta cobre todos os itens sem pular nenhum', () => {
    let left = 0
    const seen = new Set<number>()
    for (let i = 0; i < 10; i++) {
      starts.forEach((s, k) => { if (s >= left && s + 84 <= left + 400) seen.add(k) })
      left = pageTarget(at(left), 1, starts)
    }
    starts.forEach((s, k) => { if (s >= left && s + 84 <= left + 400) seen.add(k) })
    expect(seen.size).toBe(20)
  })
})

describe('faixa horizontal: item a item (← →)', () => {
  it('vai para o início do próximo e do anterior', () => {
    expect(itemTarget(at(0), 1, starts)).toBe(92)
    expect(itemTarget(at(100), 1, starts)).toBe(184)
    expect(itemTarget(at(184), -1, starts)).toBe(92)
    expect(itemTarget(at(0), -1, starts)).toBe(0)
    expect(itemTarget(at(scroll - 400), 1, starts)).toBe(scroll - 400)
  })
})

describe('faixa horizontal: foco do teclado mostra o item inteiro', () => {
  it('item já visível não mexe; cortado à direita traz até caber, parando no início de um item', () => {
    expect(revealTarget(at(0), 92, 84, starts)).toBe(0)
    const left = revealTarget(at(0), 368, 84, starts) // 368..452 passa de 400
    expect(starts).toContain(left)
    expect(368 + 84).toBeLessThanOrEqual(left + 400)
    expect(revealTarget(at(500), 184, 84, starts)).toBe(184) // escondido à esquerda
    expect(revealTarget(at(0), starts[19], 84, starts)).toBe(scroll - 400) // último: vai ao fim
  })
})

describe('faixa horizontal: roda do mouse', () => {
  it('roda vertical e Shift+roda viram horizontal; linhas viram px', () => {
    expect(wheelToX({ deltaX: 0, deltaY: 120 })).toBe(120)
    expect(wheelToX({ deltaX: -40, deltaY: 3 })).toBe(-40)
    expect(wheelToX({ deltaX: 0, deltaY: 3, deltaMode: 1 })).toBe(48)
  })
})

describe('arrastou ≠ clicou', () => {
  it('toque parado (até 8 px) é clique', () => {
    const g = new DragGate()
    g.start(100, 100)
    g.move(104, 103)
    g.end()
    expect(g.takeClick()).toBe(true)
  })
  it('andou mais de 8 px: é arrasto e o clique não seleciona', () => {
    const g = new DragGate()
    g.start(100, 100)
    expect(g.move(100 + DRAG_SLOP + 1, 100)).toBe(true)
    g.move(100, 100) // voltar ao lugar não desfaz o arrasto
    g.end()
    expect(g.takeClick()).toBe(false)
    expect(g.takeClick()).toBe(true) // o próximo clique, de outro gesto, vale
  })
  it('movimento sem apertar não conta', () => {
    const g = new DragGate()
    expect(g.move(500, 500)).toBe(false)
    expect(g.takeClick()).toBe(true)
  })
})
