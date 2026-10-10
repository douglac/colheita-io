import { describe, expect, it } from 'vitest'
import { assistant } from '../src/game/assistant'
import type { PlotView } from '../src/game/rules'

const p = (idx: number, v: Partial<PlotView>): PlotView => ({ idx, state: 'growing', ...v })

describe('assistente', () => {
  it('resume a fazenda em ordem de urgência, com a ferramenta que resolve', () => {
    const plots = [p(0, { state: 'ripe' }), p(1, { state: 'ripe' }), p(2, { dry: true, pests: 1 }), p(3, { weeds: 2 }), p(4, { state: 'withered' }), p(5, { state: 'empty' })]
    const items = assistant(plots, [{ ready: true, hungry: false }, { ready: false, hungry: true }], { awake: false })
    expect(items.map((i) => [i.key, i.n, i.tool])).toEqual([
      ['ripe', 2, 'hand'], ['animals', 1, 'hand'], ['dry', 1, 'water'], ['pests', 1, 'pesticide'], ['weeds', 1, 'herbicide'],
      ['withered', 1, 'hoe'], ['hungry', 1, 'feed'], ['dog', 1, 'dog'],
    ])
    expect(items[0].text).toBe('2 lotes maduros')
    expect(items[5].text).toBe('1 planta seca para limpar')
  })
  it('fazenda em dia não tem aviso (cachorro acordado e sem cachorro também não)', () => {
    expect(assistant([p(0, {}), p(1, { state: 'empty' })], [], { awake: true })).toEqual([])
    expect(assistant([], [], null)).toEqual([])
  })
})
