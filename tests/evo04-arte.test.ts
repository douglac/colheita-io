// Evolução 04: ligação da arte do lote Q (A1–A9, public/art/MANIFEST.md) no código.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { AVATARS, avatarOf, avatarSrc, isAvatar } from '../src/game/avatar'
import { itemIcon, SEED_BY_ID, SHOP_BY_ID } from '../src/game/catalog'
import { origGold } from '../src/game/config'
import { LIVESTOCK } from '../src/game/livestock'
import { dropCheck, HERD_KINDS } from '../src/game/pasture'
import { TOOLS, toolCursor } from '../src/game/tools'
import { ANIMAL_AREAS, PROPS, propTexture } from '../src/scene/layout'

process.env.PGLITE_DIR = 'memory://'
const { getDb } = await import('../src/server/db')
const game = await import('../src/server/game')
const auth = await import('../src/server/auth')
const db = await getDb()
const sql = (q: string, p: unknown[] = []) => db.query<Record<string, any>>(q, p)

const pub = (url: string) => existsSync(path.join(process.cwd(), 'public', url))
const NEW_CROPS = ['abacaxi', 'pitaya', 'bromelia', 'tulipa', 'flor_trompete', 'peonia', 'lirios', 'orquidea_real', 'dalia_dourada']

describe('A1: adereço cheio quando o bicho dele está pronto', () => {
  it('ninho, balde e cesto trocam para a variante cheia só com o bicho certo pronto', () => {
    const by = Object.fromEntries(PROPS.map((p) => [p.key, p]))
    expect(propTexture(by.nest, [])).toBe('nest')
    expect(propTexture(by.nest, ['chicken2'])).toBe('nest_full') // qualquer galinha
    expect(propTexture(by.milk_bucket, ['chicken', 'sheep'])).toBe('milk_bucket')
    expect(propTexture(by.milk_bucket, ['cow'])).toBe('milk_bucket_full')
    expect(propTexture(by.wool_basket, ['sheep'])).toBe('wool_basket_full')
    for (const p of PROPS) expect(pub(`/art/scene/${p.key}_full.png`)).toBe(true)
  })
})

describe('A2: colmeia', () => {
  it('abelhas com arte, à venda na aba Animais, no rebanho e com os 3 quadros', () => {
    expect(LIVESTOCK.bee.art).toBe(true)
    expect(SHOP_BY_ID['bicho:bee']).toMatchObject({ tab: 'animais', gold: origGold(28000), icon: 'anim:bee' }) // Abelha: 28 verdes × 1.000
    expect(HERD_KINDS).toContain('bee')
    for (let i = 0; i < 3; i++) expect(pub(`/art/animals/bee_idle_${i}.png`)).toBe(true)
  })

  it('o lugar padrão da colmeia é chão livre (não anda: área de um ponto)', () => {
    const a = ANIMAL_AREAS.bee
    expect(a.x0).toBe(a.x1)
    expect(dropCheck('bee', a.x0, a.y0)).toEqual({ ok: true })
  })
})

describe('A3–A5: culturas e flores novas', () => {
  it('as 9 saem do needsArt, com 6 estágios + murcho e ícone de produto', () => {
    for (const id of NEW_CROPS) {
      const s = SEED_BY_ID[id]
      expect(s, id).toBeTruthy()
      expect(s.needsArt).toBeUndefined()
      for (let i = 0; i <= 5; i++) expect(pub(`/art/crops1/${id}_${i}.png`), `${id}_${i}`).toBe(true)
      expect(pub(`/art/crops1/${id}_withered.png`)).toBe(true)
      expect(itemIcon(id).name).toBe(`produto_${id}`)
      expect(pub(`/art/ui/produto_${id}.png`)).toBe(true)
      expect(SHOP_BY_ID[`semente:${id}`]).toBeTruthy()
    }
  })

  it('números da tabela: bromélia com 8 safras; abacaxi 5.200 e pitaya 6.180 na loja', () => {
    expect(SEED_BY_ID.bromelia.seasons).toBe(8)
    expect(SEED_BY_ID.abacaxi.cost).toBe(origGold(5200))
    expect(SEED_BY_ID.pitaya.cost).toBe(origGold(6180))
  })

  it('flores na aba Flores (não vendem, rendem 1); a especial dá 27 de popularidade por 19.999', () => {
    for (const id of ['tulipa', 'flor_trompete', 'peonia', 'lirios', 'orquidea_real', 'dalia_dourada']) {
      expect(SEED_BY_ID[id]).toMatchObject({ flower: true, sellPrice: 0, yieldMin: 1, yieldMax: 1 })
      expect(SHOP_BY_ID[`semente:${id}`].tab).toBe('flores')
      expect(itemIcon(`flor:${id}`).name).toBe(`produto_${id}`)
    }
    // Evolução 06: os números "19.999 → 27" são da Rosa Vermelha; a orquídea ficou com os do Narciso.
    expect(SEED_BY_ID.rosa_vermelha).toMatchObject({ charm: 27, cost: origGold(19999) })
    expect(SEED_BY_ID.orquidea_real).toMatchObject({ charm: 14, cost: origGold(14800) })
    // As de ouro (Crisântemo, Narciso) dão menos popularidade que as de verdes (Flor de Pêssego: 62), como na tabela.
    expect(SEED_BY_ID.dalia_dourada.charm!).toBeLessThan(SEED_BY_ID.cerejeira_florida.charm!)
  })
})

describe('A7: Fertilizante do Amor com ícone e cursor próprios', () => {
  it('usa tool_love (ícone da HUD e cursor normal/apertado)', () => {
    expect(TOOLS.love.icon).toBe('tool_love')
    expect(toolCursor({ id: 'love' }, true)).toContain('/art/cursor/tool_love.png')
    expect(toolCursor({ id: 'love' }, true, true)).toContain('/art/cursor/tool_love_down.png')
    for (const f of ['ui/tool_love', 'cursor/tool_love', 'cursor/tool_love_down', 'ui/sound', 'ui/help_book', 'ui/community', 'ui/assistant']) {
      expect(pub(`/art/${f}.png`), f).toBe(true)
    }
    expect(pub('/art/ui/loading_farm.jpg')).toBe(true) // A8 (derivado leve do PNG)
  })
})

describe('A9: avatares', () => {
  beforeEach(async () => { await game.resetDbForTests() })

  it('8 rostos; sem escolha, um fixo pelo apelido', () => {
    expect(AVATARS).toHaveLength(8)
    for (const a of AVATARS) expect(pub(avatarSrc(a))).toBe(true)
    expect(isAvatar('09')).toBe(false)
    expect(avatarOf(null, 'ana')).toBe(avatarOf(undefined, 'ana'))
    expect(avatarOf('03', 'ana')).toBe('03')
    expect(avatarOf('lixo', 'ana')).toBe(avatarOf(null, 'ana'))
  })

  it('coluna avatar (migração idempotente), escolha no primeiro acesso e na conta; aparece na HUD e nos vizinhos', async () => {
    const col = await sql("select 1 from information_schema.columns where table_name = 'users' and column_name = 'avatar'")
    expect(col.rows).toHaveLength(1)

    const { code } = await auth.requestToken({ email: 'ana@example.com', purpose: 'login', ip: '10.9.9.9', baseUrl: 'http://localhost:3100' })
    const t = await auth.verifyCode({ email: 'ana@example.com', code, purpose: 'login' })
    const { signup } = (await auth.loginWithEmail(t.email)) as { signup: string }
    const id = await auth.completeSignup(signup, { handle: 'ana', birthDate: '1990-05-10', acceptTerms: true, avatar: '05' })
    expect((await sql('select avatar from users where id = $1', [id])).rows[0].avatar).toBe('05')
    expect((await game.loadFarm(id)).me.avatar).toBe('05')
    await expect(sql("update users set avatar = '99' where id = $1", [id])).rejects.toThrow() // o banco só aceita 01–08

    await expect(game.setAvatar(id, '42')).rejects.toThrow(/rostos/)
    await game.setAvatar(id, '07')
    const bia = await game.loginOrCreate('bia')
    await game.runAction(bia, { type: 'add_friend', handle: 'ana' })
    const f = await game.loadFarm(bia)
    expect(f.neighbors.find((n) => n.handle === 'ana')?.avatar).toBe('07')
    expect(f.me.avatar).toBe(avatarOf(null, 'bia'))
    expect((await game.loadFarm(bia, 'ana')).owner.avatar).toBe('07')
  })
})
