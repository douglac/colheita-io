import { describe, expect, it } from 'vitest'
import { careAt, dailyMissions, effectiveYield, salePrice, scheduleCare, stealQty, viewPlot } from '../src/game/rules'

const plot = { idx: 0, seed_id: 'milho', planted_at: 0, ready_at: 100_000, yield_total: 20, yield_left: 20, withered: false }

describe('cuidados', () => {
  it('saúde cai 5 por praga/erva, com teto de 30', () => {
    expect(careAt({ ...plot, pests: 1, weeds: 1 }, 50_000).health).toBe(90)
    expect(careAt({ ...plot, pests: 3, weeds: 3, }, 50_000).health).toBe(70)
    expect(careAt({ ...plot, pests: 3, weeds: 3, nat_pest_at: 10 }, 50_000).health).toBe(70)
  })

  it('eventos naturais só contam depois de acontecer e antes de amadurecer', () => {
    const p = { ...plot, nat_pest_at: 60_000, nat_weed_at: 200_000 }
    expect(careAt(p, 50_000).pests).toBe(0)
    expect(careAt(p, 70_000).pests).toBe(1)
    expect(careAt(p, 300_000).weeds).toBe(0)
  })

  it('seca: conta o tempo seco até amadurecer e penaliza acima de 2 h', () => {
    const long = { ...plot, ready_at: 10 * 3600_000, dry_at: 3600_000 }
    expect(careAt(long, 2 * 3600_000).dry).toBe(true)
    expect(careAt(long, 2 * 3600_000).health).toBe(100)
    expect(careAt(long, 4 * 3600_000).health).toBe(90)
    // Regou depois de 1 h seco: dry_ms guarda isso e não penaliza.
    expect(careAt({ ...long, dry_at: null, dry_ms: 3600_000 }, 9 * 3600_000).health).toBe(100)
  })

  it('rendimento efetivo aplica a saúde e desconta o que já foi roubado', () => {
    const ripe = { ...plot, pests: 2, yield_left: 18 } // 2 roubados
    expect(effectiveYield(ripe, 200_000)).toEqual({ total: 18, left: 16 })
    expect(stealQty(18, 16, 'chunk')).toBe(2)
    expect(stealQty(18, 16, 'tap')).toBe(1)
  })

  it('agenda de cuidados respeita as chances', () => {
    expect(scheduleCare(0, 1000, () => 0.99)).toEqual({ dry_at: null, nat_pest_at: null, nat_weed_at: null })
    const all = scheduleCare(0, 1000, () => 0)
    expect(all.dry_at).toBe(500)
    expect(all.nat_pest_at).toBe(300)
    expect(all.nat_weed_at).toBe(200)
  })

  it('a vista do lote mostra praga, erva, seca e saúde', () => {
    const v = viewPlot({ ...plot, pests: 1, dry_at: 40_000 }, 50_000)
    expect(v).toMatchObject({ state: 'growing', pests: 1, weeds: 0, dry: true, health: 95 })
  })
})

describe('economia', () => {
  it('popularidade dá +1% por ponto, até 50%', () => {
    expect(salePrice(10, 10, 0)).toBe(100)
    expect(salePrice(10, 10, 5)).toBe(105)
    expect(salePrice(10, 10, 40)).toBe(140)
    expect(salePrice(10, 10, 99)).toBe(150)
  })

  it('3 missões por dia, a última sempre social, e iguais no mesmo dia', () => {
    const a = dailyMissions('u1', '2026-10-08')
    expect(a).toHaveLength(3)
    expect(a[0].kind).not.toBe(a[1].kind)
    expect(['help', 'steal', 'visit']).toContain(a[2].kind)
    expect(dailyMissions('u1', '2026-10-08')).toEqual(a)
  })
})
