// Evolução 09: eventos sazonais. Calendário em Brasília, a trava "o evento não acaba antes de a semente
// amadurecer" (lição do Bis Limão), a cadeia de missões e, no servidor, a tigela de doces social.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SEED_BY_ID, SHOP_BY_ID } from '../src/game/catalog'
import { HALLOWEEN } from '../src/game/event-content'
import type { EventDef } from '../src/game/event-types'
import {
  activeEvent, bowlLook, EVENT_DEFS, eventGrowMs, eventWindow, missionChain, seedLifeMs, seedsUntil, seriesOnSale, shopOpenFor,
  validateEvent, windowOfYear, zonedMidnight,
} from '../src/game/events'

process.env.PGLITE_DIR = 'memory://'
const { getDb } = await import('../src/server/db')
const game = await import('../src/server/game')
const events = await import('../src/server/events')

const db = await getDb()
const sql = (q: string, p: unknown[] = []) => db.query(q, p)
const utc = (s: string) => Date.parse(s)
const H = 3600_000

describe('calendário (fuso de Brasília)', () => {
  it('Dia das Bruxas: de 20/out 00:00 a 5/nov 23:59:59 em Brasília (UTC−3)', () => {
    const w = windowOfYear(HALLOWEEN, 2026)
    expect(new Date(w.startsAt).toISOString()).toBe('2026-10-20T03:00:00.000Z')
    expect(new Date(w.endsAt).toISOString()).toBe('2026-11-06T03:00:00.000Z')
    expect(activeEvent(utc('2026-10-20T02:59:59Z'))).toBeNull() // 19/out 23:59:59 em Brasília
    expect(activeEvent(utc('2026-10-20T03:00:00Z'))?.def.id).toBe('halloween')
    expect(activeEvent(utc('2026-11-06T02:59:59Z'))?.def.id).toBe('halloween') // 5/nov 23:59:59
    expect(activeEvent(utc('2026-11-06T03:00:00Z'))).toBeNull()
    expect(activeEvent(utc('2026-10-09T12:00:00Z'))?.def.id).toBe('criancas') // Dia das Crianças (4 a 12/out, Evolução 13)
    expect(activeEvent(utc('2026-10-15T12:00:00Z'))).toBeNull()
  })

  it('repete todo ano; a janela é a em curso ou a próxima', () => {
    expect(new Date(eventWindow(HALLOWEEN, utc('2026-12-01T00:00:00Z')).startsAt).toISOString()).toBe('2027-10-20T03:00:00.000Z')
    expect(new Date(eventWindow(HALLOWEEN, utc('2026-10-25T00:00:00Z')).startsAt).toISOString()).toBe('2026-10-20T03:00:00.000Z')
    expect(activeEvent(utc('2030-10-31T15:00:00Z'))?.def.id).toBe('halloween')
  })

  it('janela que vira o ano (Ano Novo 29/12 → 5/1) e meia-noite em fuso com horário de verão', () => {
    const anoNovo: EventDef = { ...HALLOWEEN, id: 'ano_novo', seeds: [], series: [], calendar: { start: '12-29', end: '01-05' } }
    const w = windowOfYear(anoNovo, 2026)
    expect(new Date(w.startsAt).toISOString()).toBe('2026-12-29T03:00:00.000Z')
    expect(new Date(w.endsAt).toISOString()).toBe('2027-01-06T03:00:00.000Z')
    expect(activeEvent(utc('2027-01-02T12:00:00Z'), null, [anoNovo])?.def.id).toBe('ano_novo')
    // Nova York: −4 h no verão, −5 h no inverno.
    expect(new Date(zonedMidnight(2026, 7, 1, 'America/New_York')).toISOString()).toBe('2026-07-01T04:00:00.000Z')
    expect(new Date(zonedMidnight(2026, 12, 1, 'America/New_York')).toISOString()).toBe('2026-12-01T05:00:00.000Z')
  })

  it('atalho de QA: força agora, desliga e, forçado e vencido, fica sem evento', () => {
    const now = utc('2026-10-09T12:00:00Z')
    const on = activeEvent(now, { mode: 'on', eventId: 'halloween', startsAt: now - 1000, endsAt: now + 10 * H })
    expect(on).toMatchObject({ forced: true, endsAt: now + 10 * H })
    expect(activeEvent(utc('2026-10-31T12:00:00Z'), { mode: 'off' })).toBeNull()
    expect(activeEvent(now + 11 * H, { mode: 'on', eventId: 'halloween', startsAt: now - 1000, endsAt: now + 10 * H })).toBeNull()
  })
})

describe('trava do Bis Limão: o evento nunca termina antes de a semente amadurecer', () => {
  it('todo evento do calendário passa na validação (janela maior que o crescimento + folga)', () => {
    for (const def of EVENT_DEFS) for (const y of [2026, 2027, 2028]) expect(validateEvent(def, y)).toEqual([])
  })

  it('a loja para de vender a semente com antecedência igual ao tempo de crescimento (+ folga para colher)', () => {
    const w = windowOfYear(HALLOWEEN, 2026)
    const until = seedsUntil(HALLOWEEN, w.endsAt)
    const seed = SEED_BY_ID.abobora_halloween
    expect(eventGrowMs(HALLOWEEN)).toBe(seedLifeMs(seed))
    expect(w.endsAt - until).toBe(seedLifeMs(seed) + HALLOWEEN.graceH * H)
    const ev = activeEvent(w.startsAt + 1000)!
    const item = SHOP_BY_ID['semente:abobora_halloween']
    expect(item.event).toBe('halloween')
    expect(shopOpenFor(item, ev, until - 1)).toBe(true)
    expect(shopOpenFor(item, ev, until)).toBe(false)
    // Quem comprou no último instante colhe antes do fim.
    expect(until - 1 + seedLifeMs(seed)).toBeLessThan(w.endsAt)
    // Fora da época, nada de evento na loja; itens comuns sempre.
    expect(shopOpenFor(item, null, w.startsAt - 1)).toBe(false)
    expect(shopOpenFor(SHOP_BY_ID.pacote_doces, ev, until + 1)).toBe(true) // só a semente sai antes
    expect(shopOpenFor(SHOP_BY_ID['semente:nabo'], null, 0)).toBe(true)
    expect(seriesOnSale('bruxinha', ev)).toBe(true)
    expect(seriesOnSale('bruxinha', null)).toBe(false)
    expect(seriesOnSale('inverno', null)).toBe(true)
  })

  it('a mesma trava vale para a Árvore de Natal (evento só de semente, config.EVENTS)', () => {
    const item = SHOP_BY_ID['semente:arvore_natal']
    const life = seedLifeMs(SEED_BY_ID.arvore_natal)
    expect(shopOpenFor(item, null, utc('2026-12-10T15:00:00Z'))).toBe(true)
    // 26/dez às 23:00 em Brasília: não amadureceria até o fim do Natal.
    const late = utc('2026-12-27T02:00:00Z')
    expect(late + life).toBeGreaterThan(utc('2026-12-27T03:00:00Z'))
    expect(shopOpenFor(item, null, late)).toBe(false)
    expect(shopOpenFor(item, null, utc('2026-10-31T15:00:00Z'))).toBe(false)
  })

  it('perene conta todas as safras; evento curto demais não passa na validação', () => {
    const perene = { ...SEED_BY_ID.morango }
    expect(seedLifeMs(perene)).toBeGreaterThan(seedLifeMs({ ...perene, seasons: 1 }))
    const curto: EventDef = { ...HALLOWEEN, calendar: { start: '10-20', end: '10-20' }, graceH: 30 }
    expect(validateEvent(curto)).toContain('a semente não teria tempo de amadurecer antes do fim')
  })
})

describe('regras puras do evento', () => {
  it('tigela: vazia, pela metade, cheia', () => {
    expect(bowlLook(0, 10)).toBe('vazia')
    expect(bowlLook(1, 10)).toBe('meia')
    expect(bowlLook(5, 10)).toBe('meia')
    expect(bowlLook(6, 10)).toBe('cheia')
    expect(bowlLook(10, 10)).toBe('cheia')
  })

  it('missões em cadeia: só a primeira não resgatada fica aberta', () => {
    const chain = missionChain(HALLOWEEN, (k) => (k === 'take' ? 5 : 0), (i) => i === 0)
    expect(chain[0]).toMatchObject({ claimed: true, open: false })
    expect(chain[1]).toMatchObject({ open: true, progress: 0 })
    expect(chain.slice(2).every((m) => !m.open)).toBe(true)
    expect(missionChain(HALLOWEEN, () => 99, () => false)[0].progress).toBe(HALLOWEEN.missions[0].target)
  })
})

// ---------- servidor ----------

const force = (endsInMs = 10 * 24 * H) => events.saveOverride(db, { mode: 'on', eventId: 'halloween', startsAt: Date.now() - 60_000, endsAt: Date.now() + endsInMs })
const qty = async (userId: string, item: string) => Number((await sql('select qty from inventory where user_id = $1 and item_id = $2', [userId, item])).rows[0]?.qty ?? 0)
const friends = async (a: string, b: string) => {
  await sql(`insert into friendships (user_id, friend_id, via) values ($1, $2, 'add'), ($2, $1, 'add') on conflict do nothing`, [a, b])
}

let ana: string, bia: string
beforeAll(() => { vi.spyOn(Math, 'random').mockReturnValue(0.99) }) // sem baú, sem praga
afterAll(() => vi.mocked(Math.random).mockRestore())
beforeEach(async () => {
  await game.resetDbForTests()
  ana = await game.loginOrCreate('ana')
  bia = await game.loginOrCreate('bia')
})

describe('evento no servidor', () => {
  it('sem evento: nada na tela e as ações recusam; a semente de evento não vende', async () => {
    await events.saveOverride(db, { mode: 'off' })
    expect((await game.loadFarm(ana)).event).toBeNull()
    await expect(game.runAction(ana, { type: 'event_shoo' })).rejects.toThrow(/Não há evento/)
    await expect(game.runAction(ana, { type: 'buy', itemId: 'semente:abobora_halloween' })).rejects.toThrow(/época do evento/)
    await expect(game.runAction(ana, { type: 'decor_buy', itemId: 'casa:bruxinha' })).rejects.toThrow(/época do evento/)
  })

  it('tigela social: a 1ª vem cheia, o amigo pega 1 por dia (+doce, +XP) e o dono vê no Mural quem pegou', async () => {
    await force()
    await friends(ana, bia)
    const own = (await game.loadFarm(ana)).event!
    expect(own.bowl).toMatchObject({ candies: 10, capacity: 10, look: 'cheia', prizeReady: false })
    const visit = (await game.loadFarm(bia, 'ana')).event!
    expect(visit.bowl).toMatchObject({ candies: 10, canTake: true, takenToday: false })
    const xp0 = Number((await sql('select xp from users where id = $1', [bia])).rows[0].xp)
    const r = await game.runAction(bia, { type: 'event_take', owner: 'ana' })
    expect(r.fx).toMatchObject({ xp: HALLOWEEN.bowl!.takeXp, item: 'doce_halloween', qty: 1 })
    expect(await qty(bia, 'doce_halloween')).toBe(1)
    expect(Number((await sql('select xp from users where id = $1', [bia])).rows[0].xp)).toBe(xp0 + HALLOWEEN.bowl!.takeXp)
    await expect(game.runAction(bia, { type: 'event_take', owner: 'ana' })).rejects.toThrow(/já pegou um doce de ana hoje/)
    const after = (await game.loadFarm(ana)).event!
    expect(after.bowl).toMatchObject({ candies: 9, look: 'cheia' })
    expect(after.bowl!.takers.map((t) => t.handle)).toEqual(['bia'])
    expect((await game.loadFarm(ana)).events.find((e) => e.kind === 'bowl_taken')).toMatchObject({ actor: 'bia' })
    // Quem não é amigo não pega; o dono não pega da própria tigela.
    const caio = await game.loginOrCreate('caio')
    await expect(game.runAction(caio, { type: 'event_take', owner: 'ana' })).rejects.toThrow(/Só amigos/)
    await expect(game.runAction(ana, { type: 'event_take', owner: 'ana' })).rejects.toThrow(/são para os amigos/)
  })

  it('tigela vazia: o dono pega o prêmio (fixo) e enche de novo com 1 pacote de doces', async () => {
    await force()
    await friends(ana, bia)
    await game.loadFarm(ana)
    await sql("update event_bowls set candies = 1 where owner_id = $1", [ana])
    await game.runAction(bia, { type: 'event_take', owner: 'ana' })
    let ev = (await game.loadFarm(ana)).event!
    expect(ev.bowl).toMatchObject({ candies: 0, look: 'vazia', prizeReady: true })
    await expect(game.runAction(ana, { type: 'event_fill' })).rejects.toThrow(/prêmio/)
    const gold0 = Number((await sql('select gold from users where id = $1', [ana])).rows[0].gold)
    const seeds0 = await qty(ana, 'semente:abobora_halloween') // o bônus do dia já dá 1 no evento (Evo-21)
    await game.runAction(ana, { type: 'event_prize' })
    expect(Number((await sql('select gold from users where id = $1', [ana])).rows[0].gold)).toBe(gold0 + HALLOWEEN.bowl!.prize.gold)
    expect(await qty(ana, 'semente:abobora_halloween')).toBe(seeds0 + 1)
    await expect(game.runAction(ana, { type: 'event_prize' })).rejects.toThrow(/já recebido/)
    await expect(game.runAction(ana, { type: 'event_fill' })).rejects.toThrow(/pacote de doces/)
    await sql('update users set gold = 10000 where id = $1', [ana])
    await game.runAction(ana, { type: 'buy', itemId: 'pacote_doces' })
    await game.runAction(ana, { type: 'event_fill' })
    ev = (await game.loadFarm(ana)).event!
    expect(ev.bowl).toMatchObject({ candies: 10, refills: 0 })
    await expect(game.runAction(ana, { type: 'event_fill' })).rejects.toThrow(/já está cheia/)
    expect(ev.missions.find((m) => m.kind === 'fill')!.progress).toBe(1)
  })

  it('limite diário de doces por jogador, somando todas as tigelas', async () => {
    await force()
    const cap = HALLOWEEN.bowl!.takerDaily
    for (let i = 0; i <= cap; i++) {
      const id = await game.loginOrCreate(`dono${i}`)
      await friends(id, bia)
      const take = game.runAction(bia, { type: 'event_take', owner: `dono${i}` })
      if (i < cap) await take
      else await expect(take).rejects.toThrow(/Limite de/)
    }
    expect(await qty(bia, 'doce_halloween')).toBe(cap)
  })

  it('a semente sai da loja antes do fim; quem já tem continua plantando; colher dá doces', async () => {
    await sql('update users set gold = 10000 where id = $1', [ana])
    await force()
    await game.runAction(ana, { type: 'buy', itemId: 'semente:abobora_halloween', qty: 2 })
    // Faltando menos que o tempo de crescer: a loja não vende mais.
    await force(seedLifeMs(SEED_BY_ID.abobora_halloween))
    const ev = (await game.loadFarm(ana)).event!
    expect(ev.seedsUntil).toBeLessThan(Date.now())
    await expect(game.runAction(ana, { type: 'buy', itemId: 'semente:abobora_halloween' })).rejects.toThrow(/época do evento/)
    // O pacote de doces (não é semente) continua à venda até o fim.
    await game.runAction(ana, { type: 'buy', itemId: 'pacote_doces' })
    // Evento acabou: a semente que ficou no depósito ainda planta e a colheita rende os doces.
    await events.saveOverride(db, { mode: 'off' })
    await game.runAction(ana, { type: 'plant', idx: 0, seedId: 'abobora_halloween' })
    await sql(`update plots set planted_at = now() - interval '2 hours', ready_at = now() - interval '1 minute' where owner_id = $1 and idx = 0`, [ana])
    const r = await game.runAction(ana, { type: 'harvest', idx: 0 })
    expect(r.message).toMatch(/Abóbora-de-halloween.*doces/)
    expect(await qty(ana, 'doce_halloween')).toBe(HALLOWEEN.harvestCandy)
  })

  it('troca de doces, missões em ordem e visitantes do dia', async () => {
    await force()
    await sql(`insert into inventory (user_id, item_id, qty) values ($1, 'doce_halloween', 25)`, [ana])
    await game.runAction(ana, { type: 'event_trade', trade: 'semente' })
    expect(await qty(ana, 'semente:abobora_halloween')).toBe(1)
    await game.runAction(ana, { type: 'event_trade', trade: 'enfeite' })
    expect((await sql("select qty from decor_owned where user_id = $1 and item_id = 'enfeite:bruxinha'", [ana])).rows).toHaveLength(1)
    await expect(game.runAction(ana, { type: 'event_trade', trade: 'enfeite' })).rejects.toThrow(/já tem essa peça/)
    expect(await qty(ana, 'doce_halloween')).toBe(25 - 2 - 12)
    await expect(game.runAction(ana, { type: 'event_trade', trade: 'casinha' })).rejects.toThrow(/Faltam doces/)
    // Missões: a 2ª (plantar) não resgata antes da 1ª (pegar doce).
    await game.runAction(ana, { type: 'plant', idx: 0, seedId: 'abobora_halloween' })
    await expect(game.runAction(ana, { type: 'event_claim', idx: 1 })).rejects.toThrow(/anterior/)
    await expect(game.runAction(ana, { type: 'event_claim', idx: 0 })).rejects.toThrow(/não concluída/)
    // Visitantes: 3 por dia, cada um dá ouro fixo.
    for (let i = 0; i < HALLOWEEN.critters!.perDay; i++) {
      expect((await game.runAction(ana, { type: 'event_shoo', n: i })).fx).toMatchObject({ gold: HALLOWEEN.critters!.gold })
    }
    await expect(game.runAction(ana, { type: 'event_shoo', n: 9 })).rejects.toThrow(/já foram embora/)
    const ev = (await game.loadFarm(ana)).event!
    expect(ev.critters!.left).toBe(0)
    expect(ev.missions.find((m) => m.kind === 'shoo')!.progress).toBe(3)
    expect(ev.missions.find((m) => m.kind === 'plant')!.progress).toBe(1)
  })

  it('série Bruxinha só vende na época, mas quem comprou continua usando', async () => {
    await sql('update users set gold = 100000, level = 10, xp = 1000000 where id = $1', [ana])
    await force()
    await game.runAction(ana, { type: 'decor_buy', itemId: 'casa:bruxinha' })
    await events.saveOverride(db, { mode: 'off' })
    await expect(game.runAction(ana, { type: 'decor_buy', itemId: 'cerca:bruxinha' })).rejects.toThrow(/época do evento/)
    await expect(game.runAction(ana, { type: 'decor_buy_set', series: 'bruxinha' })).rejects.toThrow(/época do evento/)
    await game.runAction(ana, { type: 'decor_equip', slot: 'casa', series: 'sitio' })
    await game.runAction(ana, { type: 'decor_equip', slot: 'casa', series: 'bruxinha' })
    expect((await game.loadFarm(ana)).decor.slots.casa).toBe('bruxinha')
  })
})
