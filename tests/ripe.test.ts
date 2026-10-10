// Horta madura: regras do aviso (silêncio, limites, agrupamento) e a varredura persistente (server/ripe.ts).
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { brHour, cropList, friendAlertBlock, groupNow, quietHours } from '../src/game/alerts'
import { RIPE_ALERT } from '../src/game/config'
import { dailySeed, fertilizedNow } from '../src/game/rules'

process.env.PGLITE_DIR = 'memory://'
const { getDb } = await import('../src/server/db')
const game = await import('../src/server/game')
const { sweepRipe } = await import('../src/server/ripe')

const db = await getDb()
const sql = (q: string, p: unknown[] = []) => db.query(q, p)
const H = 3600_000
// 14h em Brasília (17h UTC): fora do horário de silêncio.
const T = Date.UTC(2026, 9, 10, 17, 0)

describe('regras do aviso', () => {
  it('silêncio das 23h às 8h no horário de Brasília', () => {
    expect(brHour(Date.UTC(2026, 9, 10, 2, 30))).toBe(23) // 02h30 UTC = 23h30 em Brasília
    expect(quietHours(Date.UTC(2026, 9, 10, 2, 30))).toBe(true)
    expect(quietHours(Date.UTC(2026, 9, 10, 10, 59))).toBe(true) // 07h59
    expect(quietHours(Date.UTC(2026, 9, 10, 11, 0))).toBe(false) // 08h00
    expect(quietHours(Date.UTC(2026, 9, 11, 1, 59))).toBe(false) // 22h59
    expect(quietHours(Date.UTC(2026, 9, 11, 2, 0))).toBe(true) // 23h00
  })

  it('no máximo 3 por dia e 1 por dono a cada 2 h', () => {
    expect(friendAlertBlock(T, { sentToday: 0, lastFromOwner: null })).toBeNull()
    expect(friendAlertBlock(T, { sentToday: 3, lastFromOwner: null })).toBe('daily')
    expect(friendAlertBlock(T, { sentToday: 1, lastFromOwner: T - 2 * H + 1 })).toBe('owner_gap')
    expect(friendAlertBlock(T, { sentToday: 1, lastFromOwner: T - 2 * H })).toBeNull()
    expect(friendAlertBlock(Date.UTC(2026, 9, 10, 4, 0), { sentToday: 0, lastFromOwner: null })).toBe('quiet')
  })

  it('agrupa lotes que amadurecem em seguida, mas não segura para sempre', () => {
    expect(groupNow(T, T - 1000, null)).toBe(true)
    expect(groupNow(T, T - 1000, T + RIPE_ALERT.groupMs - 1)).toBe(false)
    expect(groupNow(T, T - 1000, T + RIPE_ALERT.groupMs + 1)).toBe(true)
    expect(groupNow(T, T - RIPE_ALERT.maxWaitMs, T + 1000)).toBe(true)
    expect(cropList(['nabo', 'milho', 'nabo', 'tomate'])).toBe('Nabo, Milho e Tomate')
  })

  it('adubo: 1 por estágio, por safra', () => {
    expect(fertilizedNow(1, 3, 3, 1)).toBe(true)
    expect(fertilizedNow(2, 3, 3, 1)).toBe(false)
    expect(fertilizedNow(1, 4, 3, 1)).toBe(false) // safra nova zera
  })

  it('semente do bônus diário muda com o dia e respeita o nível', () => {
    const days = ['2026-10-08', '2026-10-09', '2026-10-10'].map((d) => dailySeed(d, 1))
    expect(new Set(days).size).toBe(3)
    for (let i = 0; i < 20; i++) expect(['nabo', 'cenoura', 'milho', 'batata']).toContain(dailySeed(`2026-11-${String(i + 1).padStart(2, '0')}`, 1))
  })
})

describe('varredura da horta madura', () => {
  let ana: string, bia: string, caio: string
  const sent: { to: string; title: string }[] = []
  const send = async (to: string, n: { title: string }) => { sent.push({ to, title: n.title }) }
  const handleOf = async (id: string) => (await sql('select handle from users where id = $1', [id])).rows[0] as { handle: string }
  const sentTo = async () => Promise.all(sent.map(async (s) => `${(await handleOf(s.to)).handle}: ${s.title}`))
  // Planta e põe a linha do tempo relativa a T: maduro `ago` ms antes de T.
  const plantAt = async (id: string, idx: number, ago: number, seedId = 'nabo') => {
    await game.runAction(id, { type: 'plant', idx, seedId })
    await sql('update plots set planted_at = $3, ready_at = $4 where owner_id = $1 and idx = $2',
      [id, idx, new Date(T - ago - H), new Date(T - ago)])
  }
  const subscribe = (id: string) =>
    sql("insert into push_subs (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')", [id, `https://push.invalid/${id}`])

  beforeAll(() => { vi.spyOn(Math, 'random').mockReturnValue(0.99) })
  beforeEach(async () => {
    sent.length = 0
    await game.resetDbForTests()
    ana = await game.loginOrCreate('ana')
    bia = await game.loginOrCreate('bia')
    caio = await game.loginOrCreate('caio')
    await game.runAction(bia, { type: 'add_friend', handle: 'ana' })
    await game.runAction(caio, { type: 'add_friend', handle: 'ana' })
    await subscribe(bia) // caio não ligou os avisos
  })

  it('avisa o dono e os amigos com aviso ligado, num aviso só para vários lotes', async () => {
    await plantAt(ana, 0, 60_000)
    await plantAt(ana, 1, 30_000)
    const r = await sweepRipe(T, send)
    expect(r.owners).toEqual([{ owner: 'ana', plots: 2, friends: ['bia'], skipped: {} }])
    expect(await sentTo()).toEqual(['ana: Sua horta está pronta! 🌱', 'bia: A horta de ana está madura. Corre lá! 🧺'])
    // Registro no Mural de quem foi avisado.
    const ev = (await sql("select kind, payload from events where user_id = $1 and kind = 'friend_ripe'", [bia])).rows as any[]
    expect(ev).toEqual([{ kind: 'friend_ripe', payload: { plots: 2, seeds: ['nabo'] } }])
    // Já avisado: a varredura seguinte não repete.
    sent.length = 0
    expect((await sweepRipe(T + 1000, send)).owners).toEqual([])
    expect(sent).toEqual([])
  })

  it('espera um lote que amadurece logo em seguida para juntar no mesmo aviso', async () => {
    await plantAt(ana, 0, 1000)
    await plantAt(ana, 1, -30_000) // amadurece daqui a 30 s
    expect((await sweepRipe(T, send)).owners).toEqual([])
    const r = await sweepRipe(T + 31_000, send)
    expect(r.owners[0]).toMatchObject({ owner: 'ana', plots: 2 })
  })

  it('reiniciar o servidor não perde o aviso: tudo vem do banco', async () => {
    await plantAt(ana, 0, -60_000) // amadurece 1 min depois de T
    expect((await sweepRipe(T, send)).nextAt).toBe(T + 60_000)
    // "Reinício": nenhum timer em memória; a primeira varredura depois de subir acha o lote.
    const r = await sweepRipe(T + 5 * 60_000, send)
    expect(r.owners[0]).toMatchObject({ owner: 'ana', friends: ['bia'] })
  })

  it('servidor fora do ar por muito tempo: safra velha só é marcada, sem aviso', async () => {
    await plantAt(ana, 0, RIPE_ALERT.staleMs + 60_000)
    expect((await sweepRipe(T, send)).owners).toEqual([])
    expect(sent).toEqual([])
    expect((await sql('select ripe_seq, sow_seq from plots where owner_id = $1 and idx = 0', [ana])).rows[0]).toEqual({ ripe_seq: 1, sow_seq: 1 })
  })

  it('perene: a safra seguinte também avisa', async () => {
    await sql('update users set level = 6, gold = 1000 where id = $1', [ana])
    await game.runAction(ana, { type: 'buy', itemId: 'semente:melancia' })
    await plantAt(ana, 0, 60_000, 'melancia')
    await sweepRipe(T, send)
    await sql('update plots set planted_at = now() - interval \'1 day\', ready_at = now() - interval \'1 minute\' where owner_id = $1 and idx = 0', [ana])
    await game.runAction(ana, { type: 'harvest', idx: 0 }) // safra 2/2 começa
    const p = (await sql('select ready_at from plots where owner_id = $1 and idx = 0', [ana])).rows[0] as { ready_at: Date }
    sent.length = 0
    const r = await sweepRipe(p.ready_at.getTime() + 1000, send)
    expect(r.owners.map((o) => o.owner)).toEqual(['ana'])
    expect(sent.some((s) => s.to === ana)).toBe(true)
  })

  it('limite por dono (2 h) e por dia (3); vizinho do jogo não gera aviso', async () => {
    const donos = ['davi', 'eva', 'fabi']
    const ids: string[] = []
    for (const d of donos) {
      const id = await game.loginOrCreate(d)
      await game.runAction(bia, { type: 'add_friend', handle: d })
      ids.push(id)
    }
    // ana amadurece 2 vezes em 1 h: a bia só ouve a 1ª.
    await plantAt(ana, 0, 1000)
    await sweepRipe(T, send)
    await plantAt(ana, 1, 1000 - H)
    let r = await sweepRipe(T + H, send)
    expect(r.owners[0].skipped).toEqual({ bia: 'owner_gap' })
    // Mais 3 donos no mesmo dia: o 4º aviso do dia é barrado.
    for (const [i, id] of ids.entries()) await plantAt(id, 0, -(H + (2 + i) * 60_000))
    r = await sweepRipe(T + H + 5 * 60_000, send)
    const got = r.owners.flatMap((o) => o.friends)
    const blocked = r.owners.flatMap((o) => Object.values(o.skipped))
    expect(got).toHaveLength(2)
    expect(blocked).toEqual(['daily'])
    expect((await sql('select count(*)::int as n from ripe_alerts where user_id = $1', [bia])).rows[0]).toEqual({ n: 3 })
    // Horta de vizinho do jogo amadurecendo não manda nada.
    expect(r.owners.map((o) => o.owner)).not.toContain('dona_cida')
  })

  it('horário de silêncio: dono é avisado, amigo não', async () => {
    const night = Date.UTC(2026, 9, 11, 3, 0) // meia-noite em Brasília
    await game.runAction(ana, { type: 'plant', idx: 0, seedId: 'nabo' })
    await sql('update plots set planted_at = $2, ready_at = $3 where owner_id = $1 and idx = 0', [ana, new Date(night - H), new Date(night - 1000)])
    const r = await sweepRipe(night, send)
    expect(r.owners[0]).toMatchObject({ friends: [], skipped: { bia: 'quiet' } })
    expect(sent.map((s) => s.to)).toEqual([ana])
  })
})

describe('Fertilizante do Amor', () => {
  let ana: string, bia: string
  beforeEach(async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    await game.resetDbForTests()
    ana = await game.loginOrCreate('ana')
    bia = await game.loginOrCreate('bia')
  })

  it('grátis, 1 por dia, só em horta de amigo; adianta 1 h-base, dá XP e avisa o dono no Mural', async () => {
    await game.runAction(bia, { type: 'buy', itemId: 'semente:milho', qty: 2 })
    await game.runAction(bia, { type: 'plant', idx: 0, seedId: 'milho' })
    await game.runAction(bia, { type: 'plant', idx: 1, seedId: 'nabo' })
    const ready0 = (await game.loadFarm(bia)).plots[0].readyAt!
    await expect(game.runAction(ana, { type: 'love', owner: 'bia', idx: 0 })).rejects.toThrow(/amigos/)
    await game.runAction(ana, { type: 'add_friend', handle: 'bia' })
    await expect(game.runAction(ana, { type: 'love', owner: 'ana', idx: 0 })).rejects.toThrow(/amigo/)
    expect((await game.loadFarm(ana)).me.loveLeft).toBe(1)
    const xp0 = (await game.loadFarm(ana)).me.xp
    const r = await game.runAction(ana, { type: 'love', owner: 'bia', idx: 0 })
    expect(r.fx).toEqual({ xp: 3 })
    const f = await game.loadFarm(ana, 'bia')
    const { origHoursMs } = await import('../src/game/config')
    expect(ready0 - f.plots[0].readyAt!).toBe(origHoursMs(1)) // 7,5 min num milho de 1 h
    expect(f.plots[0].stage).toBe(0)
    expect(f.plots[0].fertilized).toBe(true)
    expect(f.me.loveLeft).toBe(0)
    expect(f.me.xp).toBe(xp0 + 3)
    await expect(game.runAction(ana, { type: 'love', owner: 'bia', idx: 1 })).rejects.toThrow(/hoje/)
    const ev = (await sql("select e.kind, a.handle from events e join users a on a.id = e.actor_id where e.user_id = $1 and e.kind = 'loved'", [bia])).rows
    expect(ev).toEqual([{ kind: 'loved', handle: 'ana' }])
    // O dono não pode emendar o adubo dele no estágio que o amigo já adubou.
    await game.runAction(bia, { type: 'buy', itemId: 'adubo' })
    await expect(game.runAction(bia, { type: 'fertilize', idx: 0 })).rejects.toThrow(/mais fertilizante/)
  })

  it('não usa em planta madura nem vazia', async () => {
    await game.runAction(ana, { type: 'add_friend', handle: 'bia' })
    await expect(game.runAction(ana, { type: 'love', owner: 'bia', idx: 0 })).rejects.toThrow(/crescendo/)
    expect((await game.loadFarm(ana)).me.loveLeft).toBe(1)
  })
})
