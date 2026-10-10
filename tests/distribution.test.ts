import { afterEach, expect, it, vi } from 'vitest'

process.env.PGLITE_DIR = 'memory://'
afterEach(() => vi.unstubAllEnvs())

const routes = [
  '../src/app/api/pay/route', '../src/app/api/pay/fake/route',
  '../src/app/api/pay/birth/route', '../src/app/api/pay/order/[id]/route',
  '../src/app/api/pay/webhook/[provider]/route', '../src/app/api/admin/pay/route',
  '../src/app/api/admin/metricas/route',
]

it.each(['development', 'test', 'production'])('cobrança permanece fechada em %s mesmo com opt-ins e credenciais configurados', async (env) => {
  vi.stubEnv('NODE_ENV', env)
  vi.stubEnv('APP_ENV', 'staging')
  for (const key of ['PAY_FAKE', 'PAY_ALLOW_MINORS', 'MP_ACCESS_TOKEN', 'MP_WEBHOOK_SECRET', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'FAKE_PAY_SECRET', 'ADMIN_EMAILS', 'ADMIN_HANDLES']) vi.stubEnv(key, '1')
  const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Nenhuma chamada externa permitida'))
  try {
    for (const file of routes) {
      const route = await import(file)
      for (const method of ['GET', 'POST']) {
        // Corpo inválido e webhook desconhecido também são rejeitados sem processamento.
        const res = await route[method](new Request('http://localhost/api/pay', { method: 'POST', body: '{' }), { params: Promise.resolve({ provider: 'fake', id: 'order' }) })
        expect(res.status, file).toBe(404)
        expect(res.headers.get('cache-control')).toBe('no-store')
      }
    }
    expect(network).not.toHaveBeenCalled()
    const { payFakeEnabled } = await import('../src/server/flags')
    expect(payFakeEnabled()).toBe(false)
  } finally { network.mockRestore() }
})

it('banco novo tem gameplay e não tem tabelas comerciais ou analíticas; chamadas não gravam dados', async () => {
  const { getDb } = await import('../src/server/db')
  const { loginOrCreate, runAction, loadFarm } = await import('../src/server/game')
  const db = await getDb()
  const id = await loginOrCreate('comunidade')
  const before = await loadFarm(id)
  await runAction(id, { type: 'buy', itemId: 'semente:nabo', qty: 1 })
  const after = await loadFarm(id)
  expect(after.me.gold).toBeLessThan(before.me.gold)
  const metrics = await import('../src/server/metrics')
  await metrics.track(id, 'harvest')
  await metrics.trackAll(id, [{ kind: 'signup' }])
  await metrics.countDaily('lp_view')
  await metrics.trackOpen(id)
  await metrics.trackInviteOpen('code', id, 1)
  const tables = (await db.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public'")).rows.map((r) => r.tablename)
  expect(tables).toContain('ledger')
  expect(tables).toContain('inventory')
  expect(tables.filter((t) => /^(pay_|metric_)/.test(t))).toEqual([])
}, 30_000)
