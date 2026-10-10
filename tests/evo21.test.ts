// Evo-21: o que a reauditoria de 9/out achou faltando.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { canFullscreen, toggleFullscreen } from '../src/components/fullscreen'
import { DAILY_SEEDS } from '../src/game/config'
import { activeEvent, bonusEventSeeds, EVENT_BY_ID } from '../src/game/events'
import { dailySeed } from '../src/game/rules'

process.env.PGLITE_DIR = 'memory://'
const { getDb } = await import('../src/server/db')
const game = await import('../src/server/game')
const events = await import('../src/server/events')
const db = await getDb()

const H = 3600_000
const HALLOWEEN = EVENT_BY_ID.halloween

describe('bônus diário: semente do evento em curso', () => {
  it('sem evento, a semente sai da lista comum; com evento, sai das sementes do evento', () => {
    const day = '2026-10-25'
    expect(DAILY_SEEDS).toContain(dailySeed(day, 1) as (typeof DAILY_SEEDS)[number])
    expect(dailySeed(day, 1, ['abobora_halloween'])).toBe('abobora_halloween')
  })

  it('semente do evento acima do nível do jogador não vale; cai na lista comum', () => {
    expect(DAILY_SEEDS).toContain(dailySeed('2026-10-25', 1, ['semente_que_nao_existe']) as (typeof DAILY_SEEDS)[number])
  })

  it('trava do Bis Limão: depois de a loja parar de vender a semente do evento, o bônus também para', () => {
    const now = Date.now()
    const ev = activeEvent(now, { mode: 'on', eventId: 'halloween', startsAt: now - 1000, endsAt: now + 10 * 24 * H })!
    expect(bonusEventSeeds(ev, now)).toEqual(HALLOWEEN.seeds)
    expect(bonusEventSeeds(ev, ev.seedsUntil)).toEqual([])
    expect(bonusEventSeeds(null, now)).toEqual([])
  })
})

describe('bônus diário no servidor', () => {
  beforeAll(() => { vi.spyOn(Math, 'random').mockReturnValue(0.99) })
  afterAll(() => vi.mocked(Math.random).mockRestore())
  beforeEach(async () => { await game.resetDbForTests() })

  it('com o Dia das Bruxas em curso, o 1º acesso do dia dá a semente do evento e diz qual evento', async () => {
    await events.saveOverride(db, { mode: 'on', eventId: 'halloween', startsAt: Date.now() - 60_000, endsAt: Date.now() + 10 * 24 * H })
    const ana = await game.loginOrCreate('ana')
    const f = await game.loadFarm(ana)
    expect(f.dailyBonus).toMatchObject({ seedId: 'abobora_halloween', event: HALLOWEEN.name })
    expect(f.inventory).toContainEqual({ itemId: 'semente:abobora_halloween', qty: 1 })
    await events.saveOverride(db, { mode: 'off' })
  })

  it('evento perto do fim (semente não amadurece mais): bônus volta à semente comum', async () => {
    await events.saveOverride(db, { mode: 'on', eventId: 'halloween', startsAt: Date.now() - 60_000, endsAt: Date.now() + H })
    const bia = await game.loginOrCreate('bia')
    const b = (await game.loadFarm(bia)).dailyBonus!
    expect(DAILY_SEEDS).toContain(b.seedId as (typeof DAILY_SEEDS)[number])
    expect(b.event).toBeUndefined()
    await events.saveOverride(db, { mode: 'off' })
  })
})

describe('tela cheia (botão do canto)', () => {
  const fakeDoc = (enabled = true) => {
    const doc = {
      fullscreenEnabled: enabled,
      fullscreenElement: null as Element | null,
      exitFullscreen: vi.fn(async () => { doc.fullscreenElement = null }),
      documentElement: { requestFullscreen: vi.fn(async () => { doc.fullscreenElement = {} as Element }) },
    }
    return doc
  }

  it('só aparece onde o navegador deixa (iPhone não deixa)', () => {
    expect(canFullscreen(fakeDoc())).toBe(true)
    expect(canFullscreen(fakeDoc(false))).toBe(false)
    expect(canFullscreen(undefined)).toBe(false)
    expect(canFullscreen({ ...fakeDoc(), documentElement: {} as never })).toBe(false)
  })

  it('alterna: entra e sai; recusa do navegador não quebra', async () => {
    const doc = fakeDoc()
    expect(await toggleFullscreen(doc)).toBe(true)
    expect(doc.documentElement.requestFullscreen).toHaveBeenCalledOnce()
    expect(await toggleFullscreen(doc)).toBe(false)
    expect(doc.exitFullscreen).toHaveBeenCalledOnce()
    doc.documentElement.requestFullscreen.mockRejectedValueOnce(new Error('negado'))
    expect(await toggleFullscreen(doc)).toBe(false)
  })
})
