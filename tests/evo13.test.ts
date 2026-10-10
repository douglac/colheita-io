// Evolução 13: motor de eventos e calendário. Os campos E1–E14 (cada um com a sua validação), o calendário
// dos 12 eventos sem sobreposição (inclusive nos anos de Páscoa mais cedo e mais tarde) e as mecânicas no servidor com
// 2 jogadores (um ajuda o outro): árvore de Natal, presentes trancados até o dia 25, boneco de neve, meias, envio,
// oficina da Páscoa e baú do Ano-Novo.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SEED_BY_ID, SHOP_BY_ID } from '../src/game/catalog'
import { ANO_NOVO, HALLOWEEN, NATAL, PASCOA } from '../src/game/event-content'
import type { EventDef } from '../src/game/event-types'
import {
  activeEvent, bowlSrc, buildSrc, EVENT_BY_ID, EVENT_DEFS, easter, eventClockShift, eventNight, friendItemFor, giftsUnlockAt, helpSrc,
  knownReward, missionChain, missionKey, overlaps, validateEvent, windowOfYear, zonedDate,
} from '../src/game/events'

process.env.PGLITE_DIR = 'memory://'
const { getDb } = await import('../src/server/db')
const game = await import('../src/server/game')
const events = await import('../src/server/events')

const db = await getDb()
const sql = (q: string, p: unknown[] = []) => db.query(q, p)
const H = 3600_000
const D = 24 * H

/** "AAAA-MM-DD" do primeiro e do último dia da janela, em Brasília. */
function days(def: EventDef, y: number): [string, string] {
  const w = windowOfYear(def, y)
  const f = (t: number) => { const z = zonedDate(t); return `${z.y}-${String(z.m).padStart(2, '0')}-${String(z.d).padStart(2, '0')}` }
  return [f(w.startsAt), f(w.endsAt - 1)]
}
const without = <K extends keyof EventDef>(def: EventDef, ...keys: K[]) => { const d = { ...def }; for (const k of keys) delete d[k]; return d }

describe('E1: calendário fixo, preso à Páscoa ou ao n-ésimo domingo', () => {
  it('janelas de 2026 de todos os eventos', () => {
    const want: Record<string, [string, string]> = {
      halloween: ['2026-10-20', '2026-11-05'], natal: ['2026-12-01', '2026-12-26'], ano_novo: ['2026-12-29', '2027-01-05'],
      carnaval: ['2026-02-06', '2026-02-18'], // Páscoa em 5/abr: da sexta uma semana antes até a Quarta-feira de Cinzas
      pascoa: ['2026-03-29', '2026-04-11'],
      maes: ['2026-05-04', '2026-05-11'], // 2º domingo de maio = 10/mai
      pais: ['2026-08-03', '2026-08-10'], // 2º domingo de agosto = 9/ago
      namorados: ['2026-06-05', '2026-06-12'], junina: ['2026-06-13', '2026-06-29'],
      folclore: ['2026-08-16', '2026-08-22'], independencia: ['2026-09-01', '2026-09-07'], criancas: ['2026-10-04', '2026-10-12'],
    }
    expect(Object.keys(want).sort()).toEqual(EVENT_DEFS.map((d) => d.id).sort())
    for (const def of EVENT_DEFS) expect(days(def, 2026), def.id).toEqual(want[def.id])
  })

  it('Páscoa (algoritmo de Gauss/Meeus): 2026, 2038 (a mais tarde, 25/abr) e 2285 (a mais cedo, 22/mar)', () => {
    expect(easter(2026)).toEqual({ m: 4, d: 5 })
    expect(easter(2038)).toEqual({ m: 4, d: 25 })
    expect(easter(2285)).toEqual({ m: 3, d: 22 })
    expect(days(PASCOA, 2038)).toEqual(['2038-04-18', '2038-05-01'])
    expect(days(PASCOA, 2285)).toEqual(['2285-03-15', '2285-03-28'])
  })
})

describe('E2: nenhum evento se sobrepõe a outro', () => {
  it('2026, 2027, 2038 (Páscoa em 25/abr encosta no Dia das Mães) e 2285 (Páscoa em 22/mar)', () => {
    for (const y of [2026, 2027, 2028, 2038, 2285]) expect(overlaps(EVENT_DEFS, y), String(y)).toEqual([])
  })

  it('acusa a sobreposição quando ela existe', () => {
    const late: EventDef = { ...PASCOA, id: 'teste', calendar: { rule: 'pascoa', from: 0, to: 14 } } // 25/abr → 9/mai de 2038
    expect(overlaps([...EVENT_DEFS, late], 2038).join(' ')).toMatch(/teste.*maes|maes.*teste/)
  })

  it('todo evento passa na validação em todos esses anos', () => {
    for (const def of EVENT_DEFS) for (const y of [2026, 2027, 2038, 2285]) expect(validateEvent(def, y), `${def.id} ${y}`).toEqual([])
  })
})

describe('campos E3–E14: cada um com a sua validação', () => {
  it('Dia das Bruxas intacto: nenhum campo novo', () => {
    for (const k of ['drops', 'help', 'gifts', 'advent', 'build', 'workshop', 'send', 'freeSeries', 'light', 'pets', 'items', 'needsArt'] as const) {
      expect(HALLOWEEN[k], k).toBeUndefined()
    }
    expect(HALLOWEEN.calendar).toEqual({ start: '10-20', end: '11-05' })
    expect(HALLOWEEN.art.bowl).toBeUndefined()
  })

  it('E3 material por colheita: cultura existente, quantidade positiva e evento com moeda', () => {
    expect(validateEvent({ ...PASCOA, drops: [{ seed: 'nao_existe', qty: 1 }] })).toContain('material da cultura nao_existe inválido')
    expect(validateEvent({ ...PASCOA, drops: [{ seed: 'tomate', qty: 0 }] })).toContain('material da cultura tomate inválido')
    expect(validateEvent({ ...PASCOA, currency: null, trades: [], send: [] }).join()).toMatch(/sem moeda/)
  })

  it('E4 ajuda de amigos: amigos e prazo; destravar por aberturas só com oficina', () => {
    expect(validateEvent({ ...NATAL, help: { ...NATAL.help!, friends: 0 } })).toContain('ajuda sem número de amigos ou prazo')
    expect(validateEvent({ ...NATAL, help: { ...NATAL.help!, unlockAt: 5 } })).toContain('ajuda destravada por aberturas num evento sem oficina')
    expect(validateEvent(without(NATAL, 'help')).join()).toMatch(/missão .*: o evento não tem help/)
  })

  it('E5 presentes: precisam da construção, de tipos e de abrir antes do fim', () => {
    expect(validateEvent({ ...without(NATAL, 'build'), missions: [] })).toContain('presentes pendurados precisam da construção (vagas por nível)')
    expect(validateEvent({ ...NATAL, gifts: { ...NATAL.gifts!, kinds: [] } })).toContain('presentes sem vaga ou sem tipo')
    expect(validateEvent({ ...NATAL, gifts: { ...NATAL.gifts!, unlock: '12-27' } })).toContain('os presentes abririam depois do fim do evento')
  })

  it('E6 calendário de presença: cabe no evento e os marcos ficam dentro dos dias', () => {
    expect(validateEvent({ ...NATAL, advent: { ...NATAL.advent!, days: 40 } })).toContain('calendário de presença maior que o evento')
    expect(validateEvent({ ...NATAL, advent: { ...NATAL.advent!, milestones: [[30, { gold: 1 }]] } })).toContain('marco do calendário fora dos dias')
  })

  it('E7 construção: material de amigo pedido por algum nível; o resto sai da troca; todo material tem nome', () => {
    const b = NATAL.build!
    expect(validateEvent({ ...NATAL, build: { ...b, friendItems: [...b.friendItems, 'pinha'] } })).toContain('material pinha que nenhum nível pede')
    expect(validateEvent({ ...NATAL, trades: NATAL.trades.filter((t) => t.item !== 'estrela') })).toContain('material estrela sem jeito de conseguir')
    expect(validateEvent({ ...NATAL, items: NATAL.items!.filter((i) => i.id !== 'vela') })).toContain('material vela sem nome (items)')
    expect(validateEvent({ ...NATAL, build: { ...b, perFriend: 0 } })).toContain('construção sem níveis ou sem material de amigo')
  })

  it('E8 oficina: 1ª receita aberta desde o começo, ingredientes conhecidos, peças válidas', () => {
    const w = PASCOA.workshop!
    expect(validateEvent({ ...PASCOA, workshop: { ...w, recipes: w.recipes.map((r, i) => (i ? r : { ...r, unlockAt: 1 })) } })).toContain('a 1ª receita da oficina tem de estar aberta desde o começo')
    expect(validateEvent({ ...PASCOA, workshop: { ...w, recipes: w.recipes.map((r, i) => (i ? r : { ...r, needs: [['pó_mágico', 1]] })) } })).toContain('receita ovo_nv1: ingrediente pó_mágico desconhecido')
    expect(validateEvent({ ...PASCOA, workshop: { ...w, pieces: [['ovo_nv9', 1, 'casa:pascoa']] } })).toContain('peça casa:pascoa da oficina inválida')
    expect(validateEvent({ ...PASCOA, missions: [{ ...PASCOA.missions[2], of: 'ovo_nv9' }] })).toContain(`missão ${PASCOA.missions[2].title}: receita ovo_nv9 desconhecida`)
  })

  it('E9 envio: popularidade não negativa, item que dá para conseguir e com nome', () => {
    expect(validateEvent({ ...ANO_NOVO, send: [{ id: 'cartao_ano_novo', name: 'x', charm: -1 }] })).toContain('envio cartao_ano_novo com popularidade negativa')
    expect(validateEvent({ ...ANO_NOVO, send: [{ id: 'buque', name: 'x', charm: 1 }] })).toEqual(['envio buque sem jeito de conseguir', 'envio buque sem nome (items)'])
  })

  it('E10 série grátis: precisa de série', () => {
    expect(validateEvent({ ...NATAL, series: [], freeSeries: true })).toContain('série grátis sem série')
  })

  it('E11 evento sem moeda: sem troca, sem tigela, sem doce por colheita', () => {
    expect(validateEvent({ ...HALLOWEEN, currency: null }).join()).toMatch(/evento sem moeda com troca, tigela ou doce por colheita/)
    for (const id of ['pais', 'folclore', 'independencia', 'criancas', 'namorados']) {
      const d = EVENT_BY_ID[id]
      expect(d.bowl, id).toBeNull()
      expect(d.missions.length, id).toBeGreaterThan(0)
    }
  })

  it('E12 missões: cada tipo precisa da mecânica; `of` só com cultura do evento; chave kind:of', () => {
    expect(validateEvent({ ...HALLOWEEN, missions: [{ kind: 'checkin', target: 1, title: 'M', text: '', reward: {} }] })).toContain('missão M: o evento não tem checkin')
    expect(validateEvent({ ...ANO_NOVO, missions: [{ kind: 'harvest', of: 'tomate', target: 1, title: 'M', text: '', reward: {} }] })).toContain('missão M: cultura tomate não é do evento')
    expect(validateEvent({ ...HALLOWEEN, missions: [{ ...HALLOWEEN.missions[0], target: 0 }] })).toContain(`missão ${HALLOWEEN.missions[0].title} sem alvo`)
    expect(missionKey({ kind: 'harvest', of: 'cravo' })).toBe('harvest:cravo')
    expect(missionKey({ kind: 'visit' })).toBe('visit')
    const chain = missionChain(PASCOA, (k) => (k === 'harvest:rabanete_verao' ? 3 : k === 'harvest' ? 99 : 0), () => false)
    expect(chain[0]).toMatchObject({ progress: 3, open: true })
    expect(chain[1]).toMatchObject({ progress: 0, open: false }) // conta só tomate-cereja, não qualquer colheita
  })

  it('E13 luz: noite o evento todo ou dia/noite às 7h00 e às 19h00 de Brasília', () => {
    expect(validateEvent({ ...HALLOWEEN, light: 'noite' })).toEqual([])
    expect(validateEvent({ ...HALLOWEEN, light: 'tarde' as never })).toContain('luz tarde desconhecida')
    expect(eventNight('noite', Date.parse('2026-10-25T15:00:00Z'))).toBe(true)
    expect(eventNight('dia-noite', Date.parse('2026-10-25T09:59:00Z'))).toBe(true) // 6h59 em Brasília
    expect(eventNight('dia-noite', Date.parse('2026-10-25T10:00:00Z'))).toBe(false) // 7h00
    expect(eventNight('dia-noite', Date.parse('2026-10-25T22:00:00Z'))).toBe(true) // 19h00
    expect(eventNight(undefined, Date.parse('2026-10-25T03:00:00Z'))).toBe(false)
  })

  it('E14 bicho: precisa vir de troca ou de prêmio', () => {
    expect(validateEvent({ ...NATAL, pets: [{ id: 'pinguim', name: 'Pinguim', emoji: '🐧', line: '' }] })).toContain('bicho pinguim sem jeito de ganhar')
    for (const def of EVENT_DEFS) for (const p of def.pets ?? []) expect(knownReward(def, `bicho:${p.id}`), p.id).toBe(true)
  })

  it('needsArt: registrado e válido, mas fora do calendário até a arte chegar (o atalho de QA ainda força)', () => {
    const today = Date.parse('2026-10-09T15:00:00Z') // Dia das Crianças pelo calendário (a arte chegou nos lotes T e U)
    expect(activeEvent(today)?.def.id).toBe('criancas')
    const semArte = EVENT_DEFS.map((d) => (d.id === 'criancas' ? { ...d, needsArt: true } : d))
    expect(activeEvent(today, null, semArte)).toBeNull()
    expect(activeEvent(today, { mode: 'on', eventId: 'criancas', startsAt: today - 1, endsAt: today + D }, semArte)?.def.id).toBe('criancas')
    expect(activeEvent(Date.parse('2026-12-10T15:00:00Z'))?.def.id).toBe('natal')
  })
})

describe('EVENT_NOW (QA): o calendário finge outra data, só fora de produção', () => {
  it('desloca o calendário e mantém a hora do relógio', () => {
    const now = Date.parse('2026-10-09T15:00:00Z')
    const shift = eventClockShift('2026-12-20', now)
    expect(shift).toBe(72 * D)
    const ev = activeEvent(now, null, EVENT_DEFS, shift)!
    expect(ev.def.id).toBe('natal')
    expect(ev.startsAt).toBe(Date.parse('2026-12-01T03:00:00Z') - shift)
    expect(giftsUnlockAt(ev)).toBe(Date.parse('2026-12-25T03:00:00Z') - shift) // 5 dias reais à frente
    expect(eventClockShift('20/12/2026', now)).toBe(0)
    expect(events.eventNowShift(now, { EVENT_NOW: '2026-12-20', NODE_ENV: 'development' })).toBe(shift)
    expect(events.eventNowShift(now, { EVENT_NOW: '2026-12-20', NODE_ENV: 'production' })).toBe(0)
  })
})

describe('conteúdo de cada evento', () => {
  it('troca, envio, missões e itens só com coisas conhecidas; sementes de evento só vendem na época', () => {
    for (const def of EVENT_DEFS) {
      for (const t of def.trades) if (t.kind === 'item') expect(knownReward(def, t.item), `${def.id} ${t.id}`).toBe(true)
      for (const s of def.seeds) if (!SEED_BY_ID[s].needsArt) expect(SHOP_BY_ID[`semente:${s}`]?.event, `${def.id} ${s}`).toBe(def.id)
      expect(def.missions.length, def.id).toBeGreaterThan(0)
      expect(def.art.dir, def.id).toBe(`/art/event/${def.id}`)
    }
  })

  it('arte: saco de confete (masculino), pipoqueira, árvore por nível e objeto de ajuda por estado', () => {
    expect(bowlSrc('/d', 'tigela', 'meia')).toBe('/d/tigela_meia.png')
    expect(bowlSrc('/d', 'saco', 'cheia')).toBe('/d/saco_cheio.png')
    expect(bowlSrc('/d', 'pipoqueira', 'vazia')).toBe('/d/pipoqueira_vazia.png')
    expect(buildSrc('/d', 'natal', 2)).toBe('/d/arvore_nivel_2.png')
    expect(buildSrc('/d', 'pascoa', 2)).toBeNull()
    expect(helpSrc('/d', 'boneco_neve', 0, 10, false)).toMatch(/boneco_monte/)
    expect(helpSrc('/d', 'boneco_neve', 10, 10, false)).toMatch(/boneco_pronto/)
    expect(helpSrc('/d', 'bau_flores', 5, 5, true)).toMatch(/bau_flores_aberto/)
    expect(helpSrc('/d', 'nada', 0, 1, false)).toBeNull()
  })

  it('material da árvore: cada jogador manda sempre o mesmo tipo', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    for (const id of ids) expect(friendItemFor(NATAL, id)).toBe(friendItemFor(NATAL, id))
    expect(new Set(ids.map((id) => friendItemFor(NATAL, id))).size).toBeGreaterThan(1)
    expect(friendItemFor(HALLOWEEN, 'a')).toBeNull()
  })
})

// ---------- servidor (2 jogadores) ----------

const force = (eventId: string, startedAgo = 60_000, endsIn = 10 * D) =>
  events.saveOverride(db, { mode: 'on', eventId, startsAt: Date.now() - startedAgo, endsAt: Date.now() + endsIn })
const qty = async (userId: string, item: string) => Number((await sql('select qty from inventory where user_id = $1 and item_id = $2', [userId, item])).rows[0]?.qty ?? 0)
const give = (userId: string, item: string, n: number) =>
  sql(`insert into inventory (user_id, item_id, qty) values ($1, $2, $3) on conflict (user_id, item_id) do update set qty = inventory.qty + $3`, [userId, item, n])
const friends = (a: string, b: string) => sql(`insert into friendships (user_id, friend_id, via) values ($1, $2, 'add'), ($2, $1, 'add') on conflict do nothing`, [a, b])
const gold = async (id: string) => Number((await sql('select gold from users where id = $1', [id])).rows[0].gold)
const run = (id: string, a: Record<string, unknown>) => game.runAction(id, a as never)
const mural = async (id: string) => (await game.loadFarm(id)).events.map((e) => e.kind)

let ana: string, bia: string
beforeAll(() => { vi.spyOn(Math, 'random').mockReturnValue(0.99) })
afterAll(() => vi.mocked(Math.random).mockRestore())
beforeEach(async () => {
  await game.resetDbForTests()
  ana = await game.loginOrCreate('ana')
  bia = await game.loginOrCreate('bia')
  await friends(ana, bia)
})

describe('Natal no servidor (bia ajuda a ana)', () => {
  it('árvore: material da amiga 1 por dia, aprimorar com tudo, presentes trancados até o Natal', async () => {
    await force('natal')
    const item = friendItemFor(NATAL, bia)!
    const r = await run(bia, { type: 'event_build_give', owner: 'ana' })
    expect(r.message).toMatch(/Você mandou 1 ×/)
    expect(await qty(ana, item)).toBe(1)
    await expect(run(bia, { type: 'event_build_give', owner: 'ana' })).rejects.toThrow(/já mandou material para ana hoje/)
    const caio = await game.loginOrCreate('caio')
    await expect(run(caio, { type: 'event_build_give', owner: 'ana' })).rejects.toThrow()
    // Sem a árvore, não dá para pendurar presente; sem material, não aprimora.
    await expect(run(bia, { type: 'event_gift_hang', owner: 'ana', kind: 'ursinho' })).rejects.toThrow(/ainda não montou/)
    await expect(run(ana, { type: 'event_build_up' })).rejects.toThrow(/Falta|Faltam/)
    for (const [it, n] of NATAL.build!.levels[0].needs) await give(ana, it, n - (it === item ? 1 : 0))
    const g0 = await gold(ana)
    await run(ana, { type: 'event_build_up' })
    expect(await gold(ana)).toBe(g0 + NATAL.build!.levels[0].prize.gold!)
    let ev = (await game.loadFarm(ana)).event!
    expect(ev.build).toMatchObject({ level: 1 })
    expect(ev.gifts).toMatchObject({ slots: NATAL.gifts!.perLevel, hung: 0, locked: true })
    expect(ev.missions.find((m) => m.kind === 'build')!.progress).toBe(1)
    // Presente: 1 por dia, abre só no dia 25.
    await run(bia, { type: 'event_gift_hang', owner: 'ana', kind: 'ursinho' })
    await expect(run(bia, { type: 'event_gift_hang', owner: 'ana', kind: 'almofada' })).rejects.toThrow(/já pendurou um presente para ana hoje/)
    await expect(run(bia, { type: 'event_gift_hang', owner: 'ana', kind: 'bomba' })).rejects.toThrow(/desconhecido/)
    await expect(run(ana, { type: 'event_gift_open' })).rejects.toThrow(/não pode abrir os presentes até o Natal/)
    expect(await mural(ana)).toEqual(expect.arrayContaining(['event_material', 'event_gift']))
    // Chegou o dia 25 (mesma temporada, janela deslocada): abre e conta na missão.
    await force('natal', 25 * D, D)
    ev = (await game.loadFarm(ana)).event!
    expect(ev.gifts).toMatchObject({ locked: false, unopened: 1 })
    const g1 = await gold(ana)
    expect((await run(ana, { type: 'event_gift_open' })).message).toMatch(/Ursinho de bia/)
    expect(await gold(ana)).toBe(g1 + NATAL.gifts!.prize.gold!)
    await expect(run(ana, { type: 'event_gift_open' })).rejects.toThrow(/Nenhum presente fechado/)
  })

  it('boneco de neve: 10 amigos diferentes no prazo, prêmio uma vez', async () => {
    await force('natal')
    await run(bia, { type: 'event_help', owner: 'ana' })
    await expect(run(bia, { type: 'event_help', owner: 'ana' })).rejects.toThrow(/já ajudou/)
    await expect(run(ana, { type: 'event_help_claim' })).rejects.toThrow(/ajuda de 10 amigos \(1\/10\)/)
    for (let i = 0; i < 9; i++) {
      const id = await game.loginOrCreate(`amigo${i}`)
      await friends(ana, id)
      await run(id, { type: 'event_help', owner: 'ana' })
    }
    const extra = await game.loginOrCreate('extra')
    await friends(ana, extra)
    await expect(run(extra, { type: 'event_help', owner: 'ana' })).rejects.toThrow(/já tem ajuda suficiente/)
    expect((await game.loadFarm(ana)).event!.help).toMatchObject({ helps: 10, ready: true })
    const g0 = await gold(ana)
    await run(ana, { type: 'event_help_claim' })
    expect(await gold(ana)).toBe(g0 + NATAL.help!.prize.gold!)
    expect((await game.loadFarm(bia)).event!.missions.find((m) => m.kind === 'help')!.progress).toBe(1)
    expect(await mural(ana)).toContain('event_help')
  })

  it('boneco de neve derrete: sem ajuda suficiente em 7 dias, recomeça do zero', async () => {
    await force('natal', 9 * D)
    await run(bia, { type: 'event_help', owner: 'ana' })
    await sql(`update event_objects set started_at = now() - interval '8 days' where owner_id = $1 and object = 'boneco_neve'`, [ana])
    expect((await game.loadFarm(ana)).event!.help).toMatchObject({ helps: 0 })
    await run(bia, { type: 'event_help', owner: 'ana' }) // novo ciclo: pode ajudar de novo
  })

  it('meias: 1 assinatura por dia, recupera dia perdido com ouro, prêmio no marco', async () => {
    await force('natal', 3 * D + H) // 4º dia: perdeu 3
    await sql('update users set gold = 5000 where id = $1', [ana])
    await run(ana, { type: 'event_checkin' })
    await expect(run(ana, { type: 'event_checkin' })).rejects.toThrow(/já assinou hoje/)
    const g0 = await gold(ana)
    await run(ana, { type: 'event_checkin_recover' })
    const r = await run(ana, { type: 'event_checkin_recover' }) // 3 assinaturas: marco das 3 meias
    expect(r.message).toMatch(/Prêmio das 3 meias/)
    expect(await gold(ana)).toBe(g0 - 2 * NATAL.advent!.recoverGold + NATAL.advent!.milestones[0][1].gold!)
    expect(await qty(ana, 'adubo_forte')).toBe(2)
    const ev = (await game.loadFarm(ana)).event!
    expect(ev.advent).toMatchObject({ signedToday: true, missed: [3] })
  })

  it('envio de presente: popularidade para quem recebe, Mural e missão de quem manda', async () => {
    await force('natal')
    await expect(run(bia, { type: 'event_send', to: 'ana', item: 'presente:sino_natal' })).rejects.toThrow(/não tem sino de natal/)
    await give(bia, 'enfeite_natal', 3)
    await run(bia, { type: 'event_trade', trade: 'sino' })
    const pop0 = Number((await sql('select popularity from users where id = $1', [ana])).rows[0].popularity)
    await run(bia, { type: 'event_send', to: 'ana', item: 'presente:sino_natal' })
    expect(Number((await sql('select popularity from users where id = $1', [ana])).rows[0].popularity)).toBe(pop0 + 12)
    expect(await qty(bia, 'presente:sino_natal')).toBe(0)
    expect(await mural(ana)).toContain('event_card')
    expect((await game.loadFarm(bia)).event!.missions.find((m) => m.kind === 'send')!.progress).toBe(1)
  })

  it('série de Natal grátis ao entrar (uma vez) e visita conta na missão', async () => {
    await force('natal')
    await game.loadFarm(ana)
    await game.loadFarm(ana)
    const owned = (await sql("select item_id, qty from decor_owned where user_id = $1 and item_id like '%:natal' order by item_id", [ana])).rows
    expect(owned.length).toBeGreaterThan(0)
    expect(owned.every((o) => Number(o.qty) === 1)).toBe(true)
    expect((await mural(ana)).filter((k) => k === 'event_free_series')).toHaveLength(1)
    await game.loadFarm(bia, 'ana')
    expect((await game.loadFarm(bia)).event!.missions.find((m) => m.kind === 'visit')!.progress).toBe(1)
  })

  it('fora do evento as ações recusam', async () => {
    await events.saveOverride(db, { mode: 'off' })
    await expect(run(bia, { type: 'event_build_give', owner: 'ana' })).rejects.toThrow(/Não há evento/)
    await force('halloween')
    await expect(run(bia, { type: 'event_build_give', owner: 'ana' })).rejects.toThrow(/não tem construção/)
    await expect(run(ana, { type: 'event_checkin' })).rejects.toThrow(/não tem calendário/)
  })
})

describe('Páscoa no servidor', () => {
  it('oficina: faz o ovo com ovo comum + corante, espera, pega, abre; peça de decoração no 3º sem sorte', async () => {
    await force('pascoa')
    await give(ana, 'ovo_comum', 3)
    await give(ana, 'corante', 3)
    for (let i = 1; i <= 3; i++) {
      await run(ana, { type: 'event_craft', recipe: 'ovo_nv1' })
      await expect(run(ana, { type: 'event_craft', recipe: 'ovo_nv1' })).rejects.toThrow(/já está fazendo/)
      await expect(run(ana, { type: 'event_craft_collect' })).rejects.toThrow(/Ainda não ficou pronto/)
      await sql(`update event_crafts set ready_at = now() - interval '1 second' where user_id = $1`, [ana])
      await run(ana, { type: 'event_craft_collect' })
      const r = await run(ana, { type: 'event_open_egg', recipe: 'ovo_nv1' })
      if (i === 3) expect(r.message).toMatch(/Você pode fazer .* agora/)
    }
    expect((await sql("select 1 from decor_owned where user_id = $1 and item_id = 'casinha:pascoa'", [ana])).rows).toHaveLength(1)
    await expect(run(ana, { type: 'event_craft', recipe: 'ovo_nv3' })).rejects.toThrow(/libera com 9 ovos/)
    const ev = (await game.loadFarm(ana)).event!
    expect(ev.workshop).toMatchObject({ opened: 3 })
    expect(ev.missions.find((m) => m.of === 'ovo_nv1')!.progress).toBe(3)
    // Ovo gigante só aparece com 21 ovos abertos.
    expect(ev.help).toMatchObject({ locked: true })
    await expect(run(bia, { type: 'event_help', owner: 'ana' })).rejects.toThrow(/ainda não apareceu/)
  })

  it('corante grátis: 1 por amiga por dia, vai para o depósito dela', async () => {
    await force('pascoa')
    await run(bia, { type: 'event_send', to: 'ana', item: 'corante' })
    expect(await qty(ana, 'corante')).toBe(1)
    expect(await qty(bia, 'corante')).toBe(0)
    await expect(run(bia, { type: 'event_send', to: 'ana', item: 'corante' })).rejects.toThrow(/já mandou corante para ana hoje/)
    // A janela já sabe (botão "Mandar" apagado para a ana).
    expect((await game.loadFarm(bia)).event!.send.find((s) => s.id === 'corante')!.sentToday).toEqual(['ana'])
  })

  it('material por colheita (E3): colher tomate dá corante e anda a missão certa', async () => {
    await force('pascoa')
    await give(ana, 'semente:tomate', 1)
    await sql('update users set level = 30 where id = $1', [ana])
    await run(ana, { type: 'plant', idx: 0, seedId: 'tomate' })
    await sql(`update plots set ready_at = now() - interval '1 minute' where owner_id = $1 and idx = 0`, [ana])
    await run(ana, { type: 'harvest', idx: 0 })
    expect(await qty(ana, 'corante')).toBe(1)
    const ms = (await game.loadFarm(ana)).event!.missions
    expect(ms.find((m) => m.of === 'rabanete_verao')!.progress).toBe(0)
  })
})

describe('Ano-Novo no servidor', () => {
  it('baú de flores: 5 amigas no dia, recomeça no dia seguinte; cartão dá popularidade', async () => {
    await force('ano_novo')
    const helpers = [bia]
    for (let i = 0; i < 4; i++) { const id = await game.loginOrCreate(`fam${i}`); await friends(ana, id); helpers.push(id) }
    for (const id of helpers) await run(id, { type: 'event_help', owner: 'ana' })
    await run(ana, { type: 'event_help_claim' })
    expect(await qty(ana, 'semente:lotus_chiba')).toBe(2)
    await expect(run(ana, { type: 'event_help_claim' })).rejects.toThrow(/já recebido/)
    expect((await game.loadFarm(ana)).event!.missions.find((m) => m.kind === 'help')!.progress).toBe(1)
    // Dia seguinte: baú fechado de novo.
    await force('ano_novo', D + 60_000)
    expect((await game.loadFarm(ana)).event!.help).toMatchObject({ helps: 0, claimed: false })
    // Cartão: troca 3 estrelinhas e manda.
    await give(bia, 'estrelinha', 3)
    await run(bia, { type: 'event_trade', trade: 'cartao' })
    await run(bia, { type: 'event_send', to: 'ana', item: 'cartao_ano_novo' })
    expect(await mural(ana)).toContain('event_card')
  })
})

describe('cada evento no servidor: abre, troca e anda a missão', () => {
  it.each(EVENT_DEFS.map((d) => [d.id, d] as const))('%s', async (_id, def) => {
    await force(def.id)
    const ev = (await game.loadFarm(ana)).event!
    expect(ev.id).toBe(def.id)
    expect(ev.missions).toHaveLength(def.missions.length)
    expect(ev.missions[0].open).toBe(true)
    const t = def.trades.find((x) => x.kind === 'item')
    if (t && def.currency) {
      const had = await qty(ana, t.item) // o bônus do dia pode já ter dado a semente do evento (Evo-21)
      await give(ana, def.currency.id, t.give)
      await run(ana, { type: 'event_trade', trade: t.id })
      if (!t.item.startsWith('bicho:')) expect(await qty(ana, t.item)).toBe(had + t.qty)
      expect(await qty(ana, def.currency.id)).toBe(0)
    }
    // Visita conta na missão "visit" de quem tem uma.
    await game.loadFarm(bia, 'ana')
    const visit = (await game.loadFarm(bia)).event!.missions.find((m) => m.kind === 'visit')
    if (visit) expect(visit.progress).toBe(1)
    // Pede ajuda: só onde há ajuda de amigo e ela já apareceu.
    if (def.help && !def.help.unlockAt) {
      await run(bia, { type: 'event_help', owner: 'ana' })
      expect((await game.loadFarm(ana)).event!.help!.helps).toBe(1)
    }
  })
})
