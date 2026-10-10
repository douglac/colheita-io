// Login por apelido e pagamento falso: em produção só no staging (APP_ENV=staging).
import { afterEach, describe, expect, it, vi } from 'vitest'

process.env.PGLITE_DIR = 'memory://'
const flags = await import('../src/server/flags')

const NODE_ENVS = ['development', 'test', 'production'] as const
const APP_ENVS = [undefined, '', 'staging', 'production', 'prod-local', 'Staging'] as const
const OPT_INS = [undefined, '0', '1'] as const

afterEach(() => vi.unstubAllEnvs())

describe('matriz NODE_ENV × APP_ENV × opt-in', () => {
  for (const NODE_ENV of NODE_ENVS) for (const APP_ENV of APP_ENVS) for (const opt of OPT_INS) {
    const prod = NODE_ENV === 'production'
    const staging = APP_ENV === 'staging'
    // Produção: só com o opt-in ligado E no staging. Fora de produção: ligado, a menos que desligado com '0'.
    const want = prod ? opt === '1' && staging : opt !== '0'
    const blocked = prod && !staging && opt === '1'

    it(`NODE_ENV=${NODE_ENV} APP_ENV=${APP_ENV} opt-in=${opt} → ${want ? 'ligado' : 'desligado'}${blocked ? ' (bloqueado)' : ''}`, () => {
      const login = { NODE_ENV, APP_ENV, ALLOW_TEST_LOGIN: prod ? opt : undefined, TEST_LOGIN: prod ? undefined : opt }
      expect(flags.testLoginEnabled(login)).toBe(want)
      expect(flags.testLoginBlocked(login)).toBe(blocked)

      const pay = { NODE_ENV, APP_ENV, PAY_FAKE: opt }
      expect(flags.payFakeEnabled()).toBe(false)
      expect(flags.payFakeBlocked(pay)).toBe(blocked)
    })
  }

  it('em produção, TEST_LOGIN não liga nada; só ALLOW_TEST_LOGIN=1 no staging', () => {
    expect(flags.testLoginEnabled({ NODE_ENV: 'production', APP_ENV: 'staging', TEST_LOGIN: '1' })).toBe(false)
    expect(flags.testLoginEnabled({ NODE_ENV: 'production', APP_ENV: 'staging', ALLOW_TEST_LOGIN: 'true' })).toBe(false)
  })

  it('blockedTestFlags lista os opt-ins ligados em produção fora do staging', () => {
    expect(flags.blockedTestFlags({ NODE_ENV: 'production', ALLOW_TEST_LOGIN: '1', PAY_FAKE: '1' })).toEqual(['ALLOW_TEST_LOGIN', 'PAY_FAKE'])
    expect(flags.blockedTestFlags({ NODE_ENV: 'production', APP_ENV: 'production', PAY_FAKE: '1' })).toEqual(['PAY_FAKE'])
    expect(flags.blockedTestFlags({ NODE_ENV: 'production', APP_ENV: 'staging', ALLOW_TEST_LOGIN: '1', PAY_FAKE: '1' })).toEqual([])
    expect(flags.blockedTestFlags({ NODE_ENV: 'production' })).toEqual([])
    expect(flags.blockedTestFlags({ NODE_ENV: 'development', ALLOW_TEST_LOGIN: '1', PAY_FAKE: '1' })).toEqual([])
  })


})

describe('produção sem staging com opt-in ligado', () => {
  it('POST /api/login (apelido) responde 403', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('APP_ENV', 'production')
    vi.stubEnv('ALLOW_TEST_LOGIN', '1')
    const { POST } = await import('../src/app/api/login/route')
    const res = await POST(new Request('http://x/api/login', { method: 'POST', body: JSON.stringify({ handle: 'bia' }) }))
    expect(res.status).toBe(403)
  })

  it('POST /api/pay/fake permanece indisponível', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PAY_FAKE', '1')
    const { POST } = await import('../src/app/api/pay/fake/route')
    const res = await POST(new Request('http://x/api/pay/fake', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(404)
  })

  it('/api/health só mostra testLogin e payFake quando ligados', async () => {
    const { GET } = await import('../src/app/api/health/route')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ALLOW_TEST_LOGIN', '1')
    vi.stubEnv('PAY_FAKE', '1')
    vi.stubEnv('APP_ENV', 'production')
    const prod = await (await GET()).json()
    expect(prod).toMatchObject({ ok: true })
    expect(prod).not.toHaveProperty('testLogin')
    expect(prod).not.toHaveProperty('payFake')
    vi.stubEnv('APP_ENV', 'staging')
    const body = await (await GET()).json()
    expect(body).toMatchObject({ ok: true, testLogin: true })
    expect(body).not.toHaveProperty('payFake')
  }, 30_000) // a 1ª importação da rota abre o PGlite: passa de 5 s com a suíte inteira em paralelo
})

describe('colheita.io é produção', () => {
  it('sem opt-in: login de teste e pagamento falso respondem 404', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('APP_ENV', 'production')
    vi.stubEnv('ALLOW_TEST_LOGIN', '')
    vi.stubEnv('PAY_FAKE', '')
    expect(flags.testLoginEnabled()).toBe(false)
    expect(flags.payFakeEnabled()).toBe(false)
    const login = await import('../src/app/api/login/route')
    expect((await login.POST(new Request('http://x/api/login', { method: 'POST', body: JSON.stringify({ handle: 'bia' }) }))).status).toBe(404)
    const payFake = await import('../src/app/api/pay/fake/route')
    expect((await payFake.POST(new Request('http://x/api/pay/fake', { method: 'POST', body: '{}' }))).status).toBe(404)
    const dev = await import('../src/app/api/dev/route')
    expect((await dev.POST(new Request('http://x/api/dev', { method: 'POST', body: '{}' }))).status).toBe(404)
  }, 30_000)

  it('dev local (npm run dev) continua com login de teste e cobrança indisponível', () => {
    expect(flags.testLoginEnabled({ NODE_ENV: 'development' })).toBe(true)
    expect(flags.payFakeEnabled()).toBe(false)
  })
})
