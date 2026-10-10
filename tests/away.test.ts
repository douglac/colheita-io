// Mural com novidades e "Enquanto você estava fora".
import { describe, expect, it } from 'vitest'
import { awaySummary, awayWorthShowing, goBack, lastId, unseenCount, type FeedEvent } from '../src/game/away'

let id = 0
const ev = (kind: string, actor: string | null, payload: Record<string, unknown> = {}): FeedEvent => ({ id: ++id, kind, actor, payload, at: 0 })

describe('mural', () => {
  it('conta só novidades depois do visto (compra, venda e nível não contam)', () => {
    id = 0
    const list = [ev('stolen', 'bia', { seedId: 'nabo', qty: 2 }), ev('bought', null), ev('helped', 'caio'), ev('level_up', null), ev('visited', 'duda')]
    expect(unseenCount(list, 0)).toBe(3)
    expect(unseenCount(list, 2)).toBe(2)
    expect(lastId(list)).toBe(5)
  })
  it('atalho certo para cada ação', () => {
    expect(goBack({ kind: 'stolen', actor: 'bia' })).toBe('revenge')
    expect(goBack({ kind: 'sabotaged', actor: 'bia' })).toBe('revenge')
    expect(goBack({ kind: 'helped', actor: 'bia' })).toBe('return')
    expect(goBack({ kind: 'friend_ripe', actor: 'bia' })).toBe('run')
    expect(goBack({ kind: 'stolen', actor: null })).toBeNull()
    expect(goBack({ kind: 'sold', actor: 'bia' })).toBeNull()
  })
})

describe('enquanto você estava fora', () => {
  it('1 linha por pessoa, juntando o que ela fez, e o roubo primeiro', () => {
    id = 0
    const list = [
      ev('visited', 'duda'),
      ev('helped', 'caio', { tool: 'water' }), ev('helped', 'caio', { tool: 'pesticide' }),
      ev('visited', 'bia'), ev('stolen', 'bia', { seedId: 'nabo', qty: 3 }), ev('stolen', 'bia', { seedId: 'nabo', qty: 2 }),
      ev('sabotaged', 'bia', { kind: 'pest' }), ev('stolen', 'bia', { item: 'ovo', qty: 1, slot: 'chicken' }),
      ev('bitten', 'edu', { gold: 12 }),
    ]
    const lines = awaySummary(list, 0)
    expect(lines.map((l) => l.actor)).toEqual(['bia', 'edu', 'caio', 'duda'])
    expect(lines[0].text).toMatch(/^bia pegou 5 Nabo e 1 \S+ da sua fazenda e aprontou na sua horta$/)
    expect(lines[0].go).toBe('revenge')
    expect(lines[1].text).toBe('edu levou mordida do seu cachorro (+12 de ouro para você)')
    expect(lines[2].text).toBe('caio regou e tirou praga na sua horta 2 vezes')
    expect(lines[2].go).toBe('return')
    expect(lines[3].text).toBe('duda passou pela sua fazenda')
  })
  it('ignora o que já foi visto e o que não tem autor', () => {
    id = 0
    const list = [ev('stolen', 'bia', { seedId: 'nabo', qty: 1 }), ev('dog_hungry', null), ev('helped', 'caio')]
    expect(awaySummary(list, 1).map((l) => l.actor)).toEqual(['caio'])
  })
  it('só visita não abre a janela; roubo, ajuda ou presente abrem', () => {
    id = 0
    expect(awayWorthShowing(awaySummary([ev('visited', 'duda')], 0))).toBe(false)
    expect(awayWorthShowing(awaySummary([ev('visited', 'duda'), ev('gift', 'bia', { seedId: 'nabo' })], 0))).toBe(true)
  })
})
