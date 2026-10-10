// Evolução 19: a arte do lote W ligada à jogabilidade (guardas C13, rações e produtos C9, level-up C1/A4,
// selos, balão e baú A5/A6).
import { existsSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { iconUrl, itemIcon, SHOP_BY_ID } from '../src/game/catalog'
import { DOG_BREEDS, dogIcon, origGold, STEAL } from '../src/game/config'
import { FEEDS, LIVESTOCK, PRODUCT_ICON, productPrice } from '../src/game/livestock'
import { nextFacing } from '../src/game/patrol'
import { DOG_AREA, plotPos } from '../src/scene/layout'

const pub = (url: string) => existsSync(path.join(process.cwd(), 'public', url))
const GUARDS = ['guarda_cabra', 'guarda_avestruz', 'guarda_cavalo']

describe('C13: guardas no lugar do cachorro', () => {
  it('cabra, avestruz e cavalo são raças de guarda com os números da tabela (força 50, 30 dias, nível 6 → 3)', () => {
    for (const id of GUARDS) {
      const b = DOG_BREEDS[id]
      expect(b, id).toBeDefined()
      expect(b.guard).toBe(true)
      expect(b.days).toBe(30)
      expect(b.minLevel).toBe(3)
      expect(b.bite).toBeGreaterThan(DOG_BREEDS.pastor.bite) // força 50 > Pastor (40)
    }
    expect(DOG_BREEDS.guarda_cabra.gold).toBe(origGold(100_000))
    expect(DOG_BREEDS.guarda_cavalo.gold).toBe(origGold(120_000))
    expect(DOG_BREEDS.guarda_avestruz.gold).toBe(origGold(75_000))
  })

  it('estão na loja, aba Animais, junto do cachorro e com o ícone da arte A9', () => {
    for (const id of GUARDS) {
      const it = SHOP_BY_ID[`cao:${id}`]
      expect(it.tab).toBe('animais')
      expect(it.icon).toBe(dogIcon(id))
      expect(pub(iconUrl(it.icon)), it.icon).toBe(true)
      expect(it.desc).toMatch(/lugar do cachorro/)
    }
    expect(dogIcon('vira_lata')).toBe('dog_vira_lata')
  })

  it('a arte de parado e de "mordendo" existe para os três', async () => {
    const { GUARD_ART } = await import('../src/scene/art')
    expect(Object.keys(GUARD_ART).sort()).toEqual([...GUARDS].sort())
    for (const g of Object.values(GUARD_ART)) {
      for (const f of [...g.idle, ...g.walk, g.attack]) expect(pub(`/art/animals/${f}.png`), f).toBe(true)
    }
  })
})

describe('C9: rações e produtos com os sacos e ícones do lote W', () => {
  it('cada ração usa o saco A7 e os preços da tabela batem (galinha 40, gado 60, porco 60, crescem 80, produzem 120)', () => {
    expect(Object.fromEntries(Object.values(FEEDS).map((f) => [f.id, f.origGold]))).toEqual({
      racao_aves: 40, feno: 60, lavagem: 60, racao_crescem: 80, xarope: 120,
    })
    expect(FEEDS.racao_crescem.hours).toBe(12)
    expect(LIVESTOCK.donkey.feed).toBe('racao_crescem')
    for (const id of Object.keys(FEEDS)) {
      expect(itemIcon(id).name).toMatch(/^items\/racao_/)
      expect(pub(iconUrl(itemIcon(id).name)), id).toBe(true)
      expect(SHOP_BY_ID[id].icon).toBe(itemIcon(id).name) // loja = depósito = sacola
    }
  })

  it('ovo de pata, mel e pena de pavão usam a arte nova; preços da tabela', () => {
    expect(PRODUCT_ICON).toMatchObject({ ovo_pata: 'items/ovo_pata', mel: 'items/mel', pena: 'items/pena_pavao' })
    for (const id of Object.keys(PRODUCT_ICON)) expect(pub(iconUrl(itemIcon(id).name)), id).toBe(true)
    expect([productPrice('leite'), productPrice('ovo'), productPrice('la'), productPrice('mel'), productPrice('pena')]).toEqual([22, 16, 39, 32, 42])
  })
})

process.env.PGLITE_DIR = 'memory://'
const { getDb } = await import('../src/server/db')
const game = await import('../src/server/game')
const db = await getDb()
const sql = (q: string, p: unknown[] = []) => db.query(q, p)
const user = async (handle: string) => (await sql('select * from users where handle = $1', [handle])).rows[0] as Record<string, any>
const DOG_HOME = { x: Math.round((DOG_AREA.x0 + DOG_AREA.x1) / 2), y: Math.round((DOG_AREA.y0 + DOG_AREA.y1) / 2) }

describe('C13 no servidor: compra e mordida iguais às do cachorro', () => {
  let me: string, bia: string
  beforeAll(() => { vi.spyOn(Math, 'random').mockReturnValue(0.99) })
  afterEach(() => { vi.mocked(Math.random).mockReturnValue(0.99); vi.restoreAllMocks(); vi.spyOn(Math, 'random').mockReturnValue(0.99) })
  beforeEach(async () => {
    STEAL.mode = 'tap'
    await game.resetDbForTests()
    me = await game.loginOrCreate('ana')
    bia = await game.loginOrCreate('bia')
    await sql("update users set created_at = now() - interval '1 hour', gold = 1000 where id = $1", [me])
    await sql('update users set level = 3, xp = 150, gold = 20000 where id = $1', [bia])
  })

  it('compra o Guarda Cavalo: ocupa o lugar do cachorro, 30 dias, troca o anterior', async () => {
    await sql("update users set dog = 'vira_lata', dog_fed_until = now() + interval '1 day' where id = $1", [bia])
    const r = await game.runAction(bia, { type: 'buy', itemId: 'cao:guarda_cavalo' })
    expect(r.message).toMatch(/Vira-lata foi trocado.*Guarda Cavalo/)
    const u = await user('bia')
    expect(u.dog).toBe('guarda_cavalo')
    expect(u.gold).toBe(20000 - DOG_BREEDS.guarda_cavalo.gold)
    expect(u.dog_expires_at.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000)
    const f = await game.loadFarm(bia)
    expect(f.me.dog).toMatchObject({ kind: 'guarda_cavalo', name: 'Guarda Cavalo', awake: true })
  })

  it('o guarda morde o ladrão com a mesma regra (de frente para o lote, multa de 14%)', async () => {
    await game.runAction(bia, { type: 'buy', itemId: 'cao:guarda_cabra' })
    await sql(`update plots set seed_id = 'nabo', planted_at = now() - interval '2 hours', ready_at = now() - interval '1 minute',
      yield_total = 10, yield_left = 10, sow_seq = 1 where owner_id = $1 and idx = 0`, [bia])
    const t = nextFacing(bia, DOG_HOME, plotPos(0).x, false, Date.now())!
    vi.spyOn(Date, 'now').mockReturnValue(t)
    vi.mocked(Math.random).mockReturnValue(0)
    const r = await game.runAction(me, { type: 'steal', owner: 'bia', idx: 0 })
    expect(r.bad).toBe(true)
    expect(r.bite).toEqual({ idx: 0, gold: 140, breed: 'guarda_cabra', owner: 'bia' }) // 14% de 1000
  })
})

describe('C1/A4, A5 e A6: level-up, selos, balão e baú com a arte do lote W', () => {
  it('as peças existem em public/art/ui', async () => {
    const { PLOT_BUBBLE_ART } = await import('../src/scene/bubble-style')
    for (const f of ['levelup_selo', 'levelup_megafone', 'rank_1', 'rank_2', 'rank_3', 'bau_fechado', 'bau_aberto', ...PLOT_BUBBLE_ART.sizes]) {
      expect(pub(`/art/ui/${f}.png`), f).toBe(true)
    }
  })

  it('a janela de level-up mostra o selo com o nível e o compartilhar com o megafone', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { createElement } = await import('react')
    const { LevelUpDialog } = await import('../src/components/Dialogs')
    const html = renderToStaticMarkup(createElement(LevelUpDialog, { level: 7, onClose: () => {}, onShare: () => {} }))
    expect(html).toContain('/art/ui/levelup_selo.png')
    expect(html).toMatch(/class="lv-seal art"[^>]*aria-label="Nível 7"/)
    expect(html).toContain('/art/ui/levelup_megafone.png')
    expect(html).toContain('Quem vir vai ganhar')
    // Sem compartilhamento (sem código de convite) não há megafone.
    expect(renderToStaticMarkup(createElement(LevelUpDialog, { level: 7, onClose: () => {} }))).not.toContain('levelup_megafone')
  })

  it('o selo do ranking usa a arte 1/2/3 e cai no CSS sem ela; o baú usa a arte no aviso', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { createElement } = await import('react')
    const { ArtSeal } = await import('../src/components/ui/kit')
    const html = renderToStaticMarkup(createElement(ArtSeal, { src: '/art/ui/rank_2.png', className: 'pos p2', label: '2º lugar', children: 2 }))
    expect(html).toContain('class="pos p2 art"')
    expect(html).toContain('/art/ui/rank_2.png')
    const { readFileSync } = await import('node:fs')
    expect(readFileSync('src/components/Dialogs.tsx', 'utf8')).toContain('/art/ui/rank_${n.pos}.png')
    const farm = readFileSync('src/components/FarmGame.tsx', 'utf8')
    expect(farm).toContain("CHEST_ICON = '/art/ui/bau_aberto.png'")
    expect(farm).toContain('api?.chestAt(idx)')
  })
})
