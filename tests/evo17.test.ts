// Evolução 17: balão no lote, baú ao cavar, tooltips da HUD, bônus de popularidade, ranking e loja (C6, C7, C8, C11).
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

process.env.PGLITE_DIR = 'memory://'
const { getDb } = await import('../src/server/db')
const game = await import('../src/server/game')
const { CHEST, POPULARITY_CAP } = await import('../src/game/config')
const { HUD_TIPS, PLOT_LINES } = await import('../src/game/lines')
const { popLevelFor, popToReach, salePrice } = await import('../src/game/rules')
const { seedSheet } = await import('../src/game/sheet')
const { SEED_BY_ID } = await import('../src/game/catalog')
const { PLOT_BUBBLE } = await import('../src/scene/bubble-style')

const db = await getDb()
const sql = (q: string, p: unknown[] = []) => db.query(q, p)
const user = async (handle: string) => (await sql('select * from users where handle = $1', [handle])).rows[0] as Record<string, any>
const wither = (id: string, idx: number) =>
  sql("update plots set withered = true, seed_id = 'nabo', planted_at = now(), ready_at = now() where owner_id = $1 and idx = $2", [id, idx])

let me: string
beforeAll(() => { vi.spyOn(Math, 'random').mockReturnValue(0.99) })
afterEach(() => vi.mocked(Math.random).mockReturnValue(0.99))
beforeEach(async () => {
  await game.resetDbForTests()
  me = await game.loginOrCreate('ana')
})

describe('C6a: balão no lote', () => {
  it('"Não precisa de mais fertilizante!" vira fala de lote, com o código vindo do servidor', async () => {
    expect(PLOT_LINES.fertTwice).toBe('Não precisa de mais fertilizante!')
    await sql('update users set level = 3 where id = $1', [me])
    await game.runAction(me, { type: 'buy', itemId: 'semente:tomate' })
    await game.runAction(me, { type: 'buy', itemId: 'adubo', qty: 2 })
    await game.runAction(me, { type: 'plant', idx: 0, seedId: 'tomate' })
    await game.runAction(me, { type: 'fertilize', idx: 0 })
    await expect(game.runAction(me, { type: 'fertilize', idx: 0 })).rejects.toMatchObject({ code: 'fertTwice' })
  })

  it('o balão é laranja com contorno marrom (por código até a arte da Evolução 18)', () => {
    const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255]
    const [r, g, b] = rgb(PLOT_BUBBLE.fill)
    expect(r).toBeGreaterThan(200); expect(g).toBeGreaterThan(120); expect(g).toBeLessThan(200); expect(b).toBeLessThan(100)
    const [sr, sg, sb] = rgb(PLOT_BUBBLE.stroke)
    expect(sr).toBeGreaterThan(sg); expect(sg).toBeGreaterThan(sb); expect(sr).toBeLessThan(160)
  })
})

describe('C6b: baú do tesouro ao cavar', () => {
  it('chance pequena (3%), ouro fixo e baixo', () => {
    expect(CHEST.chance).toBe(0.03)
    expect(CHEST.gold).toBeLessThanOrEqual(20)
  })

  it('sem sorte não acha nada', async () => {
    await wither(me, 0)
    const r = await game.runAction(me, { type: 'clear', idx: 0 })
    expect(r.chest).toBeUndefined()
    expect(r.message).toBe('Terra limpa (+1 XP)')
  })

  it('com sorte paga o valor fixo, com o texto do jogo, e no máximo CHEST.daily por dia', async () => {
    vi.mocked(Math.random).mockReturnValue(0.01)
    const gold0 = (await user('ana')).gold
    for (let i = 0; i < CHEST.daily; i++) {
      await wither(me, 0)
      const r = await game.runAction(me, { type: 'clear', idx: 0 })
      expect(r.chest).toBe(CHEST.gold)
      expect(r.message).toBe(`Parabéns! Você encontrou um baú do tesouro enquanto cavava. Você ganhou ${CHEST.gold} moedas.`)
    }
    await wither(me, 0)
    const extra = await game.runAction(me, { type: 'clear', idx: 0 })
    expect(extra.chest).toBeUndefined()
    expect((await user('ana')).gold).toBe(gold0 + CHEST.daily * CHEST.gold)
    const led = (await sql("select count(*)::int as n from ledger where user_id = $1 and reason = 'chest'", [me])).rows[0] as { n: number }
    expect(led.n).toBe(CHEST.daily)
  })
})

describe('C7: tooltips da HUD', () => {
  it('textos do jogo, com quanto falta para o próximo nível', () => {
    expect(HUD_TIPS.xp(120, 30)).toEqual(['Sua experiência no momento: 120', 'para o próximo nível: 30'])
    expect(HUD_TIPS.pop(7, 3)).toEqual(['Popularidade atual: 7', 'Para o próximo nível: 3'])
  })

  it('popularidade tem nível', () => {
    expect(popLevelFor(0)).toBe(1)
    expect(popLevelFor(popToReach(2) - 1)).toBe(1)
    expect(popLevelFor(popToReach(2))).toBe(2)
    expect(popLevelFor(popToReach(5) + 1)).toBe(5)
  })

  it('a barra abre no toque (botão), não só no hover', () => {
    const src = readFileSync('src/components/FarmGame.tsx', 'utf8')
    expect(src).toMatch(/<button type="button" className="xp"[^>]*data-hud-tip/)
    expect(src).toMatch(/<button type="button" className="pop"[^>]*data-hud-tip/)
  })
})

describe('C8: bônus de popularidade', () => {
  it('teto de 50%', () => {
    expect(POPULARITY_CAP).toBe(50)
    expect(salePrice(10, 10, 161)).toBe(150)
  })

  it('"Vender tudo" fala do prêmio por popularidade', async () => {
    await sql("insert into inventory (user_id, item_id, qty) values ($1, 'cenoura', 10)", [me])
    await sql('update users set popularity = 60 where id = $1', [me])
    const r = await game.runAction(me, { type: 'sell_all' })
    expect(r.sale).toMatchObject({ base: 20, bonus: 10, pct: 50, gold: 30 })
    expect(r.message).toBe('Todos os itens do depósito foram vendidos, você ganhou 20 moedas. 10 moedas como um prêmio por sua popularidade.')
  })

  it('sem popularidade, não fala do prêmio', async () => {
    await sql("insert into inventory (user_id, item_id, qty) values ($1, 'cenoura', 10)", [me])
    const r = await game.runAction(me, { type: 'sell_all' })
    expect(r.message).toBe('Todos os itens do depósito foram vendidos, você ganhou 20 moedas.')
  })
})

describe('C11: ranking e loja', () => {
  it('selos 1 vermelho, 2 laranja, 3 verde', () => {
    const css = readFileSync('src/app/globals.css', 'utf8')
    const color = (p: string) => css.match(new RegExp(`\\.pos\\.${p} \\{ background: #([0-9a-f]{6})`))?.[1]
    const hue = (hex: string) => {
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
      return (h * 60 + 360) % 360
    }
    const h1 = hue(color('p1')!)
    expect(h1 < 10 || h1 > 345).toBe(true) // vermelho
    expect(hue(color('p2')!)).toBeGreaterThan(20); expect(hue(color('p2')!)).toBeLessThan(40) // laranja
    expect(hue(color('p3')!)).toBeGreaterThan(90); expect(hue(color('p3')!)).toBeLessThan(150) // verde
  })

  it('"renda" da semente = unidades médias × venda × safras', () => {
    const s = SEED_BY_ID.morango
    const f = seedSheet(s)
    expect(f.income).toBe(Math.round((f.incomeMin + f.incomeMax) / 2))
    expect(f.income).toBeGreaterThan(s.cost)
  })

  it('recibo de compra no tom do jogo', async () => {
    const r = await game.runAction(me, { type: 'buy', itemId: 'semente:cenoura', qty: 3 })
    const total = -(r.fx!.gold!)
    expect(r.message).toBe(`Você comprou com sucesso 3 Semente de Cenoura, ${total} moedas foram gastas.`)
  })
})
