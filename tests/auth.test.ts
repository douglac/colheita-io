// Conta por e-mail: código + link mágico (15 min, uso único, com hash), limites, primeiro acesso, LGPD.
import { beforeEach, describe, expect, it } from 'vitest'

process.env.PGLITE_DIR = 'memory://'
const { getDb } = await import('../src/server/db')
const game = await import('../src/server/game')
const auth = await import('../src/server/auth')
const account = await import('../src/server/account')
const { outbox } = await import('../src/server/mail')
const { hashSecret } = await import('../src/server/session')
const age = await import('../src/game/age')

const db = await getDb()
const sql = (q: string, p: unknown[] = []) => db.query<Record<string, any>>(q, p)
const BASE = 'http://localhost:3100'
let ipN = 0
const ip = () => `10.0.0.${++ipN}` // cada teste com IP próprio, para os limites por IP não se misturarem

const ask = (email: string, extra: Partial<Parameters<typeof auth.requestToken>[0]> = {}) =>
  auth.requestToken({ email, purpose: 'login', ip: extra.ip ?? ip(), baseUrl: BASE, ...extra })
const signupForm = (handle: string) => ({ handle, birthDate: '1990-05-10', acceptTerms: true })

beforeEach(async () => {
  await game.resetDbForTests()
  await sql('truncate auth_tokens, auth_signups')
  outbox.length = 0
})

describe('código e link por e-mail', () => {
  it('manda e-mail com código de 6 números e link; o banco só guarda hashes', async () => {
    const { code, link } = await ask('Ana@Example.com '.trim().toLowerCase())
    expect(code).toMatch(/^\d{6}$/)
    expect(outbox).toHaveLength(1)
    const m = outbox[0]
    expect(m.to).toBe('ana@example.com')
    expect(m.subject).toContain(code)
    expect(m.html).toContain(`${code.slice(0, 3)} ${code.slice(3)}`)
    expect(m.html).toContain(`${BASE}/entrar?t=${link}`)
    expect(m.text).toContain('15 minutos')
    const row = (await sql('select * from auth_tokens')).rows[0]
    expect(JSON.stringify(row)).not.toContain(code)
    expect(JSON.stringify(row)).not.toContain(link)
    expect(row.link_hash).toBe(hashSecret(link))
  })

  it('e-mail inválido é recusado', () => {
    expect(() => auth.normalizeEmail('ana@')).toThrow()
    expect(() => auth.normalizeEmail('sem-arroba.com')).toThrow()
    expect(auth.normalizeEmail('  Ana@Example.COM ')).toBe('ana@example.com')
  })

  it('código certo entra uma vez só (uso único)', async () => {
    const { code } = await ask('ana@example.com')
    const t = await auth.verifyCode({ email: 'ana@example.com', code, purpose: 'login' })
    expect(t.email).toBe('ana@example.com')
    await expect(auth.verifyCode({ email: 'ana@example.com', code, purpose: 'login' })).rejects.toThrow(/venceu ou já foi usado/)
  })

  it.each(['', '12345', '123 45', '1234567'])('recusa código com tamanho inválido: %j', async (code) => {
    await expect(auth.verifyCode({ email: 'otp-regression@example.com', code, purpose: 'login' }))
      .rejects.toThrow('O código tem 6 números.')
  })

  it('link mágico entra uma vez só e não serve depois do código', async () => {
    const a = await ask('bia@example.com')
    expect(await auth.peekLink(a.link)).toBe('login')
    expect((await auth.verifyLink(a.link)).email).toBe('bia@example.com')
    await expect(auth.verifyLink(a.link)).rejects.toThrow(/venceu ou já foi usado/)
    expect(await auth.peekLink(a.link)).toBeNull()
    // código e link são o mesmo token: usou um, o outro morre
    await sql("update auth_tokens set created_at = now() - interval '1 minute'")
    const b = await ask('bia@example.com')
    await auth.verifyCode({ email: 'bia@example.com', code: b.code, purpose: 'login' })
    await expect(auth.verifyLink(b.link)).rejects.toThrow()
  })

  it('vence em 15 minutos', async () => {
    const { code, link } = await ask('cris@example.com')
    const row = (await sql('select extract(epoch from expires_at - created_at)::int as s from auth_tokens')).rows[0]
    expect(row.s).toBe(15 * 60)
    await sql("update auth_tokens set expires_at = now() - interval '1 second'")
    await expect(auth.verifyCode({ email: 'cris@example.com', code, purpose: 'login' })).rejects.toThrow(/venceu/)
    await expect(auth.verifyLink(link)).rejects.toThrow(/venceu/)
  })

  it('5 tentativas erradas matam o código (mesmo o certo não vale depois)', async () => {
    const { code } = await ask('davi@example.com')
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < 4; i++) await expect(auth.verifyCode({ email: 'davi@example.com', code: wrong, purpose: 'login' })).rejects.toThrow(/Código errado/)
    await expect(auth.verifyCode({ email: 'davi@example.com', code: wrong, purpose: 'login' })).rejects.toThrow(/Peça um código novo/)
    await expect(auth.verifyCode({ email: 'davi@example.com', code, purpose: 'login' })).rejects.toThrow(/venceu ou já foi usado/)
  })

  it('pedir outro código aposenta o anterior', async () => {
    const a = await ask('eva@example.com')
    await sql("update auth_tokens set created_at = now() - interval '1 minute'")
    const b = await ask('eva@example.com')
    await expect(auth.verifyLink(a.link)).rejects.toThrow()
    if (a.code !== b.code) await expect(auth.verifyCode({ email: 'eva@example.com', code: a.code, purpose: 'login' })).rejects.toThrow()
    expect((await auth.verifyCode({ email: 'eva@example.com', code: b.code, purpose: 'login' })).email).toBe('eva@example.com')
  })

  it('código de um propósito não serve para outro', async () => {
    const { code } = await ask('fe@example.com')
    await expect(auth.verifyCode({ email: 'fe@example.com', code, purpose: 'delete' })).rejects.toThrow()
  })
})

describe('limites de envio', () => {
  it('30 s entre dois pedidos do mesmo e-mail', async () => {
    await ask('gil@example.com')
    await expect(ask('gil@example.com')).rejects.toMatchObject({ status: 429, code: 'cooldown' })
  })

  it('no máximo 3 por e-mail em 15 min e 10 por dia', async () => {
    for (let i = 0; i < 3; i++) {
      await ask('hugo@example.com')
      await sql("update auth_tokens set created_at = created_at - interval '1 minute'")
    }
    await expect(ask('hugo@example.com')).rejects.toMatchObject({ status: 429, code: 'rate' })
    await sql("update auth_tokens set created_at = now() - interval '1 hour'")
    for (let i = 0; i < 7; i++) {
      await sql("update auth_tokens set created_at = now() - interval '1 hour' where created_at > now() - interval '1 hour'")
      await ask('hugo@example.com')
    }
    await sql("update auth_tokens set created_at = now() - interval '1 hour'")
    await expect(ask('hugo@example.com')).rejects.toThrow(/Limite de códigos de hoje/)
    // passou um dia: libera
    await sql("update auth_tokens set created_at = now() - interval '25 hours'")
    await expect(ask('hugo@example.com')).resolves.toBeTruthy()
  })

  it('no máximo 10 por IP em 15 min (e-mails diferentes)', async () => {
    const same = '9.9.9.9'
    for (let i = 0; i < 10; i++) await ask(`p${i}@example.com`, { ip: same })
    await expect(ask('p10@example.com', { ip: same })).rejects.toMatchObject({ status: 429 })
    await expect(ask('p10@example.com', { ip: '8.8.8.8' })).resolves.toBeTruthy()
  })
})

describe('primeiro acesso e entrada', () => {
  it('e-mail novo: escolhe apelido, idade e termos; depois entra direto na mesma conta', async () => {
    const { code } = await ask('ana@example.com')
    const t = await auth.verifyCode({ email: 'ana@example.com', code, purpose: 'login' })
    const r = await auth.loginWithEmail(t.email)
    expect('signup' in r).toBe(true)
    const signup = (r as { signup: string }).signup
    expect(await auth.signupEmail(signup)).toBe('ana@example.com')

    await expect(auth.completeSignup(signup, { handle: 'ana', birthDate: '1990-05-10' })).rejects.toThrow(/aceite os Termos/)
    const id = await auth.completeSignup(signup, signupForm('ana'))
    const u = (await sql('select * from users where id = $1', [id])).rows[0]
    expect(u).toMatchObject({ handle: 'ana', email: 'ana@example.com', age_band: '18p', terms_version: auth.TERMS_VERSION })
    expect(u.terms_accepted_at).toBeTruthy()
    expect(await auth.signupEmail(signup)).toBeNull() // o cadastro pendente acabou

    // sair e entrar de novo: mesma fazenda, sem cadastro
    await sql("update auth_tokens set created_at = now() - interval '1 minute'")
    const again = await ask('ana@example.com')
    const t2 = await auth.verifyCode({ email: 'ana@example.com', code: again.code, purpose: 'login' })
    expect(await auth.loginWithEmail(t2.email)).toEqual({ userId: id })
  })

  it('apelido único (nem de outro jogador, nem de vizinho do jogo)', async () => {
    await game.loginOrCreate('ana')
    const s1 = (await auth.loginWithEmail('outra@example.com') as { signup: string }).signup
    await expect(auth.completeSignup(s1, signupForm('ana'))).rejects.toThrow(/já tem dono/)
    await expect(auth.completeSignup(s1, signupForm('seu_ze'))).rejects.toThrow(/já tem dono/)
    await expect(auth.completeSignup(s1, signupForm('A'))).rejects.toThrow(/Apelido/)
    await expect(auth.completeSignup('cadastro-falso', signupForm('nova'))).rejects.toThrow(/expirou/)
  })

  it('idade: menos de 13 não entra; 13–15 precisa do responsável; faixa no lugar da data', async () => {
    const s = (await auth.loginWithEmail('jovem@example.com') as { signup: string }).signup
    const y = new Date().getUTCFullYear()
    await expect(auth.completeSignup(s, { handle: 'mirim', birthDate: `${y - 10}-01-01`, acceptTerms: true })).rejects.toMatchObject({ code: 'too_young' })
    await expect(auth.completeSignup(s, { handle: 'teen', ageBand: '13_15', acceptTerms: true })).rejects.toMatchObject({ code: 'guardian' })
    await expect(auth.completeSignup(s, { handle: 'teen', birthDate: '2999-01-01', acceptTerms: true })).rejects.toThrow(/data de nascimento/)
    const id = await auth.completeSignup(s, { handle: 'teen', ageBand: '13_15', guardianConsent: true, acceptTerms: true })
    const u = (await sql('select age_band, birth_date, guardian_consent_at from users where id = $1', [id])).rows[0]
    expect(u.age_band).toBe('13_15')
    expect(u.birth_date).toBeNull()
    expect(u.guardian_consent_at).toBeTruthy()
    expect(age.canPurchase('13_15')).toBe(false)
    expect(age.canPurchase('18p')).toBe(true)
  })

  it('idade calculada pela data, com aniversário', () => {
    const now = new Date(Date.UTC(2026, 9, 9))
    expect(age.ageFrom('2008-10-09', now)).toBe(18)
    expect(age.ageFrom('2008-10-10', now)).toBe(17)
    expect(age.ageFrom('2008-02-30', now)).toBeNull()
    expect(age.bandFromAge(15)).toBe('13_15')
  })

  it('convite /c/<código>: cadastro novo vira amigo de quem convidou e os dois ganham o bônus', async () => {
    const inviterId = await game.loginOrCreate('zeca')
    const code = (await sql('select invite_code from users where id = $1', [inviterId])).rows[0].invite_code
    const goldBefore = (await sql('select gold from users where id = $1', [inviterId])).rows[0].gold
    const s = (await auth.loginWithEmail('convidada@example.com') as { signup: string }).signup
    const id = await auth.completeSignup(s, signupForm('convidada'), code)
    const f = await sql('select * from friendships where user_id = $1 and friend_id = $2', [inviterId, id])
    expect(f.rows[0].via).toBe('invite')
    expect((await sql('select gold from users where id = $1', [inviterId])).rows[0].gold).toBeGreaterThan(goldBefore)
  })

  it('login de teste não abre conta que tem e-mail', async () => {
    const s = (await auth.loginWithEmail('lu@example.com') as { signup: string }).signup
    await auth.completeSignup(s, signupForm('luana'))
    await expect(game.loginOrCreate('luana')).rejects.toThrow(/protegida por e-mail/)
  })

  it('conta antiga (login de teste) liga um e-mail e passa a entrar por ele', async () => {
    const id = await game.loginOrCreate('velho')
    const { code } = await ask('velho@example.com', { purpose: 'link', userId: id })
    expect(outbox[0].subject).toMatch(/ligar este e-mail/)
    const t = await auth.verifyCode({ email: 'velho@example.com', code, purpose: 'link', userId: id })
    await auth.linkEmail(t.user_id!, t.email)
    expect(await auth.loginWithEmail('velho@example.com')).toEqual({ userId: id })
    // e-mail que já é de outra fazenda não pode ser ligado
    const other = await game.loginOrCreate('outro')
    await expect(ask('velho@example.com', { purpose: 'link', userId: other })).rejects.toThrow(/outra fazenda/)
  })
})

describe('LGPD', () => {
  async function newAccount(email: string, handle: string) {
    const s = (await auth.loginWithEmail(email) as { signup: string }).signup
    return auth.completeSignup(s, signupForm(handle))
  }

  it('baixar dados: traz conta, fazenda e amigos pelo apelido, sem segredos', async () => {
    const id = await newAccount('ana@example.com', 'ana')
    const bob = await game.loginOrCreate('bob')
    await sql(`insert into friendships (user_id, friend_id, via) values ($1, $2, 'add'), ($2, $1, 'add') on conflict do nothing`, [id, bob])
    await sql(`insert into sessions (id, user_id) values ('segredo-da-sessao-xxxxxxxxxxxxxxxxxxxxxxxxxxx', $1)`, [id])
    await ask('ana@example.com', { purpose: 'delete', userId: id })
    const data = (await account.exportUserData(id))!
    expect(data.conta).toMatchObject({ handle: 'ana', email: 'ana@example.com' })
    expect(data.conta).not.toHaveProperty('id')
    expect(data.tabelas.plots.length).toBeGreaterThan(0)
    expect(data.tabelas.friendships.some((f) => f.friend_id === '@bob' || f.user_id === '@bob')).toBe(true)
    const json = JSON.stringify(data)
    expect(json).not.toContain(bob)
    expect(json).not.toContain('segredo-da-sessao')
    expect(json).not.toContain('code_hash')
    expect(json).not.toContain('link_hash')
  })

  it('excluir: confirma pelo e-mail, apaga a conta, as amizades dos dois lados e o rastro nos murais vira "Alguém"', async () => {
    const id = await newAccount('ana@example.com', 'ana')
    const bob = await game.loginOrCreate('bob')
    await sql(`insert into friendships (user_id, friend_id, via) values ($1, $2, 'add'), ($2, $1, 'add')`, [id, bob])
    await sql(`insert into events (user_id, actor_id, kind) values ($1, $2, 'visited')`, [bob, id])
    const { code } = await ask('ana@example.com', { purpose: 'delete', userId: id })
    expect(outbox.at(-1)!.subject).toMatch(/exclusão/)
    const t = await auth.verifyCode({ email: 'ana@example.com', code, purpose: 'delete', userId: id })
    expect(await account.deleteAccount(t.user_id!)).toBe(true)
    expect((await sql('select 1 from users where id = $1', [id])).rows).toHaveLength(0)
    expect((await sql('select 1 from friendships where user_id = $1 or friend_id = $1', [id])).rows).toHaveLength(0)
    expect((await sql('select 1 from plots where owner_id = $1', [id])).rows).toHaveLength(0)
    expect((await sql('select actor_id from events where user_id = $1', [bob])).rows[0].actor_id).toBeNull()
    expect((await sql("select 1 from auth_tokens where email = 'ana@example.com'")).rows).toHaveLength(0)
    // bob segue jogando; o apelido e o e-mail ficam livres
    expect((await sql('select 1 from users where id = $1', [bob])).rows).toHaveLength(1)
    expect('signup' in await auth.loginWithEmail('ana@example.com')).toBe(true)
  })

  it('quem foi convidado continua com a fazenda quando quem convidou sai', async () => {
    const inviter = await newAccount('ana@example.com', 'ana')
    const code = (await sql('select invite_code from users where id = $1', [inviter])).rows[0].invite_code
    const s = (await auth.loginWithEmail('bia@example.com') as { signup: string }).signup
    const guest = await auth.completeSignup(s, signupForm('bia'), code)
    await account.deleteAccount(inviter)
    expect((await sql('select handle from users where id = $1', [guest])).rows[0].handle).toBe('bia')
    expect((await sql('select 1 from friendships where user_id = $1', [guest])).rows).toHaveLength(0)
  })
})

