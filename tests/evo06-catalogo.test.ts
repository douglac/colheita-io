// Evolução 06: catálogo com os valores de balanceamento do jogo e as 15 sementes do lote R.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GREEN_SEED_RATIO, onSale, ORIGINAL_FLOWERS, ORIGINAL_SEEDS, origSeedGold, origStageH, regrowStage, SEED_BY_ID, SEEDS, SHOP,
  iconUrl, SHOP_BY_ID, stageFracs, type OrigSeed,
} from '../src/game/catalog'
import { inSeason, LAND_ORIGINAL_GREENS, LAND_ORIGINAL_LEVELS, landOriginal, origGold, origUnit, PACE, TUTORIAL } from '../src/game/config'
import { FEEDS, feedPortion, LIVESTOCK, PRODUCTS, productPrice } from '../src/game/livestock'
import { growMs, growthName, nextSeason, ownerFloor, regrowMs, salePrice, stageAt, stealPool, stealQty } from '../src/game/rules'

const pub = (url: string) => existsSync(path.join(process.cwd(), 'public', url))
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
const hoursOf = (o: OrigSeed) => sum(origStageH(o)) + (o.seasons - 1) * (o.re ?? 0)
const income = (o: OrigSeed) => o.seasons * o.out * o.unit
const lph = (o: OrigSeed) => (income(o) - origSeedGold(o)) / hoursOf(o) // lucro por hora, em unidades da tabela

// As 33 sementes básicas da loja.
const LOJA_BASE = ['nabo', 'cenoura', 'milho', 'batata', 'berinjela', 'tomate', 'pimenta', 'abobora', 'ervilha', 'morango', 'maca',
  'melancia', 'banana', 'pessego', 'laranja', 'uva', 'roma', 'melao', 'cana', 'lichia', 'kiwi', 'abacaxi', 'cereja', 'pitaya', 'manga',
  'cacau', 'caviar', 'batata_doce', 'limao', 'amendoim', 'noz', 'arvore_natal', 'cabaceira']
const LOTE_R = ['pimenta', 'ervilha', 'roma', 'melao', 'cana', 'lichia', 'kiwi', 'manga', 'cacau', 'caviar', 'batata_doce', 'amendoim', 'noz',
  'cabaceira', 'arvore_natal']
const OUT = Date.UTC(2026, 9, 9, 15) // 9/out
const NATAL = Date.UTC(2026, 11, 10, 15) // 10/dez

describe('números oficiais × PACE', () => {
  it('as 33 sementes básicas estão no catálogo, com arte, e as 15 do lote R estão à venda', () => {
    for (const id of LOJA_BASE) expect(SEED_BY_ID[id], id).toBeTruthy()
    for (const id of LOTE_R) {
      expect(SEED_BY_ID[id].needsArt, id).toBeUndefined()
      expect(SHOP_BY_ID[`semente:${id}`], id).toBeTruthy()
    }
  })

  it('cada semente = linha do banco × PACE (preço, venda, rendimento, tempo, safras, XP, nível)', () => {
    for (const o of [...ORIGINAL_SEEDS, ...ORIGINAL_FLOWERS]) {
      const s = SEED_BY_ID[o.id]
      expect(s.cost, o.id).toBe(origGold(origSeedGold(o)))
      expect(s.sellPrice, o.id).toBe(o.unit ? origUnit(o.unit) : 0)
      expect([s.yieldMin, s.yieldMax], o.id).toEqual([o.out, o.out])
      expect(s.growMinutes, o.id).toBeCloseTo(sum(origStageH(o)) * 60 * PACE.time, 1)
      expect(s.seasons ?? 1, o.id).toBe(o.seasons)
      if (o.seasons > 1) expect(s.regrowMinutes!, o.id).toBeCloseTo(o.re! * 60 * PACE.time, 1)
      expect(s.xp, o.id).toBe(Math.max(1, Math.round(o.xp * PACE.xp)))
      expect(s.minLevel, o.id).toBe(o.minLevel ?? Math.max(1, Math.round(o.level * PACE.level)))
    }
  })

  it('exemplos conferidos à mão: berinjela 800, morango com 3 safras, nabo 13 → 1,3 de venda', () => {
    expect(SEED_BY_ID.berinjela.cost).toBe(80)
    expect(SEED_BY_ID.morango).toMatchObject({ cost: 155, seasons: 3, yieldMin: 31, sellPrice: 4.2, xp: 25, minLevel: 5 })
    expect(SEED_BY_ID.nabo).toMatchObject({ cost: 20, sellPrice: 1.3, yieldMin: 36, xp: 20, minLevel: 1, growMinutes: 75 })
    expect(SEED_BY_ID.caviar).toMatchObject({ cost: 1500, sellPrice: 170, yieldMin: 20, minLevel: 25 })
  })

  it('o tempo de cada safra seguinte é a soma dos últimos estágios (morango 6 + 6 = 12 h; cacau e noz voltam às folhas pequenas)', () => {
    // Só as da tabela básica (as de evento trazem o tempo total, sem estágios: h é um número).
    for (const s of SEEDS.filter((x) => (x.seasons ?? 1) > 1 && ORIGINAL_SEEDS.some((o) => o.id === x.id))) {
      const o = ORIGINAL_SEEDS.find((x) => x.id === s.id)!
      const h = origStageH(o)
      expect(sum(h.slice(regrowStage(s))), s.id).toBe(o.re)
    }
    expect(regrowStage(SEED_BY_ID.morango)).toBe(3)
    expect(regrowStage(SEED_BY_ID.cacau)).toBe(2)
    expect(regrowStage(SEED_BY_ID.noz)).toBe(2)
  })
})

describe('6 fases com as horas oficiais de cada estágio', () => {
  it('morango 7,6,6,6,6 h: cada fase começa na hora certa', () => {
    const s = SEED_BY_ID.morango, fr = stageFracs(s), total = growMs(s)
    const at = (h: number) => (total * h) / 31
    for (const [h, n] of [[0, 0], [6.99, 0], [7, 1], [13, 2], [19, 3], [25, 4], [30.99, 4], [31, 5]] as const) {
      expect(stageAt(0, total, Math.ceil(at(h)), fr), `${h} h`).toBe(n)
    }
  })

  it('nabo 2,2,3,0,3 h: o estágio de 0 h é pulado (folhas pequenas → florescendo)', () => {
    const s = SEED_BY_ID.nabo, fr = stageFracs(s), total = 10_000
    const seen = new Set<number>()
    for (let t = 0; t <= total; t += 10) seen.add(stageAt(0, total, t, fr))
    expect([...seen]).toEqual([0, 1, 2, 4, 5])
    expect(growthName(0, total, 5000, fr)).toMatchObject({ name: 'folhas pequenas', next: 'florescendo', nextAt: 7000 })
  })

  it('safra seguinte começa no estágio do banco e amadurece em regrowMinutes', () => {
    const now = 1_760_000_000_000
    for (const s of SEEDS.filter((x) => (x.seasons ?? 1) > 1)) {
      const n = nextSeason(s, now), fr = stageFracs(s), k = regrowStage(s)
      expect(n.readyAt - now).toBe(regrowMs(s))
      expect(stageAt(n.plantedAt, n.readyAt, now, fr), s.id).toBe(k)
      expect(stageAt(n.plantedAt, n.readyAt, now - 1, fr), s.id).toBe(k - 1)
    }
  })
})

describe('piso do dono do banco (min_output)', () => {
  it('substitui o piso de 60%: nabo 21 de 36, melão 32 de 40, caviar 3 de 20', () => {
    const keep = (id: string) => SEED_BY_ID[id].ownerKeep
    expect(ownerFloor(36, keep('nabo'))).toBe(21)
    expect(stealPool(36, keep('nabo'))).toBe(15)
    expect(ownerFloor(40, keep('melao'))).toBe(32)
    expect(ownerFloor(20, keep('caviar'))).toBe(3)
    expect(stealQty(36, 22, 'tap', keep('nabo'))).toBe(1)
    expect(stealQty(36, 21, 'tap', keep('nabo'))).toBe(0)
    // Com a saúde baixa, o piso acompanha a safra efetiva.
    expect(ownerFloor(18, keep('nabo'))).toBe(11)
    for (const o of ORIGINAL_SEEDS) expect(SEED_BY_ID[o.id].ownerKeep, o.id).toBeCloseTo(o.keep! / o.out, 9)
  })

  it('bichos de corte: piso = rendimento, ninguém pega', () => {
    expect(stealQty(100, 100, 'tap', LIVESTOCK.pig.keep)).toBe(0)
    expect(stealQty(160, 160, 'tap', LIVESTOCK.donkey.keep)).toBe(0)
    expect(ownerFloor(25, LIVESTOCK.chicken.keep)).toBe(20)
  })
})

describe('VIP, moeda verde e evento', () => {
  it('nada se compra com moeda paga; VIP e verdes saem por ouro pela regra renda ÷ 2,5 (nunca abaixo do ouro do VIP)', () => {
    for (const o of ORIGINAL_SEEDS.filter((x) => x.vip || x.greens)) {
      const g = origSeedGold(o)
      expect(g, o.id).toBeGreaterThanOrEqual(o.gold)
      expect(g, o.id).toBe(Math.max(o.gold, Math.round(income(o) / GREEN_SEED_RATIO / 10) * 10))
    }
    expect(origSeedGold(ORIGINAL_SEEDS.find((o) => o.id === 'noz')!)).toBe(47400)
    for (const i of SHOP) expect(Object.keys(i)).not.toContain('greens')
  })

  it('flor de verdes: 2.000 de ouro por verde (Rosa Vermelha 19.999 ou 10 verdes)', () => {
    expect(SEED_BY_ID.rosa_vermelha).toMatchObject({ cost: 2000, charm: 27, xp: 60 })
    expect(SEED_BY_ID.tulipa.cost).toBe(origGold(14 * 2000))
    expect(SEED_BY_ID.girassol).toMatchObject({ yieldMax: 3, cost: 300 })
  })

  it('Árvore de Natal só aparece na loja na época do Natal', () => {
    const item = SHOP_BY_ID['semente:arvore_natal']
    expect(item.event).toBe('natal')
    expect(inSeason('natal', OUT)).toBe(false)
    expect(inSeason('natal', NATAL)).toBe(true)
    expect(onSale(item, OUT)).toBe(false)
    expect(onSale(item, NATAL)).toBe(true)
    // Fora de época em 9/out: a Árvore de Natal, os itens do Dia das Bruxas (Evolução 09, de 20/out a 5/nov) e os dos
    // outros eventos da Evolução 13. As sementes do Dia das Crianças (4 a 12/out) estão à venda.
    expect(SHOP.filter((i) => !onSale(i, OUT)).map((i) => i.id).sort()).toEqual([
      'ovo_comum', 'pacote_doces', 'saco_milho', 'semente:abobora_halloween', 'semente:albizia', 'semente:arvore_coracao', 'semente:arvore_natal',
      'semente:cabaceira', 'semente:cacau_pascoa', 'semente:comigo_ninguem_pode', 'semente:coracao_mae', 'semente:cravo', 'semente:espada_sao_jorge',
      'semente:guine', 'semente:lirio_pascoa', 'semente:lotus_chiba',
      'semente:milho_caipira', 'semente:orquidea_branca', 'semente:pamonha', 'semente:pe_de_moleque', 'semente:pinheiro_natal',
      'semente:rabanete_verao', 'semente:semente_papai', 'semente:serpentina', 'semente:tomate_cereja',
    ])
  })
})

describe('economia', () => {
  const gold = ORIGINAL_SEEDS
  const common = gold.filter((o) => !o.vip && !o.greens && o.minLevel == null)

  it('nenhum item à venda sem arte', () => {
    for (const i of SHOP) {
      const url = iconUrl(i.icon)
      expect(pub(url), `${i.id} → ${url}`).toBe(true)
      if (i.seedId) {
        for (let n = 0; n <= 5; n++) expect(pub(`/art/crops1/${i.seedId}_${n}.png`), `${i.seedId}_${n}`).toBe(true)
        expect(pub(`/art/crops1/${i.seedId}_withered.png`)).toBe(true)
        expect(pub(`/art/ui/produto_${i.seedId}.png`), `produto_${i.seedId}`).toBe(true)
      }
    }
  })

  it('toda semente dá lucro: renda entre 1,5× e 10× a semente, em unidades da tabela e na escala do teste (±15%)', () => {
    for (const o of gold) {
      const ratio = income(o) / origSeedGold(o)
      expect(ratio, o.id).toBeGreaterThan(1.5)
      expect(ratio, o.id).toBeLessThan(10)
      const s = SEED_BY_ID[o.id]
      const scaled = ((s.seasons ?? 1) * s.yieldMax * s.sellPrice) / s.cost
      expect(Math.abs(scaled / ratio - 1), o.id).toBeLessThan(0.15)
    }
  })

  it('lucro por hora cabe no nível: no máximo 2,2× a melhor semente comum até aquele nível', () => {
    for (const o of gold) {
      const lvl = o.minLevel != null ? o.minLevel / PACE.level : o.level
      const best = Math.max(...common.filter((c) => c.level <= lvl).map(lph))
      expect(lph(o) / best, o.id).toBeLessThanOrEqual(2.2)
    }
  })

  it('venda com decimal soma e arredonda para baixo (36 nabos a 1,3 = 46)', () => {
    expect(salePrice(SEED_BY_ID.nabo.sellPrice, 36, 0)).toBe(46)
  })
})

describe('bichos, rações e terrenos do banco', () => {
  it('produtos e rações com os preços e as horas oficiais; bicho sem nível', () => {
    expect(Object.fromEntries(Object.entries(PRODUCTS).map(([k, v]) => [k, v.origPrice]))).toMatchObject({
      ovo: 160, leite: 220, la: 390, ovo_pata: 379, mel: 320, pena: 420, carne: 1299, carne_porco: 1800,
    })
    expect(productPrice('ovo_pata')).toBe(37.9)
    expect(Object.values(FEEDS).map((f) => [f.origGold, f.hours])).toEqual([[40, 8], [60, 8], [60, 12], [80, 12], [120, 8]])
    expect(feedPortion('lavagem')).toBe(50)
    expect(feedPortion('feno')).toBeCloseTo(33.33, 1)
    for (const l of Object.values(LIVESTOCK)) expect(l.minLevel, l.kind).toBe(1)
    expect(LIVESTOCK.pig.stagesH).toEqual([24, 48, 48, 48])
    expect(LIVESTOCK.donkey.stagesH).toEqual([72, 48, 72, 48])
  })

  it('29 terrenos na tabela de expansão', () => {
    expect(LAND_ORIGINAL_GREENS).toHaveLength(29)
    expect(LAND_ORIGINAL_LEVELS).toHaveLength(29)
    expect(landOriginal(1)).toEqual({ gold: 9000, minLevel: 5 })
    expect(landOriginal(18)).toEqual({ gold: 110 * 9000, minLevel: 39 })
  })
})

// ---------- servidor ----------
process.env.PGLITE_DIR = 'memory://'
const { getDb } = await import('../src/server/db')
const game = await import('../src/server/game')
const db = await getDb()
const sql = (q: string, p: unknown[] = []) => db.query<Record<string, any>>(q, p)

describe('servidor', () => {
  let me: string
  beforeAll(() => { vi.spyOn(Math, 'random').mockReturnValue(0.99) })
  afterAll(() => vi.mocked(Math.random).mockRestore())
  beforeEach(async () => {
    await game.resetDbForTests()
    me = await game.loginOrCreate('ana')
  })
  const readyIn = async (idx: number) => {
    const r = (await sql('select planted_at, ready_at from plots where idx = $1 and owner_id = $2', [idx, me])).rows[0]
    return (r.ready_at.getTime() - r.planted_at.getTime()) / 60_000
  }

  it(`tutorial: no nível ${TUTORIAL.maxLevel} o nabo fica pronto em ${TUTORIAL.minutes} min; depois, no tempo normal`, async () => {
    await game.runAction(me, { type: 'plant', idx: 0, seedId: 'nabo' })
    expect(await readyIn(0)).toBeCloseTo(TUTORIAL.minutes, 3)
    await sql('update users set xp = 500, level = 4 where id = $1', [me])
    await game.runAction(me, { type: 'plant', idx: 1, seedId: 'nabo' })
    expect(await readyIn(1)).toBeCloseTo(SEED_BY_ID.nabo.growMinutes, 3)
  })

  it.skipIf(inSeason('natal', Date.now()))('Árvore de Natal: a loja recusa fora da época', async () => {
    await sql('update users set gold = 100000 where id = $1', [me])
    await expect(game.runAction(me, { type: 'buy', itemId: 'semente:arvore_natal' })).rejects.toThrow(/época/)
    await expect(game.runAction(me, { type: 'buy', itemId: 'semente:batata_doce' })).resolves.toBeTruthy()
  })
})
