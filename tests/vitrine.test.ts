// Vitrine pública da página inicial: iniciais, token opaco, quem entra no ranking, contador e a API sem dados pessoais.
import { Container, EventBoundary, FederatedPointerEvent, Rectangle } from 'pixi.js'
import 'pixi.js/events' // no Node o Pixi não liga sozinho o sistema de eventos (eventMode, on('pointertap'))
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { lockObjects } from '../src/scene/FarmScene'

process.env.PGLITE_DIR = 'memory://'
const { getDb } = await import('../src/server/db')
const game = await import('../src/server/game')
const v = await import('../src/server/vitrine')
const { GET: listRoute } = await import('../src/app/api/vitrine/route')
const { GET: farmRoute } = await import('../src/app/api/vitrine/fazenda/[token]/route')

const db = await getDb()
const sql = (q: string, p: unknown[] = []) => db.query(q, p)
const KEY = 'chave-de-teste'
const DAY = 86_400_000

describe('iniciais', () => {
  it.each([
    ['Maria Clara', 'M.C.'],
    ['maria_clara', 'M.C.'],
    ['maria_clara_souza', 'M.C.'], // no máximo 2
    ['joao123', 'J.'],
    ['j0ao', 'J.'], // dígito no meio não vira palavra nova
    ['123abc', 'A.'],
    ['Ágata Ñandu', 'A.N.'], // sem acento
    ['élida', 'E.'],
    ['ça', 'C.'],
    ['a', 'A.'], // 1 letra
    ['  ana   bia  ', 'A.B.'], // espaços sobrando
    ['🌻 bia', 'B.'], // emoji não conta
    ['🌻🐔', '?'],
    ['12345', '?'],
    ['', '?'],
  ])('%j → %s', (name, want) => {
    expect(v.initials(name)).toBe(want)
  })

  it('nunca devolve mais que 2 letras nem o apelido', () => {
    for (const h of ['fazendeiro_do_vale_verde', 'zezinho', 'ana_b_c_d']) {
      const i = v.initials(h)
      expect(i.replace(/\./g, '').length).toBeLessThanOrEqual(2)
      expect(h.toUpperCase()).not.toBe(i)
    }
  })
})

describe('token opaco', () => {
  const now = Date.UTC(2026, 9, 9, 15)
  const ids = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']

  it('válido: resolve para o dono, sem conter o id', () => {
    const t = v.vitrineToken(ids[1], now, KEY)
    expect(t).not.toContain(ids[1])
    expect(t).not.toContain('2222')
    expect(v.tokenOwner(t, ids, now, KEY)).toBe(ids[1])
    expect(v.vitrineToken(ids[1], now + DAY, KEY)).not.toBe(t) // muda todo dia
  })

  it('vale no dia seguinte; dois dias depois venceu', () => {
    const t = v.vitrineToken(ids[0], now, KEY)
    expect(v.tokenOwner(t, ids, now + DAY, KEY)).toBe(ids[0])
    expect(v.tokenOwner(t, ids, now + 2 * DAY, KEY)).toBeNull()
    expect(v.tokenOwner(t, ids, now - DAY, KEY)).toBeNull() // do futuro também não
  })

  it('adulterado, com outra chave, malformado ou de quem saiu do ranking → null', () => {
    const t = v.vitrineToken(ids[0], now, KEY)
    const last = t.at(-1) === 'A' ? 'B' : 'A'
    expect(v.tokenOwner(t.slice(0, -1) + last, ids, now, KEY)).toBeNull()
    const [day, mac] = t.split('.')
    expect(v.tokenOwner(`${(parseInt(day, 36) - 1).toString(36)}.${mac}`, ids, now, KEY)).toBeNull() // trocou o dia
    expect(v.tokenOwner(t, ids, now, 'outra-chave')).toBeNull()
    expect(v.tokenOwner(ids[0], ids, now, KEY)).toBeNull()
    expect(v.tokenOwner('', ids, now, KEY)).toBeNull()
    expect(v.tokenOwner(`${t}x`, ids, now, KEY)).toBeNull()
    expect(v.tokenOwner(t, [ids[1]], now, KEY)).toBeNull()
  })
})

describe('contador', () => {
  it('abaixo do mínimo não mostra número', () => {
    expect(v.onlineShown(0)).toBeNull()
    expect(v.onlineShown(2)).toBeNull()
    expect(v.onlineShown(v.VITRINE.onlineMin)).toBe(v.VITRINE.onlineMin)
    expect(v.onlineShown(23)).toBe(23)
    expect(v.onlineLabel(null)).toBe('Fazendas abertas agora')
    expect(v.onlineLabel(1234)).toBe('1.234 pessoas plantando agora')
  })
})

/** Jogador "de verdade" (com e-mail, adulto), com nível/ouro/popularidade dados. */
async function player(handle: string, f: { level?: number; gold?: number; popularity?: number; email?: boolean; age?: string | null } = {}) {
  const id = await game.loginOrCreate(handle)
  await sql(`update users set level = $2, xp = $2 * 100, gold = $3, popularity = $4, email = $5, age_band = $6 where id = $1`,
    [id, f.level ?? 5, f.gold ?? 100, f.popularity ?? 0, f.email === false ? null : `${handle}@example.com`, f.age === undefined ? '18p' : f.age])
  return id
}

describe('ranking e contador no banco', () => {
  beforeEach(async () => {
    await game.resetDbForTests()
    v.resetVitrineCache()
  })

  it('fora do ranking: bot, conta de teste (sem e-mail), menor de idade e quem desligou', async () => {
    await player('real_um', { level: 9 })
    await player('real_dois', { level: 3, age: null }) // conta antiga sem faixa registrada: entra
    await player('sem_email', { level: 20, email: false })
    await player('menor', { level: 30, age: '13_15' })
    const off = await player('saiu', { level: 40 })
    await v.setPublicRanking(off, false)
    await player('robo', { level: 50 })
    await sql("update users set is_bot = true where handle = 'robo'")

    const names = async (includeTest: boolean) => (await v.rankBoard(db, 'nivel', { includeTest })).map((r) => r.handle)
    expect(await names(false)).toEqual(['real_um', 'real_dois'])
    // Só em desenvolvimento (VITRINE_TEST_ACCOUNTS=1): as contas de teste entram, o resto continua de fora.
    expect(await names(true)).toEqual(['sem_email', 'real_um', 'real_dois'])
    expect(v.includeTestAccounts({ NODE_ENV: 'production', VITRINE_TEST_ACCOUNTS: '1' })).toBe(false)
    expect(v.includeTestAccounts({ NODE_ENV: 'development', VITRINE_TEST_ACCOUNTS: '1' })).toBe(true)
    expect(v.includeTestAccounts({ NODE_ENV: 'development' })).toBe(false)
  })

  it('moedas e popularidade: ordem pela categoria, sem quem tem zero', async () => {
    await player('rico', { gold: 9000, popularity: 0 })
    await player('querido', { gold: 10, popularity: 12 })
    expect((await v.rankBoard(db, 'moedas')).map((r) => [r.handle, r.value])).toEqual([['rico', 9000], ['querido', 10]])
    expect((await v.rankBoard(db, 'popularidade')).map((r) => [r.handle, r.value])).toEqual([['querido', 12]])
  })

  it('contador: só gente de verdade vista nos últimos 5 minutos', async () => {
    for (const h of ['on_um', 'on_dois', 'on_tres']) await player(h)
    await player('sumiu')
    await sql("update users set last_seen_at = now() - interval '6 minutes' where handle = 'sumiu'")
    await player('teste_on', { email: false })
    await player('bot_on')
    await sql("update users set is_bot = true where handle = 'bot_on'")
    expect(await v.countOnline(db, false)).toBe(3)
    expect(await v.countOnline(db, true)).toBe(4)
    await sql("update users set last_seen_at = now() - interval '1 hour' where handle = 'on_tres'")
    expect(await v.countOnline(db, false)).toBe(2)
    expect(v.onlineShown(await v.countOnline(db, false))).toBeNull()
  })
})

describe('API pública', () => {
  const req = (path: string) => new Request(`http://local${path}`, { headers: { 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}` } })
  const farm = (token: string) => farmRoute(req(`/api/vitrine/fazenda/${token}`), { params: Promise.resolve({ token }) })

  beforeEach(async () => {
    await game.resetDbForTests()
    v.resetVitrineCache()
  })

  it('a lista e a prévia não trazem id, apelido, e-mail, convite nem ouro de fora da categoria', async () => {
    const id = await player('mariaclara77', { level: 12, gold: 4321, popularity: 7 })
    await game.loadFarm(id) // gera o código de convite, os bichos e o registro
    await game.runAction(id, { type: 'plant', idx: 0, seedId: 'nabo' })
    const me = (await sql('select * from users where id = $1', [id])).rows[0] as Record<string, string | number>
    const friend = await player('amigo_secreto', { level: 2 })
    await sql('insert into friendships (user_id, friend_id) values ($1, $2), ($2, $1)', [id, friend])

    const res = await listRoute(req('/api/vitrine'))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toMatch(/s-maxage=60/)
    const list = await res.json()
    const text = JSON.stringify(list)
    for (const secret of ['mariaclara77', 'amigo_secreto', id, friend, me.email, me.invite_code].map(String)) expect(text).not.toContain(secret)
    expect(text).not.toMatch(/"(id|handle|email|invite|inviteCode|created_at|last_seen_at)"/)
    const row = list.boards.nivel[0]
    expect(row).toMatchObject({ pos: 1, initials: 'M.', level: Number(me.level) }) // o nível sai do XP no loadFarm
    expect(Object.keys(row).sort()).toEqual(['avatar', 'initials', 'level', 'pos', 'token', 'value'])
    expect(list.online).toBeNull() // 2 pessoas: abaixo do mínimo

    const peek = await farm(row.token)
    expect(peek.status).toBe(200)
    const body = await peek.json()
    const ptext = JSON.stringify(body)
    for (const secret of ['mariaclara77', 'amigo_secreto', id, friend, me.email, me.invite_code, me.gold].map(String)) expect(ptext).not.toContain(secret)
    expect(ptext).not.toMatch(/"(handle|email|gold|events|neighbors|inventory|canSteal|patrol|owner|me|friends)"/)
    expect(body.initials).toBe('M.')
    expect(body.farm.plots[0]).toMatchObject({ idx: 0, state: 'growing', seedId: 'nabo' })
    // Os enfeites (se houver) saem renumerados: nada do id do banco.
    expect(Object.keys(body.farm).sort()).toEqual(['animals', 'decor', 'dog', 'herd', 'looks', 'plots'])
  })

  it('a prévia só traz o estágio do desenho: sem progresso, horários nem datas', async () => {
    const id = await player('carla_dias', { level: 6 })
    await game.loadFarm(id)
    await game.runAction(id, { type: 'plant', idx: 0, seedId: 'nabo' })
    await game.runAction(id, { type: 'plant', idx: 1, seedId: 'nabo' })
    await sql("update plots set planted_at = now() - interval '1 minute' where owner_id = $1 and idx = 1", [id])
    const list = await (await listRoute(req('/api/vitrine'))).json()
    const body = await (await farm(list.boards.nivel[0].token)).json()
    const PLOT_KEYS = ['idx', 'state', 'seedId', 'stage', 'pests', 'weeds', 'dry']
    for (const p of body.farm.plots) for (const k of Object.keys(p)) expect(PLOT_KEYS).toContain(k)
    expect(body.farm.plots[0]).toMatchObject({ state: 'growing', stage: expect.any(Number) })
    // Nenhum campo de tempo, em lugar nenhum do corpo: nem nome (plantedAt, readyAt, progress…) nem valor
    // (data ISO, milissegundos ou segundos de época).
    const walk = (v: unknown, path: string): void => {
      if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`))
      if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) {
          expect(k, path).not.toMatch(/at$|time|date|progress|planted|ready_?at|harvest|until|since|clock|ms$/i)
          walk(x, `${path}.${k}`)
        }
        return
      }
      if (typeof v === 'number') expect(Math.abs(v), path).toBeLessThan(1e8)
      if (typeof v === 'string') expect(v, path).not.toMatch(/^\d{4}-\d\d-\d\d|^\d{9,}$/)
    }
    walk(body, 'body')
  })

  it('token adulterado, inventado ou de quem desligou → 404', async () => {
    const id = await player('bia_lima', { level: 8 })
    const list = await (await listRoute(req('/api/vitrine'))).json()
    const token: string = list.boards.nivel[0].token
    const bad = token.slice(0, -1) + (token.at(-1) === 'A' ? 'B' : 'A')
    expect((await farm(bad)).status).toBe(404)
    expect((await farm(id)).status).toBe(404) // o id não serve de token
    expect((await farm('bia_lima')).status).toBe(404)
    expect((await farm(token)).status).toBe(200)
    await v.setPublicRanking(id, false)
    expect((await farm(token)).status).toBe(404)
  })

  // Tela cheia /espiar/[token] (Evo-28): a rota renderiza a cena em modo vitrine e a HUD mínima, sem apelido.
  const espiar = async (token: string) => {
    const { default: Espiar } = await import('../src/app/espiar/[token]/page')
    const { renderToStaticMarkup } = await import('react-dom/server')
    return renderToStaticMarkup(await Espiar({ params: Promise.resolve({ token }), searchParams: Promise.resolve({}) }))
  }

  it('tela cheia: renderiza com o token, cena em modo vitrine e HUD mínima, sem apelido nem id', async () => {
    const id = await player('mariaclara77', { level: 12 })
    await game.loadFarm(id)
    await game.runAction(id, { type: 'plant', idx: 0, seedId: 'nabo' })
    const me = (await sql('select * from users where id = $1', [id])).rows[0] as Record<string, string | number>
    const row = (await (await listRoute(req('/api/vitrine'))).json()).boards.nivel[0]
    const html = await espiar(row.token)
    for (const secret of ['mariaclara77', id, me.email, me.invite_code].map(String)) expect(html).not.toContain(secret)
    expect(html).toContain('Fazenda de M.')
    expect(html).toContain(`Nível ${me.level}`)
    expect(html).toContain('data-vitrine="on"') // SceneView vitrine → FarmScene.objectInput = false → lockObjects
    expect(html).toContain('aria-label="Fechar e voltar"')
    expect(html).toContain('Abrindo a porteira…')
    expect(html).toContain('🌱 Entrar e plantar a sua')
    // Nada da HUD do dono nem rodapé legal.
    for (const no of ['data-testid="gold"', 'class="toolbar', 'class="tabbar', 'Termos', 'Privacidade']) expect(html).not.toContain(no)
  })

  it('tela cheia: token vencido, adulterado ou apelido → "saiu da vitrine", sem cena', async () => {
    await player('bia_lima', { level: 8 })
    for (const t of ['bia_lima', 'abc.def', '']) {
      const html = await espiar(t)
      expect(html).toContain('Essa fazenda saiu da vitrine.')
      expect(html).toContain('Voltar para o início')
      expect(html).not.toContain('data-testid="scene"')
      expect(html).not.toContain('Fazenda de')
    }
  })

  it('tela cheia: fora dos buscadores; fechar volta para a LP (histórico se veio dela, senão /)', async () => {
    const { metadata } = await import('../src/app/espiar/[token]/page')
    expect(metadata.robots).toMatchObject({ index: false })
    const t = await import('../src/game/vitrine-text')
    expect(t.peekHref('a1.b/c')).toBe('/espiar/a1.b%2Fc')
    expect(t.peekExit('tok', 'tok')).toBe('back')
    expect(t.peekExit(null, 'tok')).toBe('home')
    expect(t.peekExit('outro', 'tok')).toBe('home')
    const { leavePeek } = await import('../src/components/FarmPeekScreen')
    const store = new Map<string, string>()
    const nav: string[] = []
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, x: string) => store.set(k, x), removeItem: (k: string) => store.delete(k) })
    vi.stubGlobal('history', { back: () => nav.push('back') })
    vi.stubGlobal('location', { replace: (u: string) => nav.push(u) })
    try {
      store.set(t.PEEK_FROM, 'tok')
      leavePeek('tok', false) // veio da LP: volta (e a LP restaura a rolagem)
      leavePeek('tok', false) // link direto: abre /
      leavePeek('tok', true) // "Entrar e plantar a sua": a LP foca o e-mail
      expect(nav).toEqual(['back', '/', '/'])
      expect(store.get(t.PEEK_JOIN)).toBe('1')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('banco sem jogadores de verdade: listas vazias (a página mostra "Seja o primeiro")', async () => {
    await player('so_teste', { email: false })
    const list = await (await listRoute(req('/api/vitrine'))).json()
    expect(list.boards).toEqual({ nivel: [], moedas: [], popularidade: [] })
  })
})

describe('modo vitrine da cena (lockObjects)', () => {
  // Um pedaço da cena como a FarmScene monta: lote com toque, hover e toque longo; bicho e casa dentro de camadas.
  function stage() {
    const root = new Container(), world = new Container(), layer = new Container()
    root.addChild(world); world.addChild(layer)
    const log: string[] = []
    const node = (name: string, x: number, parent: Container) => {
      const n = new Container()
      n.eventMode = 'static'
      n.cursor = 'pointer'
      n.hitArea = new Rectangle(x, 0, 100, 100)
      for (const t of ['pointertap', 'pointerdown', 'pointerup', 'pointerover', 'pointerout', 'pointermove'] as const) n.on(t, () => log.push(`${name}:${t}`))
      parent.addChild(n)
    }
    node('lote', 0, layer)
    node('bicho', 100, layer)
    node('casa', 200, world)
    node('tigela', 300, root)
    const b = new EventBoundary(root)
    const at = (type: string, x: number, id = 1, kind = 'touch') => {
      const e = new FederatedPointerEvent(b)
      e.type = type; e.pointerId = id; e.pointerType = kind; e.button = 0
      e.global.set(x, 50); e.screen.set(x, 50)
      b.mapEvent(e)
    }
    // Toque/clique e passar o mouse em cada objeto.
    const poke = () => {
      for (const x of [50, 150, 250, 350]) { at('pointermove', x, 1, 'mouse'); at('pointerdown', x); at('pointerup', x) }
      at('pointermove', 900, 1, 'mouse')
    }
    return { root, b, log, poke }
  }

  it('fora da vitrine os objetos respondem (controle do teste)', () => {
    const { log, poke } = stage()
    poke()
    for (const n of ['lote', 'bicho', 'casa', 'tigela']) {
      expect(log).toContain(`${n}:pointertap`)
      expect(log).toContain(`${n}:pointerover`)
    }
  })

  it('na vitrine nenhum handler de objeto dispara: sem toque, hover, toque longo nem cursor de mão', () => {
    const { root, log, b, poke } = stage()
    lockObjects(root)
    poke()
    expect(log).toEqual([])
    expect(b.cursor ?? 'default').not.toBe('pointer')
  })
})
