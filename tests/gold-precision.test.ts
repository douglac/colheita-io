// Ouro com preço decimal (1,3): conta em décimos inteiros, sem lixo de float na venda nem na ficha.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SeedFacts } from '../src/components/Dialogs'
import { fmtGold, fmtRange, SEED_BY_ID, SEEDS } from '../src/game/catalog'
import { POPULARITY_CAP } from '../src/game/config'
import { salePrice } from '../src/game/rules'
import { seedSheet } from '../src/game/sheet'

describe('salePrice sem erro de float', () => {
  it('arredonda para baixo só o resultado exato', () => {
    expect(salePrice(2.3, 100, 0)).toBe(230) // float: Math.floor(229.99999999999997)
    expect(salePrice(4.1, 100, 0)).toBe(410)
    expect(salePrice(1.3, 36, 0)).toBe(46) // 46,8
    expect(salePrice(0.7, 3, 0)).toBe(2) // 2,1
  })
  it('com popularidade (+1% por ponto, até o teto)', () => {
    expect(salePrice(1.3, 36, 10)).toBe(51) // 46,8 × 1,1 = 51,48
    expect(salePrice(1.3, 36, 30)).toBe(60) // 46,8 × 1,3 = 60,84
    expect(salePrice(1.3, 36, 50)).toBe(70) // 46,8 × 1,5 = 70,2
    expect(salePrice(1.3, 36, POPULARITY_CAP + 20)).toBe(salePrice(1.3, 36, POPULARITY_CAP)) // acima do teto não soma
    expect(salePrice(2.3, 100, 30)).toBe(299)
  })
})

describe('ficha da semente', () => {
  it('renda com no máximo 1 casa decimal', () => {
    for (const s of SEEDS) {
      const f = seedSheet(s)
      for (const x of [f.incomeMin, f.incomeMax]) expect(Number.isInteger(Math.round(x * 10)) && Math.abs(x * 10 - Math.round(x * 10)) < 1e-9, `${s.id}: ${x}`).toBe(true)
      for (const x of [f.incomeMin, f.incomeMax]) expect(String(x), s.id).not.toMatch(/\.\d{2,}/)
    }
  })
  it('renda formatada: vírgula e um número só quando min === max', () => {
    expect(fmtRange(46.8, 46.8, fmtGold)).toBe('46,8')
    expect(fmtRange(3, 5)).toBe('3–5')
    expect(fmtRange(4, 4)).toBe('4')
  })
  it('nenhum texto de SeedFacts tem casas de float', () => {
    for (const s of SEEDS) {
      const html = renderToStaticMarkup(createElement(SeedFacts, { seedId: s.id }))
      // Ponto só como milhar pt-BR ("1.032"): grupo de exatamente 3 dígitos. Lixo de float ("46.800000000000004") e decimal com ponto ("46.8") falham.
      expect(html, s.id).not.toMatch(/\d\.(?!\d{3}(?!\d))\d/)
      expect(html.replace(/\d\.\d{3}(?!\d)/g, ''), s.id).not.toMatch(/\d\.\d{3,}/)
      if (!s.flower) expect(html, s.id).toContain(`Renda de ${fmtRange(seedSheet(s).incomeMin, seedSheet(s).incomeMax, fmtGold)} de ouro`)
    }
  })
  it('exemplo do print: 36 un. × 1,3', () => {
    const s = SEEDS.find((x) => !x.flower && (x.seasons ?? 1) === 1 && x.yieldMin === 36 && x.yieldMax === 36 && x.sellPrice === 1.3)
    if (!s) return
    expect(renderToStaticMarkup(createElement(SeedFacts, { seedId: s.id }))).toContain(`Renda de 46,8 de ouro, menos ${fmtGold(s.cost)} da semente.`)
  })
  it('nabo continua vendendo 36 por 46', () => {
    expect(salePrice(SEED_BY_ID.nabo.sellPrice, 36, 0)).toBe(46)
  })
})
