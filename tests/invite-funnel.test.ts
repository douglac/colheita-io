// Rotas reais + banco local; apenas o contexto de cookies do Next é substituído.
import { beforeEach, afterAll, expect, it, vi } from 'vitest'
import { NextRequest, type NextResponse } from 'next/server'
import { INVITE, SHARE_XP } from '../src/game/config'
import { gameDay } from '../src/game/rules'

const { jar } = vi.hoisted(() => ({ jar: new Map<string, string>() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined }) }))
process.env.PGLITE_DIR = 'memory://'
process.env.MAIL_PROVIDER = 'memory'
const { getDb, closeDb } = await import('../src/server/db')
const db = await getDb()
const game = await import('../src/server/game')
const auth = await import('../src/server/auth')
const { outbox } = await import('../src/server/mail')
const { GET: invite } = await import('../src/app/api/invite/[code]/route')
const { POST: signup } = await import('../src/app/api/auth/signup/route')
const { POST: verify } = await import('../src/app/api/auth/verify/route')
const { POST: requestCode } = await import('../src/app/api/auth/request/route')
let ip = 0
const post = (data: unknown) => new Request('http://localhost/api/auth/signup', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': `192.0.2.${++ip}` }, body: JSON.stringify(data),
})
const form = { handle: 'convidada', ageBand: '18p', acceptTerms: true }
function receive(res: NextResponse) {
  for (const c of res.cookies.getAll()) {
    if (c.maxAge === 0 || c.expires && new Date(c.expires).getTime() <= Date.now()) jar.delete(c.name)
    else jar.set(c.name, c.value)
  }
}
const codeOf = async (id: string) => (await db.query<{ invite_code: string }>('select invite_code from users where id = $1', [id])).rows[0].invite_code
async function visit(code: string, level?: number) {
  receive(await invite(new NextRequest(`http://localhost/api/invite/${code}${level ? `?n=${level}` : ''}`), { params: Promise.resolve({ code }) }))
}
async function pending(email = 'guest@example.test') {
  const result = await auth.loginWithEmail(email)
  if (!('signup' in result)) throw new Error('fixture já cadastrada')
  jar.set('cf_signup', result.signup)
  return result.signup
}
const count = async (table: string) => (await db.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0].n

beforeEach(async () => {
  jar.clear()
  outbox.length = 0
  await game.resetDbForTests()
  await db.exec('truncate auth_tokens, auth_signups')
})
afterAll(closeDb)

it('link de nível de A → convite simples de B: amizade, bônus e origem pertencem a B; sem XP de A', async () => {
  const a = await game.loginOrCreate('alice')
  const b = await game.loginOrCreate('bruno')
  await db.query('update users set level = 5 where id = $1', [a])
  await visit(await codeOf(a), 5)
  await visit(await codeOf(b))
  await pending()
  const res = await signup(post(form))
  expect(res.status).toBe(200)
  const guest = (await db.query<{ id: string; xp: number }>('select id, xp from users where handle = $1', [form.handle])).rows[0]
  expect((await db.query('select friend_id from friendships where user_id = $1', [guest.id])).rows).toEqual([{ friend_id: b }])
  expect(await count('share_claims')).toBe(0)
  expect(guest.xp).toBe(0)
})

it('falha ao gravar sessão permite repetir cadastro com o mesmo cookie, sem conta/bônus parciais', async () => {
  const inviter = await game.loginOrCreate('bruno')
  await visit(await codeOf(inviter))
  const token = await pending()
  const before = (await db.query<{ gold: number }>('select gold from users where id = $1', [inviter])).rows[0].gold
  await db.exec(`create function qa_fail_session() returns trigger language plpgsql as $$ begin raise exception 'QA session failure'; end $$;
    create trigger qa_fail_session before insert on sessions for each row execute function qa_fail_session()`)
  try {
    expect((await signup(post(form))).status).toBe(500)
    expect(await auth.signupEmail(token)).toBe('guest@example.test')
    expect((await db.query('select id from users where email = $1', ['guest@example.test'])).rows).toHaveLength(0)
    expect((await db.query<{ gold: number }>('select gold from users where id = $1', [inviter])).rows[0].gold).toBe(before)
    expect(await count('friendships')).toBe(0)
  } finally {
    await db.exec('drop trigger qa_fail_session on sessions; drop function qa_fail_session()')
  }
  const retry = await signup(post(form))
  expect(retry.status).toBe(200)
  expect(retry.cookies.get('fz_sid')?.value).toBeTruthy()
  expect(await count('sessions')).toBe(1)
  expect((await db.query<{ gold: number }>('select gold from users where id = $1', [inviter])).rows[0].gold).toBe(before + INVITE.gold)
  expect(await count('friendships')).toBe(2)
  expect((await signup(post(form))).status).toBe(400) // token consumido: não duplica conta/bônus
  expect(await count('sessions')).toBe(1)
})

it('código por e-mail local mantém convite/XP; uso repetido não duplica recompensa', async () => {
  const a = await game.loginOrCreate('alice')
  await db.query('update users set level = 5 where id = $1', [a])
  await visit(await codeOf(a), 5)
  const email = 'code@example.test'
  expect((await requestCode(post({ email }))).status).toBe(200)
  const code = /\d{6}/.exec(outbox[0].subject)![0]
  const confirmed = await verify(post({ email, code }))
  expect(confirmed.status).toBe(200)
  receive(confirmed)
  expect((await verify(post({ email, code }))).status).toBe(400)
  const res = await signup(post(form))
  expect(res.status).toBe(200)
  receive(res)
  expect(jar.has('cf_invite')).toBe(false)
  expect(jar.has('cf_share')).toBe(false)
  expect(await count('share_claims')).toBe(1)
  expect((await db.query('select xp from users where handle = $1', [form.handle])).rows).toEqual([{ xp: SHARE_XP.xp }])
})

it('link mágico em outro navegador confirma e-mail, mas não transporta convite (limitação atual)', async () => {
  const a = await game.loginOrCreate('alice')
  await visit(await codeOf(a), 2)
  const email = 'cross@example.test'
  expect((await requestCode(post({ email }))).status).toBe(200)
  const token = /\/entrar\?t=([A-Za-z0-9_-]+)/.exec(outbox[0].text)![1]
  jar.clear() // navegador B, sem os cookies do navegador A
  const confirmed = await verify(post({ token }))
  expect(confirmed.status).toBe(200)
  receive(confirmed)
  expect((await signup(post(form))).status).toBe(200)
  expect(await count('friendships')).toBe(0)
  expect(await count('share_claims')).toBe(0)
})

it('duas pessoas disputando a última vaga do sharer não ultrapassam a cota', async () => {
  const a = await game.loginOrCreate('alice')
  const viewers = await Promise.all(['bruno', 'carla'].map(h => game.loginOrCreate(h)))
  await db.query('update users set level = 5 where id = $1', [a])
  await db.query("insert into daily_counters (user_id, day, kind, count) values ($1, $2, 'share_given', $3)", [a, gameDay(Date.now()), SHARE_XP.perSharerDay - 1])
  const code = await codeOf(a)
  let release = () => {}
  let blocker: Promise<void> | undefined
  if (process.env.DATABASE_URL) {
    // Segura a linha da cota para ambos lerem o saldo anterior antes de tentar incrementá-la.
    // PGlite só tem uma conexão: a disputa real é exercitada no Postgres.
    let locked = () => {}
    const ready = new Promise<void>(r => { locked = r })
    const hold = new Promise<void>(r => { release = r })
    blocker = db.transaction(async q => {
      await q.query("select 1 from daily_counters where user_id = $1 and kind = 'share_given' for update", [a])
      locked()
      await hold
    })
    await ready
  }
  const claims = Promise.all(viewers.map(id => game.claimShareXp(id, code, 5)))
  try {
    if (blocker) {
      await expect.poll(async () => (await db.query<{ n: number }>("select count(*)::int n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query like '%daily_counters%'")).rows[0].n).toBe(2)
    }
  } finally { release(); await blocker }
  const results = await claims
  expect(results.filter(r => r.ok)).toHaveLength(1)
  expect(results.filter(r => !r.ok)).toEqual([{ ok: false, reason: 'sharer_limit', sharer: 'alice' }])
  expect(await count('share_claims')).toBe(1)
  expect((await db.query("select count from daily_counters where user_id = $1 and kind = 'share_given'", [a])).rows).toEqual([{ count: SHARE_XP.perSharerDay }])
  expect((await db.query<{ xp: number }>('select sum(xp)::int xp from users where id = any($1::uuid[])', [viewers])).rows[0].xp).toBe(SHARE_XP.xp)
}, 15_000)

it('cookies antigos divergentes não atribuem XP/origem de A ao cadastro convidado por B', async () => {
  const a = await game.loginOrCreate('alice'), b = await game.loginOrCreate('bruno')
  await db.query('update users set level = 5 where id = $1', [a])
  jar.set('cf_share', `${await codeOf(a)}.5`)
  jar.set('cf_invite', await codeOf(b))
  await pending()
  expect((await signup(post(form))).status).toBe(200)
  expect(await count('share_claims')).toBe(0)
})

it('conta existente aceita convite e XP uma vez, sem repetir bônus de cadastro', async () => {
  const a = await game.loginOrCreate('alice')
  const token = await pending('existing@example.test')
  const viewer = await auth.completeSignup(token, form)
  jar.clear()
  await db.query('update users set level = 5 where id = $1', [a])
  const gold = (await db.query('select gold from users where id = $1', [a])).rows[0].gold
  await visit(await codeOf(a), 5)
  const { link } = await auth.requestToken({ email: 'existing@example.test', purpose: 'login', ip: '192.0.2.200', baseUrl: 'http://localhost' })
  const res = await verify(post({ token: link }))
  expect(await res.json()).toMatchObject({ next: '/fazenda/alice' })
  receive(res)
  await visit(await codeOf(a), 5) // já logado
  expect(await count('share_claims')).toBe(1)
  expect((await db.query('select gold from users where id = $1', [a])).rows[0].gold).toBe(gold)
  expect((await db.query('select friend_id, via from friendships where user_id = $1', [viewer])).rows).toEqual([{ friend_id: a, via: 'add' }])
})

it('resgates paralelos do mesmo viewer respeitam uso único e a última vaga diária', async () => {
  const a = await game.loginOrCreate('alice'), viewer = await game.loginOrCreate('bruno')
  await db.query('update users set level = 5 where id = $1', [a])
  const code = await codeOf(a)
  const duplicate = await Promise.all([game.claimShareXp(viewer, code, 2), game.claimShareXp(viewer, code, 2)])
  expect(duplicate.filter(r => r.ok)).toHaveLength(1)
  expect(duplicate.find(r => !r.ok)).toMatchObject({ reason: 'done' })
  await db.query("update daily_counters set count = $2 where user_id = $1 and kind = 'share_xp'", [viewer, SHARE_XP.perViewerDay - 1])
  const last = await Promise.all([game.claimShareXp(viewer, code, 3), game.claimShareXp(viewer, code, 4)])
  expect(last.filter(r => r.ok)).toHaveLength(1)
  expect(last.find(r => !r.ok)).toMatchObject({ reason: 'limit' })
  expect(await count('share_claims')).toBe(2)
})

it('falha após reservar a cota desfaz reserva, XP e claim; repetição consegue resgatar', async () => {
  const a = await game.loginOrCreate('alice'), viewer = await game.loginOrCreate('bruno')
  await db.query('update users set level = 5 where id = $1', [a])
  const code = await codeOf(a)
  await db.exec(`create function qa_fail_claim() returns trigger language plpgsql as $$ begin raise exception 'QA claim failure'; end $$;
    create trigger qa_fail_claim before insert on share_claims for each row execute function qa_fail_claim()`)
  try {
    await expect(game.claimShareXp(viewer, code, 5)).rejects.toThrow('QA claim failure')
    expect(await count('share_claims')).toBe(0)
    expect((await db.query("select * from daily_counters where kind in ('share_xp', 'share_given')")).rows).toHaveLength(0)
    expect((await db.query('select xp from users where id = $1', [viewer])).rows[0].xp).toBe(0)
  } finally { await db.exec('drop trigger qa_fail_claim on share_claims; drop function qa_fail_claim()') }
  expect(await game.claimShareXp(viewer, code, 5)).toMatchObject({ ok: true })
})

it('dois jogadores resgatam os links um do outro ao mesmo tempo', async () => {
  const a = await game.loginOrCreate('alice'), b = await game.loginOrCreate('bruno')
  await db.query('update users set level = 5 where id = any($1::uuid[])', [[a, b]])
  const ca = await codeOf(a), cb = await codeOf(b)
  // No Postgres, garante que os dois viewers estão travados antes de tocar nas FKs do outro.
  // Só a ordem de execução é controlada: queries e locks continuam no banco real.
  const transaction = db.transaction.bind(db)
  let locked = 0, release = () => {}
  const both = new Promise<void>(resolve => { release = resolve })
  const spy = process.env.DATABASE_URL ? vi.spyOn(db, 'transaction').mockImplementation(fn => transaction(q => fn({
    ...q,
    async query<T>(sql: string, params?: unknown[]) {
      const result = await q.query<T>(sql, params)
      if (/^select \* from users where id = \$1 for (no key )?update$/.test(sql)) {
        if (++locked === 2) release()
        await both
      }
      return result
    },
  }))) : undefined
  try {
    const results = await Promise.all([game.claimShareXp(a, cb, 2), game.claimShareXp(b, ca, 2)])
    expect(results.every(r => r.ok)).toBe(true)
  } finally { release(); spy?.mockRestore() }
  expect(await count('share_claims')).toBe(2)
})
