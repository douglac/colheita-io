import { describe, expect, it } from 'vitest'
import { gameDay, levelForXp, ownerFloor, plotState, stageAt, stealQty, viewPlot, xpToReach } from '../src/game/rules'

const base = { idx: 0, seed_id: 'nabo', yield_total: 10, yield_left: 10, withered: false }

describe('crescimento', () => {
  it('estado depende só dos timestamps e de now', () => {
    const p = { ...base, planted_at: 1000, ready_at: 2000 }
    expect(plotState(p, 1500)).toBe('growing')
    expect(plotState(p, 2000)).toBe('ripe')
    expect(plotState({ ...p, withered: true }, 1500)).toBe('withered')
    expect(plotState({ ...p, seed_id: null, planted_at: null, ready_at: null }, 0)).toBe('empty')
  })

  it('estágios 0..4 durante o crescimento e 5 quando madura', () => {
    expect(stageAt(0, 100, 0)).toBe(0)
    expect(stageAt(0, 100, 30)).toBe(1)
    expect(stageAt(0, 100, 99)).toBe(4)
    expect(stageAt(0, 100, 100)).toBe(5)
  })

  it('não expõe quantidade antes de amadurecer', () => {
    const v = viewPlot({ ...base, planted_at: 0, ready_at: 100 }, 50)
    expect(v.yieldLeft).toBeUndefined()
  })
})

describe('roubo', () => {
  it('leva 10% (mín. 1) e respeita o piso de 60% do dono', () => {
    expect(ownerFloor(10)).toBe(6)
    expect(stealQty(10, 10, 'chunk')).toBe(1)
    expect(stealQty(20, 20, 'chunk')).toBe(2)
    expect(stealQty(20, 13, 'chunk')).toBe(1)
    expect(stealQty(20, 12, 'chunk')).toBe(0)
  })
})

describe('níveis', () => {
  it('curva 25·L·(L−1)', () => {
    expect(xpToReach(2)).toBe(50)
    expect(levelForXp(0)).toBe(1)
    expect(levelForXp(49)).toBe(1)
    expect(levelForXp(50)).toBe(2)
    expect(levelForXp(150)).toBe(3)
  })
})

describe('dia do jogo', () => {
  it('vira à meia-noite de Brasília', () => {
    expect(gameDay(Date.UTC(2026, 9, 9, 2, 59))).toBe('2026-10-08')
    expect(gameDay(Date.UTC(2026, 9, 9, 3, 0))).toBe('2026-10-09')
  })
})

describe('nomes do balão do lote', () => {
  it('semente → broto → folhas pequenas → folhas grandes → florescendo → maduro: um estágio da arte para cada nome', async () => {
    const { growthName } = await import('../src/game/rules')
    // 500 ms de crescimento: 5 trechos de 100 ms; o 6º estágio (maduro) começa no fim.
    const at = (now: number) => growthName(0, 500, now)
    expect(at(0)).toEqual({ name: 'semente', next: 'broto', nextAt: 100 })
    expect(at(150)).toEqual({ name: 'broto', next: 'folhas pequenas', nextAt: 200 })
    expect(at(210)).toEqual({ name: 'folhas pequenas', next: 'folhas grandes', nextAt: 300 })
    expect(at(300)).toEqual({ name: 'folhas grandes', next: 'florescendo', nextAt: 400 })
    expect(at(499)).toEqual({ name: 'florescendo', next: 'maduro', nextAt: 500 })
    expect(at(500)).toEqual({ name: 'maduro', next: null, nextAt: null })
    expect([0, 99, 100, 299, 300, 399, 400, 499, 500, 9999].map((t) => stageAt(0, 500, t))).toEqual([0, 0, 1, 2, 3, 3, 4, 4, 5, 5])
  })
})
