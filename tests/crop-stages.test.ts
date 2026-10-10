// Frente V: culturas com os 6 estágios (semente → maduro) e a arte de uma planta por lote (lote P).
import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { cropArt, REGROW_STAGE, regrowStage, SEEDS, stageFracs, STAGE_NAMES } from '../src/game/catalog'
import { GROWTH_NAMES } from '../src/game/lines'
import { growMs, growthName, nextSeason, regrowMs, RIPE_STAGE, stageAt, stageStart } from '../src/game/rules'

describe('6 estágios das culturas', () => {
  it('nomes dos estágios, na ordem da arte; 5 = maduro', () => {
    expect(STAGE_NAMES).toEqual(['semente', 'broto', 'folhas pequenas', 'folhas grandes', 'florescendo', 'maduro'])
    expect(Object.values(GROWTH_NAMES)).toEqual([...STAGE_NAMES])
    expect(RIPE_STAGE).toBe(5)
    expect(STAGE_NAMES[REGROW_STAGE]).toBe('folhas grandes')
  })

  it('o tempo total de cada cultura não muda: 5 trechos iguais, maduro no readyAt', () => {
    for (const s of SEEDS) {
      const total = growMs(s)
      expect(stageAt(0, total, total - 1)).toBe(4)
      expect(stageAt(0, total, total)).toBe(5)
      for (let n = 1; n <= 4; n++) {
        const at = Math.ceil(stageStart(0, total, n))
        expect(stageAt(0, total, at)).toBe(n)
        if (at - 1 >= 0 && total >= 5) expect(stageAt(0, total, at - 1)).toBe(n - 1)
      }
    }
  })

  it('o balão sempre mostra o estágio atual e o tempo até o próximo', () => {
    const total = 50 * 60_000
    for (let t = 0; t < total; t += 37_000) {
      const g = growthName(0, total, t)
      const n = stageAt(0, total, t)
      expect(g.name).toBe(STAGE_NAMES[n])
      expect(g.next).toBe(STAGE_NAMES[n + 1])
      expect(g.nextAt! > t).toBe(true)
      expect(stageAt(0, total, g.nextAt!)).toBe(n + 1)
    }
  })

  it('várias safras: depois da colheita volta para "folhas grandes" (cacau e noz: folhas pequenas) e amadurece em regrowMinutes', () => {
    const now = 1_760_000_000_000
    for (const s of SEEDS.filter((x) => (x.seasons ?? 1) > 1)) {
      const n = nextSeason(s, now), fr = stageFracs(s), k = regrowStage(s)
      expect(k).toBe(['cacau', 'noz'].includes(s.id) ? 2 : REGROW_STAGE)
      expect(n.readyAt - now).toBe(regrowMs(s))
      expect(stageAt(n.plantedAt, n.readyAt, now, fr)).toBe(k)
      expect(stageAt(n.plantedAt, n.readyAt, now - 1, fr)).toBe(k - 1)
      // os estágios que faltam dividem o tempo de reamadurecer na proporção das horas oficiais (morango 6 + 6)
      const bloom = stageStart(n.plantedAt, n.readyAt, 4, fr)
      expect(Math.abs((n.readyAt - bloom) / regrowMs(s) - (1 - fr[4]) / (1 - fr[k]))).toBeLessThan(1e-6)
    }
  })

  it('toda cultura com arte tem os 7 sprites do lote P (0..5 e murcho)', () => {
    const has = (url: string) => existsSync(path.join(process.cwd(), 'public', url))
    for (const s of SEEDS.filter((x) => !x.needsArt)) {
      for (let i = 0; i <= RIPE_STAGE; i++) expect(has(cropArt(s.id, i)), cropArt(s.id, i)).toBe(true)
      expect(has(cropArt(s.id, 'withered'))).toBe(true)
      expect(cropArt(s.id)).toBe(cropArt(s.id, 5))
    }
  })
})
