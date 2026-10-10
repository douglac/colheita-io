// Fluxos do servidor contra um Postgres em memória (PGlite).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

process.env.PGLITE_DIR = 'memory://'
const { getDb } = await import('../src/server/db')
const game = await import('../src/server/game')
const rules = await import('../src/game/rules')

const db = await getDb()
const sql = (q: string, p: unknown[] = []) => db.query(q, p)
const user = async (handle: string) => (await sql('select * from users where handle = $1', [handle])).rows[0] as Record<string, any>
const ripen = (handle: string, idx: number) =>
  sql(`update plots set planted_at = now() - interval '2 hours', ready_at = now() - interval '1 minute'
       where idx = $2 and owner_id = (select id from users where handle = $1)`, [handle, idx])
// O 1º loadFarm do dia dá 1 semente sorteada (dailySeed muda com a data): conta ela se for a mesma do teste.
const withBonus = (f: { dailyBonus: { seedId: string } | null }, seedId: string, qty: number) =>
  ({ itemId: `semente:${seedId}`, qty: qty + (f.dailyBonus?.seedId === seedId ? 1 : 0) })

let me: string
// Os roubos deste arquivo seguem a regra 'chunk' (1 tentativa por lote); o 'tap' tem testes em steal-tap.test.ts.
const { STEAL } = await import('../src/game/config')
beforeEach(() => { STEAL.mode = 'chunk' })
beforeAll(() => { vi.spyOn(Math, 'random').mockReturnValue(0.99) }) // sem sorte: nada seca, nada morde
afterEach(() => vi.mocked(Math.random).mockReturnValue(0.99))
beforeEach(async () => {
  await game.resetDbForTests()
  me = await game.loginOrCreate('ana')
})

describe('servidor', () => {
  it('jogador novo: 200 de ouro, 6 sementes de nabo e bônus do 1º dia (ouro + 1 semente do dia + 1 osso)', async () => {
    const f = await game.loadFarm(me)
    // Em época de evento (calendário real), a semente do bônus é a do evento (Evo-21).
    const { currentEvent } = await import('../src/server/events')
    const { bonusEventSeeds } = await import('../src/game/events')
    const seedId = rules.dailySeed(rules.gameDay(Date.now()), 1, bonusEventSeeds(await currentEvent(db, Date.now()), Date.now()))
    expect(f.dailyBonus).toMatchObject({ streak: 1, gold: 20, seedId, bones: 1 })
    expect(f.me.gold).toBe(220)
    expect(f.inventory).toEqual(seedId === 'nabo' ? [{ itemId: 'osso', qty: 1 }, { itemId: 'semente:nabo', qty: 7 }]
      : [{ itemId: 'osso', qty: 1 }, { itemId: `semente:${seedId}`, qty: 1 }, { itemId: 'semente:nabo', qty: 6 }])
    expect((await game.loadFarm(me)).dailyBonus).toBeNull()
  })

  it('plantar gasta semente do depósito; sem semente, compra na loja', async () => {
    for (let i = 0; i < 6; i++) await game.runAction(me, { type: 'plant', idx: i, seedId: 'nabo' })
    await ripen('ana', 0)
    await game.runAction(me, { type: 'harvest', idx: 0 })
    await game.runAction(me, { type: 'clear', idx: 0 })
    await expect(game.runAction(me, { type: 'plant', idx: 0, seedId: 'milho' })).rejects.toThrow(/compre na loja/)
    const r = await game.runAction(me, { type: 'buy', itemId: 'semente:milho', qty: 2 })
    expect(r.fx).toMatchObject({ gold: -100 }) // milho 500 de base × PACE.gold = 50
    expect((await user('ana')).gold).toBe(100) // 200 iniciais − 100 (o bônus diário só vem no loadFarm)
  })

  it('pragas reduzem a colheita; tirar praga dá XP', async () => {
    await game.runAction(me, { type: 'plant', idx: 0, seedId: 'nabo' })
    await sql("update plots set pests = 2, yield_total = 10, yield_left = 10 where idx = 0 and owner_id = $1", [me])
    await game.runAction(me, { type: 'care', idx: 0, tool: 'pesticide' })
    await ripen('ana', 0)
    const r = await game.runAction(me, { type: 'harvest', idx: 0 })
    expect(r.message).toMatch(/Colheu 10 Nabo/) // 1 praga → 95% de 10 = 9,5 → 10
    expect((await user('ana')).xp).toBe(1 + 2 + 20) // plantar + tirar praga + colher (nabo: 40 XP de base × PACE.xp)
  })

  it('ajudar na fazenda do amigo dá XP + ouro e avisa o dono; sabotagem tem limite por lote', async () => {
    const bia = await game.loginOrCreate('bia')
    await game.runAction(bia, { type: 'plant', idx: 0, seedId: 'nabo' })
    for (let i = 0; i < 3; i++) await game.runAction(me, { type: 'sabotage', owner: 'bia', idx: 0, kind: 'weed' })
    await expect(game.runAction(me, { type: 'sabotage', owner: 'bia', idx: 0, kind: 'weed' })).rejects.toThrow(/cheio/)
    const r = await game.runAction(me, { type: 'care', owner: 'bia', idx: 0, tool: 'herbicide' })
    expect(r.fx).toEqual({ xp: 2, gold: 1 })
    const kinds = (await sql("select kind from events where user_id = $1 order by id", [bia])).rows.map((e: any) => e.kind)
    expect(kinds).toEqual(['sabotaged', 'sabotaged', 'sabotaged', 'helped'])
  })

  it('cachorro acordado morde: a tentativa conta e o ouro vai para o dono', async () => {
    await game.loadFarm(me) // cria os bots
    await ripen('seu_ze', 0)
    vi.mocked(Math.random).mockReturnValue(0)
    const r = await game.runAction(me, { type: 'steal', owner: 'seu_ze', idx: 0 })
    expect(r.bad).toBe(true)
    expect(r.fx?.gold).toBe(-27) // Pastor do seu_zé: 12% de 220 (200 + bônus do dia), arredondado para cima
    expect((await user('seu_ze')).gold).toBe(227)
    await expect(game.runAction(me, { type: 'steal', owner: 'seu_ze', idx: 0 })).rejects.toThrow(/já tentou/)
  })

  it('adubo comum adianta 1 h de base (× PACE.time); 1 por estágio: o seguinte só depois de a planta crescer', async () => {
    const { fertCutMs, FERTILIZERS } = await import('../src/game/config')
    await sql("update users set level = 3 where id = $1", [me])
    await game.runAction(me, { type: 'buy', itemId: 'semente:tomate' })
    await game.runAction(me, { type: 'buy', itemId: 'adubo', qty: 2 })
    await game.runAction(me, { type: 'plant', idx: 0, seedId: 'tomate' })
    const ready0 = (await game.loadFarm(me)).plots[0].readyAt!
    await game.runAction(me, { type: 'fertilize', idx: 0 })
    let f = await game.loadFarm(me)
    expect(ready0 - f.plots[0].readyAt!).toBe(fertCutMs(FERTILIZERS.adubo)) // 7,5 min num tomate de 3 h 15
    expect(f.plots[0].stage).toBe(0)
    expect(f.plots[0].fertilized).toBe(true)
    // O estágio em que o adubo deixou a planta já conta como adubado: não dá para emendar.
    await expect(game.runAction(me, { type: 'fertilize', idx: 0 })).rejects.toThrow(/mais fertilizante/)
    expect((await game.loadFarm(me)).inventory.find((i) => i.itemId === 'adubo')?.qty).toBe(1) // recusado não gasta
    // A planta cresce sozinha até o estágio 1 (tomate: 6 das 26 h de base): aí pode adubar de novo.
    const span = f.plots[0].readyAt! - f.plots[0].plantedAt!
    await sql(`update plots set planted_at = planted_at - $2 * interval '1 millisecond', ready_at = ready_at - $2 * interval '1 millisecond'
               where idx = 0 and owner_id = $1`, [me, Math.ceil((span * 6) / 26) + 1000])
    f = await game.loadFarm(me)
    expect(f.plots[0].stage).toBe(1)
    expect(f.plots[0].fertilized).toBe(false)
    await game.runAction(me, { type: 'fertilize', idx: 0 })
    f = await game.loadFarm(me)
    expect(f.plots[0].stage).toBe(1)
    expect(f.plots[0].plantedAt).toBeLessThan(Date.now())
    await expect(game.runAction(me, { type: 'fertilize', idx: 0 })).rejects.toThrow(/mais fertilizante/)
  })

  it('terreno: precisa de nível e ouro; missão paga uma vez', async () => {
    await expect(game.runAction(me, { type: 'expand' })).rejects.toThrow(/nível 3/)
    await sql("update users set level = 3, gold = 1000 where id = $1", [me])
    await game.runAction(me, { type: 'expand' })
    const f = await game.loadFarm(me)
    expect(f.plots).toHaveLength(7)
    expect(f.land.next).toEqual({ gold: 720, minLevel: 4 }) // 2º terreno na tabela base: 18.000 × 0,1 × 0,4, nível 7 × ½

    const slot = f.missions.findIndex((m) => m.text.startsWith('Plante'))
    if (slot >= 0) {
      for (let i = 0; i < 5; i++) await game.runAction(me, { type: 'plant', idx: i, seedId: 'nabo' })
      await game.runAction(me, { type: 'claim', slot })
      await expect(game.runAction(me, { type: 'claim', slot })).rejects.toThrow(/já recebida/)
    }
  })
})

describe('culturas perenes', () => {
  it('melancia: 3 safras; cada colheita volta para as folhas grandes; a 3ª seca', async () => {
    await sql("update users set level = 6, gold = 1000 where id = $1", [me])
    await game.runAction(me, { type: 'buy', itemId: 'semente:melancia' })
    await game.runAction(me, { type: 'plant', idx: 0, seedId: 'melancia' })
    await ripen('ana', 0)
    const r = await game.runAction(me, { type: 'harvest', idx: 0 })
    expect(r.message).toMatch(/safra 1\/3/)
    let f = await game.loadFarm(me)
    expect(f.plots[0]).toMatchObject({ state: 'growing', stage: 3, season: 2, seasons: 3 })
    await ripen('ana', 0)
    await game.runAction(me, { type: 'harvest', idx: 0 })
    expect((await game.loadFarm(me)).plots[0]).toMatchObject({ state: 'growing', stage: 3, season: 3 })
    await ripen('ana', 0)
    await game.runAction(me, { type: 'harvest', idx: 0 })
    f = await game.loadFarm(me)
    expect(f.plots[0].state).toBe('withered')
  })
})

describe('multiplayer', () => {
  it('convite: os dois ganham ouro, viram amigos e o 1º convite traz um Vira-lata', async () => {
    const code = (await user('ana')).invite_code
    const bia = await game.loginOrCreate('bia', code)
    expect((await user('bia')).gold).toBe(250)
    expect((await user('ana')).gold).toBe(250)
    expect((await user('ana')).dog).toBe('vira_lata')
    const f = await game.loadFarm(bia)
    expect(f.neighbors.find((n) => n.handle === 'ana')).toMatchObject({ friend: true })
    expect(f.inventory).toContainEqual(withBonus(f, 'cenoura', 3))
    // Convite não vale para conta que já existe.
    await game.loginOrCreate('bia', code)
    expect((await user('ana')).gold).toBe(250)
  })

  it('presente: 1 por amigo por dia, só para amigos', async () => {
    await game.loginOrCreate('caio')
    await expect(game.runAction(me, { type: 'gift', to: 'caio', seedId: 'nabo' })).rejects.toThrow(/amigos/)
    await game.runAction(me, { type: 'add_friend', handle: 'caio' })
    await game.runAction(me, { type: 'gift', to: 'caio', seedId: 'nabo' })
    await expect(game.runAction(me, { type: 'gift', to: 'caio', seedId: 'nabo' })).rejects.toThrow(/hoje/)
    const caio = (await user('caio')).id
    const f = await game.loadFarm(caio)
    expect(f.inventory).toContainEqual(withBonus(f, 'nabo', 7))
    expect(f.events[0]).toMatchObject({ kind: 'gift', actor: 'ana' })
  })
})

describe('anti-abuso', () => {
  it('conta nova não rouba de jogador real nos primeiros 10 min, mas rouba dos vizinhos-bot', async () => {
    const bia = await game.loginOrCreate('bia')
    await game.runAction(bia, { type: 'plant', idx: 0, seedId: 'nabo' })
    await ripen('bia', 0)
    await expect(game.runAction(me, { type: 'steal', owner: 'bia', idx: 0 })).rejects.toThrow(/Fazendeiro novo/)
    await sql("update users set created_at = now() - interval '11 minutes' where id = $1", [me])
    const r = await game.runAction(me, { type: 'steal', owner: 'bia', idx: 0 })
    expect(r.message).toMatch(/Pegou/)
  })
})

describe('flores e registro', () => {
  it('girassol vira flor; dar flor a amigo (ou a si) soma popularidade; compra e venda vão para o registro', async () => {
    await sql("update users set level = 3, gold = 500 where id = $1", [me])
    await game.runAction(me, { type: 'buy', itemId: 'semente:girassol' })
    await game.runAction(me, { type: 'plant', idx: 0, seedId: 'girassol' })
    await ripen('ana', 0)
    await game.runAction(me, { type: 'harvest', idx: 0 })
    let f = await game.loadFarm(me)
    expect(f.inventory).toContainEqual({ itemId: 'flor:girassol', qty: 3 }) // "flor de sol": 3 unidades

    const bia = await game.loginOrCreate('bia')
    await expect(game.runAction(me, { type: 'give_flower', to: 'bia', seedId: 'girassol' })).rejects.toThrow(/amigos/)
    await game.runAction(me, { type: 'add_friend', handle: 'bia' })
    await game.runAction(me, { type: 'give_flower', to: 'bia', seedId: 'girassol' })
    expect((await user('bia')).popularity).toBe(1)
    await game.runAction(me, { type: 'give_flower', to: 'ana', seedId: 'girassol' }) // 2ª das 3 flores: fica com ela
    await game.runAction(me, { type: 'give_flower', to: 'bia', seedId: 'girassol' })
    await expect(game.runAction(me, { type: 'give_flower', to: 'ana', seedId: 'girassol' })).rejects.toThrow(/não tem flor/)

    f = await game.loadFarm(me)
    const kinds = f.events.map((e) => e.kind)
    expect(kinds).toContain('bought')
    expect((await game.loadFarm(bia)).events.map((e) => e.kind)).toContain('flower')
  })
})

describe('mecânicas do jogo', () => {
  it('adubos: rápido −2 h 30 e super −5 h 30 (× PACE.time), preços 350 e 1.000 (× PACE.gold); baú ao limpar', async () => {
    const { fertCutMs, FERTILIZERS, PACE } = await import('../src/game/config')
    const { SHOP_BY_ID } = await import('../src/game/catalog')
    expect([SHOP_BY_ID.adubo.gold, SHOP_BY_ID.adubo_forte.gold, SHOP_BY_ID.adubo_super.gold]).toEqual([5, 35, 100])
    expect(fertCutMs(FERTILIZERS.adubo_super)).toBe(Math.round(5.5 * 3600_000 * PACE.time))
    await sql("update users set level = 5, xp = 500, gold = 1000 where id = $1", [me])
    await game.runAction(me, { type: 'buy', itemId: 'semente:tomate', qty: 2 })
    await game.runAction(me, { type: 'buy', itemId: 'adubo_forte' })
    await game.runAction(me, { type: 'buy', itemId: 'adubo_super' })
    await game.runAction(me, { type: 'plant', idx: 0, seedId: 'tomate' })
    await game.runAction(me, { type: 'plant', idx: 2, seedId: 'tomate' })
    const r0 = (await game.loadFarm(me)).plots.map((p) => p.readyAt ?? 0)
    await game.runAction(me, { type: 'fertilize', idx: 0, itemId: 'adubo_forte' })
    await game.runAction(me, { type: 'fertilize', idx: 2, itemId: 'adubo_super' })
    const f = await game.loadFarm(me)
    expect(r0[0] - f.plots[0].readyAt!).toBe(fertCutMs(FERTILIZERS.adubo_forte)) // ~19 min
    expect(r0[2] - f.plots[2].readyAt!).toBe(fertCutMs(FERTILIZERS.adubo_super)) // ~41 min
    expect(f.plots[2].stage).toBe(0) // 1º estágio do tomate: 6 das 26 h; o super adubo corta 5 h 30

    await game.runAction(me, { type: 'plant', idx: 1, seedId: 'nabo' })
    await ripen('ana', 1)
    await game.runAction(me, { type: 'harvest', idx: 1 })
    vi.mocked(Math.random).mockReturnValue(0.01) // baú sai
    const r = await game.runAction(me, { type: 'clear', idx: 1 })
    expect(r.message).toMatch(/baú/)
    expect(r.fx?.gold).toBeGreaterThanOrEqual(10)
  })
})

describe('cachorro com raças, ração e prazo', () => {
  // Dono com cachorro da raça pedida e um lote maduro; ladrão (ana) já fora da quarentena.
  async function farmWithDog(handle: string, breed: string) {
    const id = await game.loginOrCreate(handle)
    await sql("update users set level = 8, xp = 1400, gold = 10000 where id = $1", [id]) // xp do nível 8 (25·8·7)
    await game.runAction(id, { type: 'buy', itemId: `cao:${breed}` })
    await game.runAction(id, { type: 'plant', idx: 0, seedId: 'nabo' })
    await ripen(handle, 0)
    return id
  }
  beforeEach(async () => { await sql("update users set created_at = now() - interval '1 hour', gold = 1000 where id = $1", [me]) })

  it('a chance e a multa dependem da raça', async () => {
    const bia = await farmWithDog('bia', 'vira_lata') // morde 25%
    const caio = await farmWithDog('caio', 'salsicha') // morde 40%, multa 8% (até 200)
    // Os dois cachorros de frente para o lote: chance da raça × 1,85 (vira-lata 46%, salsicha 74%).
    const { nextFacing } = await import('../src/game/patrol')
    const { plotPos, DOG_AREA } = await import('../src/scene/layout')
    const home = { x: Math.round((DOG_AREA.x0 + DOG_AREA.x1) / 2), y: Math.round((DOG_AREA.y0 + DOG_AREA.y1) / 2) } // casa padrão da patrulha
    const clock = vi.spyOn(Date, 'now')
    const front = (id: string) => clock.mockReturnValue(nextFacing(id, home, plotPos(0).x, false, Date.now())!)
    vi.mocked(Math.random).mockReturnValue(0.6)
    front(bia)
    const r1 = await game.runAction(me, { type: 'steal', owner: 'bia', idx: 0 })
    expect(r1.bad).toBeFalsy()
    front(caio)
    const r2 = await game.runAction(me, { type: 'steal', owner: 'caio', idx: 0 })
    clock.mockRestore()
    expect(r2.bad).toBe(true)
    expect(r2.message).toMatch(/Salsicha/)
    expect(r2.fx?.gold).toBe(-80) // 8% de 1000
    expect((await user('caio')).gold).toBe(10000 - 1500 + 80)
  })

  it('sem ração o cachorro dorme e não morde', async () => {
    const caio = await farmWithDog('caio', 'pastor')
    await sql("update users set dog_fed_until = now() - interval '1 minute' where id = $1", [caio])
    vi.mocked(Math.random).mockReturnValue(0) // sorteio mais favorável à mordida
    const r = await game.runAction(me, { type: 'steal', owner: 'caio', idx: 0 })
    expect(r.bad).toBeFalsy()
    const f = await game.loadFarm(me, 'caio')
    expect(f.owner.dog).toMatchObject({ kind: 'pastor', awake: false })
  })

  it('prazo: avisa antes de ir embora e depois o cachorro some (relógio controlado)', async () => {
    const caio = await farmWithDog('caio', 'salsicha') // 30 dias
    const t0 = Date.now()
    const clock = vi.spyOn(Date, 'now')
    try {
      clock.mockReturnValue(t0 + 29 * 86_400_000)
      let f = await game.loadFarm(caio)
      expect(f.me.dog).toMatchObject({ kind: 'salsicha' })
      expect(f.events.map((e) => e.kind)).toEqual(expect.arrayContaining(['dog_leaving', 'dog_hungry']))
      clock.mockReturnValue(t0 + 31 * 86_400_000)
      f = await game.loadFarm(caio)
      expect(f.me.dog).toBeNull()
      expect(f.events[0].kind).toBe('dog_left')
      // E não morde mais: lote maduro de novo, sorteio favorável à mordida.
      await ripen('caio', 0)
      vi.mocked(Math.random).mockReturnValue(0)
      const r = await game.runAction(me, { type: 'steal', owner: 'caio', idx: 0 })
      expect(r.bad).toBeFalsy()
    } finally {
      clock.mockRestore()
    }
  })

  it('vira-lata é permanente; trocar de raça zera prazo e avisos', async () => {
    const bia = await farmWithDog('bia', 'vira_lata')
    expect((await user('bia')).dog_expires_at).toBeNull()
    await game.runAction(bia, { type: 'buy', itemId: 'cao:pastor' })
    const u = await user('bia')
    expect(u.dog).toBe('pastor')
    expect(u.dog_expires_at.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000)
    await expect(game.runAction(bia, { type: 'buy', itemId: 'cao:pastor' })).rejects.toThrow(/já tem/)
  })
})

describe('terrenos até 24', () => {
  it('preço e nível de cada lote extra (7º ao 24º), sempre crescentes', async () => {
    const { landPrice } = await import('../src/game/config')
    // Tabela base: 9.000 (nível 5), 18.000 (7), 27.000 (9), 45.000 (11)…
    // em escala: ouro × 0,1 × 0,4 e nível × ½.
    const esperado = [
      [360, 3], [720, 4], [1080, 5], [1800, 6], [2520, 7], [3240, 8], [4320, 9], [5400, 10], [6480, 11],
      [8280, 12], [10800, 13], [18000, 14], [21600, 15], [25200, 16], [28800, 17], [32400, 18], [36000, 19], [39600, 20],
    ]
    esperado.forEach(([gold, minLevel], i) => expect(landPrice(i + 1)).toEqual({ gold, minLevel }))
    const { landOriginal } = await import('../src/game/config')
    expect(landOriginal(1)).toEqual({ gold: 9000, minLevel: 5 })
    expect(landOriginal(22)).toEqual({ gold: 1350000, minLevel: 47 })
  })

  it('compra lote a lote até 24; sem ouro ou sem nível é recusada; depois do 24º acabou', async () => {
    await sql("update users set level = 20, xp = 9500, gold = 100 where id = $1", [me])
    await expect(game.runAction(me, { type: 'expand' })).rejects.toThrow(/Ouro insuficiente/)
    await sql("update users set gold = 1000000 where id = $1", [me])
    for (let i = 7; i <= 24; i++) await game.runAction(me, { type: 'expand' })
    const f = await game.loadFarm(me)
    expect(f.plots).toHaveLength(24)
    expect(f.plots.map((p) => p.idx)).toEqual([...Array(24).keys()])
    expect(f.land.next).toBeNull()
    await expect(game.runAction(me, { type: 'expand' })).rejects.toThrow(/tamanho máximo/)
    // Gastou exatamente a soma da tabela.
    const { landPrice } = await import('../src/game/config')
    const total = Array.from({ length: 18 }, (_, i) => landPrice(i + 1).gold).reduce((a, b) => a + b)
    expect((await user('ana')).gold).toBe(1000000 + 20 - total) // +20 do bônus do dia no loadFarm
  })

  it('nível baixo não compra o lote seguinte', async () => {
    await sql("update users set gold = 100000 where id = $1", [me]) // nível 1
    await expect(game.runAction(me, { type: 'expand' })).rejects.toThrow(/nível 3/)
  })

  it('roubo continua limitado por dia com 24 lotes maduros', async () => {
    const bia = await game.loginOrCreate('bia')
    await sql("update users set created_at = now() - interval '1 hour' where id = $1", [me])
    for (let i = 6; i < 24; i++) await sql('insert into plots (owner_id, idx) values ($1, $2)', [bia, i])
    await sql(`update plots set seed_id = 'milho', planted_at = now() - interval '2 hours', ready_at = now() - interval '1 minute',
      yield_total = 30, yield_left = 30, sow_seq = 1 where owner_id = $1`, [bia])
    for (let i = 0; i < 20; i++) await game.runAction(me, { type: 'steal', owner: 'bia', idx: i })
    await expect(game.runAction(me, { type: 'steal', owner: 'bia', idx: 20 })).rejects.toThrow(/Limite de 20/)
  })
})
