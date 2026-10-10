// Infraestrutura: migrações versionadas, IP do cliente atrás de proxy, DSN do Sentry, health.
import { afterEach, describe, expect, it } from 'vitest'

process.env.PGLITE_DIR = 'memory://'
const { getDb, SCHEMA } = await import('../src/server/db')
const { migrate } = await import('../src/server/migrate')
const { clientIp } = await import('../src/server/ratelimit')
const { _test } = await import('../src/server/observe')
await getDb() // abre (e migra) antes dos testes: o PGlite demora a subir

describe('migrações', () => {
  it('a 1ª conexão aplica tudo; rodar de novo não refaz nada', async () => {
    const db = await getDb()
    const ids = (await db.query<{ id: string }>('select id from schema_migrations order by id')).rows.map((r) => r.id)
    expect(ids).toEqual(['0001_base', '0001_ledger_kind', '0002_indices_consultas_quentes', '0003_frente_f_bichos', '0004_frente_j_decoracao', '0005_avatar_usuario', '0006_level_up_compartilhado', '0007_eventos_sazonais', '0008_eventos_motor', '0009_vitrine_publica'])
    const again = await migrate(db, SCHEMA)
    expect(again.applied).toEqual([])
    expect(again.skipped).toHaveLength(10)
  })

  it('migração nova roda uma vez; texto mudado roda de novo (por ser idempotente)', async () => {
    const db = await getDb()
    const m = { id: '9999_teste', sql: 'create table if not exists _mig_teste (x int);' }
    expect((await migrate(db, SCHEMA, [m])).applied).toEqual(['9999_teste'])
    expect((await migrate(db, SCHEMA, [m])).applied).toEqual([])
    const changed = { ...m, sql: m.sql + '\nalter table _mig_teste add column if not exists y int;' }
    expect((await migrate(db, SCHEMA, [changed])).applied).toEqual(['9999_teste'])
    const cols = (await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = '_mig_teste' order by column_name")).rows
    expect(cols.map((c) => c.column_name)).toEqual(['x', 'y'])
    await db.exec("drop table _mig_teste; delete from schema_migrations where id = '9999_teste'")
  })

  it('índices das consultas quentes existem', async () => {
    const db = await getDb()
    const idx = (await db.query<{ indexname: string }>("select indexname from pg_indexes where schemaname = 'public'")).rows.map((r) => r.indexname)
    for (const name of ['plots_ripe_due_idx', 'users_last_seen_idx', 'friendships_friend_idx', 'steals_victim_idx', 'events_user_idx'])
      expect(idx).toContain(name)
  })
})

describe('IP do cliente', () => {
  const req = (h: Record<string, string>) => new Request('http://x/', { headers: h })
  afterEach(() => { delete process.env.CLIENT_IP_HEADER; delete process.env.TRUST_PROXY_HOPS })

  it('vale a entrada posta pelo nosso proxy (a da direita), não a que o cliente forjou', () => {
    expect(clientIp(req({ 'x-forwarded-for': '6.6.6.6, 200.1.2.3' }))).toBe('200.1.2.3')
    process.env.TRUST_PROXY_HOPS = '2'
    expect(clientIp(req({ 'x-forwarded-for': '6.6.6.6, 200.1.2.3, 10.0.0.1' }))).toBe('200.1.2.3')
  })

  it('cabeçalho confiável do provedor tem prioridade; sem nada, "local"', () => {
    process.env.CLIENT_IP_HEADER = 'fly-client-ip'
    expect(clientIp(req({ 'fly-client-ip': '177.1.1.1', 'x-forwarded-for': '6.6.6.6' }))).toBe('177.1.1.1')
    delete process.env.CLIENT_IP_HEADER
    expect(clientIp(req({}))).toBe('local')
  })
})

describe('Sentry', () => {
  it('lê o DSN e monta o endereço de envelope', () => {
    expect(_test.parseDsn('https://abc123@o42.ingest.sentry.io/777')).toEqual({ url: 'https://o42.ingest.sentry.io/api/777/envelope/', key: 'abc123' })
    expect(_test.parseDsn(undefined)).toBeNull()
    expect(_test.parseDsn('lixo')).toBeNull()
  })
})

describe('/api/health', () => {
  it('responde ok com o banco', async () => {
    const { GET } = await import('../src/app/api/health/route')
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, db: 'ok', driver: process.env.DATABASE_URL ? 'postgres' : 'pglite' })
  })
})
