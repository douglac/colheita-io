// Frente C: vender tudo com resultado detalhado, ração na ficha do cachorro, presentes recebidos e "Agradecer".
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

process.env.PGLITE_DIR = 'memory://'
const { getDb } = await import('../src/server/db')
const game = await import('../src/server/game')

const db = await getDb()
const sql = (q: string, p: unknown[] = []) => db.query(q, p)
const user = async (handle: string) => (await sql('select * from users where handle = $1', [handle])).rows[0] as Record<string, any>
const give = (id: string, itemId: string, qty: number) =>
  sql('insert into inventory (user_id, item_id, qty) values ($1, $2, $3) on conflict (user_id, item_id) do update set qty = excluded.qty', [id, itemId, qty])

let me: string
beforeAll(() => { vi.spyOn(Math, 'random').mockReturnValue(0.99) })
beforeEach(async () => {
  await game.resetDbForTests()
  me = await game.loginOrCreate('ana')
})

describe('vender tudo', () => {
  it('devolve itens, ouro base e o bônus de popularidade separados', async () => {
    await give(me, 'nabo', 10) // 1,3/un (13 na base)
    await give(me, 'cenoura', 5) // 2/un
    await sql('update users set popularity = 10 where id = $1', [me])
    const r = await game.runAction(me, { type: 'sell_all' })
    expect(r.sale).toMatchObject({ count: 15, base: 23, bonus: 2, pct: 10, gold: 25 })
    expect(r.sale!.lines).toEqual(expect.arrayContaining([{ itemId: 'nabo', qty: 10, gold: 14 }, { itemId: 'cenoura', qty: 5, gold: 11 }]))
    expect((await user('ana')).gold).toBe(225)
  })
})

describe('plantar sem semente', () => {
  it('erro vem com o código no_seed (o cliente oferece a loja)', async () => {
    await expect(game.runAction(me, { type: 'plant', idx: 0, seedId: 'milho' })).rejects.toMatchObject({ code: 'no_seed' })
  })
})

describe('ração na ficha do cachorro', () => {
  beforeEach(async () => { await sql("update users set dog = 'vira_lata', dog_fed_until = now() where id = $1", [me]) })

  it('sem ração no depósito, "Alimentar" compra (30 de ouro) e dá num toque', async () => {
    const r = await game.runAction(me, { type: 'feed_dog', buy: true })
    expect(r.fx).toEqual({ gold: -30 })
    const u = await user('ana')
    expect(u.gold).toBe(170)
    expect(u.dog_fed_until.getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000)
  })

  it('com ração no depósito, usa a dela e não cobra', async () => {
    await give(me, 'racao', 2)
    const r = await game.runAction(me, { type: 'feed_dog', buy: true })
    expect(r.fx).toEqual({ item: 'racao', qty: -1 })
    expect((await user('ana')).gold).toBe(200)
  })

  it('sem o pedido de compra, continua exigindo ração', async () => {
    await expect(game.runAction(me, { type: 'feed_dog' })).rejects.toThrow(/Sem ração/)
  })
})

describe('presentes', () => {
  it('Recebidos lista o presente; Agradecer vai para o Mural de quem mandou, uma vez só', async () => {
    const bia = await game.loginOrCreate('bia')
    await game.runAction(me, { type: 'add_friend', handle: 'bia' })
    await game.runAction(me, { type: 'gift', to: 'bia', seedId: 'nabo' })
    const f = await game.loadFarm(bia)
    expect(f.gifts).toHaveLength(1)
    expect(f.gifts[0]).toMatchObject({ from: 'ana', fromBot: false, seedId: 'nabo', thanked: false })
    await expect(game.runAction(me, { type: 'thank', eventId: f.gifts[0].id })).rejects.toThrow(/não encontrado/) // não é dela
    const r = await game.runAction(bia, { type: 'thank', eventId: f.gifts[0].id })
    expect(r.message).toMatch(/agradeceu/)
    expect((await game.loadFarm(bia)).gifts[0].thanked).toBe(true)
    await expect(game.runAction(bia, { type: 'thank', eventId: f.gifts[0].id })).rejects.toThrow(/já agradeceu/)
    const mine = await game.loadFarm(me)
    expect(mine.events[0]).toMatchObject({ kind: 'thanked', actor: 'bia', payload: { seedId: 'nabo' } })
  })
})
