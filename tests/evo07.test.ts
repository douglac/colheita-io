// Evolução 07: level-up compartilhado ("Quem ver vai ganhar 100EXP") e acabamentos da frente S.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { itemIcon, SHOP, SHOP_BY_ID } from '../src/game/catalog'
import { SHARE_XP } from '../src/game/config'
import { ACCESSORIES, FEEDS } from '../src/game/livestock'
import { goBack } from '../src/game/away'
import { gameDay } from '../src/game/rules'

process.env.PGLITE_DIR = 'memory://'
const { getDb } = await import('../src/server/db')
const game = await import('../src/server/game')
const share = await import('../src/server/share-xp')
const db = await getDb()
const sql = (q: string, p: unknown[] = []) => db.query<Record<string, any>>(q, p)

const pub = (url: string) => existsSync(path.join(process.cwd(), 'public', url))
const codeOf = async (id: string) => (await sql('select invite_code from users where id = $1', [id])).rows[0].invite_code as string
const xpOf = async (id: string) => (await sql('select xp from users where id = $1', [id])).rows[0].xp as number
const setLevel = (id: string, level: number) => sql('update users set level = $2 where id = $1', [id, level])

describe('level-up compartilhado: quem abre o link ganha 100 EXP', () => {
  beforeEach(async () => { await game.resetDbForTests() })

  it('ganha 100 XP uma vez por link (quem compartilhou + nível), com evento para os dois', async () => {
    const ana = await game.loginOrCreate('ana')
    const bia = await game.loginOrCreate('bia')
    await setLevel(ana, 5)
    const code = await codeOf(ana)
    expect(SHARE_XP.xp).toBe(100)
    expect(await game.claimShareXp(bia, code, 5)).toEqual({ ok: true, xp: 100, level: 5, sharer: 'ana' })
    expect(await xpOf(bia)).toBe(100)
    expect(await game.claimShareXp(bia, code, 5)).toMatchObject({ ok: false, reason: 'done' })
    expect(await xpOf(bia)).toBe(100)
    // Outro nível da mesma pessoa é outro link.
    expect(await game.claimShareXp(bia, code, 4)).toMatchObject({ ok: true })
    const kinds = (await sql('select kind, user_id from events where kind like $1 order by id', ['share_%'])).rows
    expect(kinds.filter((k) => k.kind === 'share_xp' && k.user_id === bia)).toHaveLength(2)
    expect(kinds.filter((k) => k.kind === 'share_seen' && k.user_id === ana)).toHaveLength(2)
    expect(goBack({ kind: 'share_xp', actor: 'ana' })).toBe('return')
  })

  it('não vale: o próprio link, nível que a pessoa não alcançou, código inventado ou bot', async () => {
    const ana = await game.loginOrCreate('ana')
    const bia = await game.loginOrCreate('bia')
    await setLevel(ana, 3)
    const code = await codeOf(ana)
    expect(await game.claimShareXp(ana, code, 3)).toMatchObject({ ok: false, reason: 'self' })
    expect(await game.claimShareXp(bia, code, 4)).toMatchObject({ ok: false, reason: 'invalid' })
    expect(await game.claimShareXp(bia, code, 1)).toMatchObject({ ok: false, reason: 'invalid' })
    expect(await game.claimShareXp(bia, 'zzzz9999', 2)).toMatchObject({ ok: false, reason: 'invalid' })
    expect(await game.claimShareXp(bia, "x' or 1=1", 2)).toMatchObject({ ok: false, reason: 'invalid' })
    expect(await xpOf(bia)).toBe(0)
  })

  it(`limite por dia: cada um ganha de no máximo ${SHARE_XP.perViewerDay} links; cada link dá XP a no máximo ${SHARE_XP.perSharerDay} pessoas`, async () => {
    const viewer = await game.loginOrCreate('vera')
    const sharers: string[] = []
    for (let i = 0; i <= SHARE_XP.perViewerDay; i++) {
      const id = await game.loginOrCreate(`sharer${i}`)
      await setLevel(id, 2)
      sharers.push(await codeOf(id))
    }
    for (let i = 0; i < SHARE_XP.perViewerDay; i++) expect(await game.claimShareXp(viewer, sharers[i], 2)).toMatchObject({ ok: true })
    expect(await game.claimShareXp(viewer, sharers[SHARE_XP.perViewerDay], 2)).toMatchObject({ ok: false, reason: 'limit' })
    expect(await xpOf(viewer)).toBe(SHARE_XP.xp * SHARE_XP.perViewerDay)

    // Quem compartilhou já deu XP ao limite do dia: o próximo não ganha.
    const star = await game.loginOrCreate('estrela')
    await setLevel(star, 9)
    await sql("insert into daily_counters (user_id, day, kind, count) values ($1, $2, 'share_given', $3)",
      [star, gameDay(Date.now()), SHARE_XP.perSharerDay])
    const late = await game.loginOrCreate('atrasado')
    expect(await game.claimShareXp(late, await codeOf(star), 9)).toMatchObject({ ok: false, reason: 'sharer_limit' })
  })

  it('o XP do link pode subir o nível de quem abriu (e o level-up dele vira outro link)', async () => {
    const ana = await game.loginOrCreate('ana')
    const bia = await game.loginOrCreate('bia')
    await setLevel(ana, 2)
    await game.claimShareXp(bia, await codeOf(ana), 2)
    expect((await sql('select level from users where id = $1', [bia])).rows[0].level).toBe(2) // 100 XP ≥ 50 do nível 2
    expect((await sql("select 1 from events where user_id = $1 and kind = 'level_up'", [bia])).rows).toHaveLength(1)
  })

  it('cookie do link para quem ainda não tem conta: só aceita código e nível válidos', () => {
    expect(share.shareCookie('AbCd12', 7)).toBe('abcd12.7')
    expect(share.parseShareCookie('abcd12.7')).toEqual({ code: 'abcd12', level: 7 })
    expect(share.parseShareCookie('abcd12.1')).toBeNull()
    expect(share.parseShareCookie('ab.7')).toBeNull()
    expect(share.parseShareCookie(undefined)).toBeNull()
    expect(share.shareLevel('12')).toBe(12)
    expect(share.shareLevel(['3', '9'])).toBe(3)
    expect(share.shareLevel('2.5')).toBeNull()
    expect(share.shareLevel('abc')).toBeNull()
  })
})

describe('faixa de vizinhos: só amigos e os vizinhos do jogo', () => {
  beforeEach(async () => { await game.resetDbForTests() })

  it('estranhos não viram amigos; ficam no máximo 8 como sugestão', async () => {
    const me = await game.loginOrCreate('euzinho')
    for (let i = 0; i < 12; i++) await game.loginOrCreate(`estranho${i}`)
    await game.loginOrCreate('ana')
    await game.runAction(me, { type: 'add_friend', handle: 'ana' })
    const f = await game.loadFarm(me)
    const friends = f.neighbors.filter((n) => n.friend).map((n) => n.handle).sort()
    expect(friends).toEqual(['ana', 'dona_cida', 'seu_ze'])
    expect(f.neighbors.filter((n) => !n.friend).length).toBeLessThanOrEqual(8)
  })
})

describe('loja: ícones das rações e dos acessórios', () => {
  it('cada ração tem um ícone próprio (saco do lote W com o emblema de quem come)', () => {
    const icons = Object.keys(FEEDS).map((id) => SHOP_BY_ID[id].icon)
    expect(new Set(icons).size).toBe(icons.length)
    for (const id of Object.keys(FEEDS)) {
      expect(SHOP_BY_ID[id].icon).toMatch(/^items\/racao_/)
      expect(itemIcon(id).name).toBe(SHOP_BY_ID[id].icon)
      expect(pub(`/art/${SHOP_BY_ID[id].icon}.png`)).toBe(true)
    }
  })

  it('acessório usa a miniatura recortada (não o quadro inteiro do sprite, quase todo transparente)', () => {
    for (const a of ACCESSORIES) {
      expect(SHOP_BY_ID[`acc:${a.id}`].icon).toBe(`acc_${a.id}`)
      expect(itemIcon(`acc:${a.id}`).name).toBe(`acc_${a.id}`)
      expect(pub(`/art/ui/acc_${a.id}.png`)).toBe(true)
    }
  })

  it('flor diz o teto do bônus de venda', () => {
    for (const i of SHOP.filter((x) => x.tab === 'flores')) expect(i.desc).toMatch(/até \+50%/)
  })
})
