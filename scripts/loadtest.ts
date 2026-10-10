// npm run load — teste de carga leve: N jogadores simulados (padrão 200) plantando, colhendo, visitando e roubando
// ao mesmo tempo, contra um servidor de verdade. Mede p50/p95/p99 de GET /api/farm e POST /api/action.
//
//   docker compose --profile prod-local up -d     (app de produção + Postgres 16 em http://localhost:3200)
//   npm run load                                   (ou: BASE_URL=… USERS=200 DURATION_S=60 npm run load)
//
// Precisa do login de teste ligado no servidor (ALLOW_TEST_LOGIN=1, como no perfil prod-local) e de DATABASE_URL
// apontando para o mesmo banco: o script adianta o relógio das hortas (amadurece tudo a cada 10 s) e tira a
// quarentena de roubo das contas novas — o que, no jogo, levaria horas.
// Cada jogador manda no máximo ~1 ação por segundo (o limite por usuário da API); cada um aparece com um IP
// próprio (X-Forwarded-For), como atrás do balanceador de produção.
import pg from 'pg'

const BASE = (process.env.BASE_URL ?? 'http://localhost:3200').replace(/\/$/, '')
const USERS = Number(process.env.USERS ?? 200)
const DURATION = Number(process.env.DURATION_S ?? 60) * 1000
const DB_URL = process.env.DATABASE_URL ?? 'postgres://colheita:colheita@localhost:5433/colheita'
const RUN = Date.now().toString(36).slice(-4)

type Sample = { route: string; ms: number; status: number }
const samples: Sample[] = []

async function call(route: string, path: string, init: RequestInit & { ip: string; cookie?: string }) {
  const t = performance.now()
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': init.ip, ...(init.cookie ? { cookie: init.cookie } : {}) },
  })
  const body = await res.text()
  samples.push({ route, ms: performance.now() - t, status: res.status })
  return { res, json: body ? JSON.parse(body) : null }
}

type Plot = { idx: number; state: string; canSteal?: boolean }
type Farm = { plots: Plot[]; inventory: { itemId: string; qty: number }[]; neighbors?: { handle: string }[] }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

async function player(n: number, handles: string[], until: number) {
  const ip = `10.${(n >> 8) & 255}.${n & 255}.${(n * 7) & 255}`
  const handle = handles[n]
  const login = await call('login', '/api/login', { method: 'POST', body: JSON.stringify({ handle }), ip })
  const cookie = login.res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
  if (!cookie) throw new Error(`login falhou para ${handle}: ${login.res.status} ${JSON.stringify(login.json)}`)
  await sleep(Math.random() * 2000) // não começam todos no mesmo milissegundo
  const act = (body: object) => call('action', '/api/action', { method: 'POST', body: JSON.stringify(body), ip, cookie })
  while (Date.now() < until) {
    const me = (await call('farm', '/api/farm', { ip, cookie })).json as Farm
    for (const p of me.plots ?? []) {
      if (Date.now() >= until) break
      if (p.state === 'ripe') await act({ type: 'harvest', idx: p.idx })
      else if (p.state === 'withered') await act({ type: 'clear', idx: p.idx })
      else if (p.state === 'empty') await act({ type: 'plant', idx: p.idx, seedId: 'nabo' }).then(async (r) => {
        if (r.res.status === 400) { await act({ type: 'buy', itemId: 'semente:nabo', qty: 5 }); await sleep(1000) }
      })
      else continue
      await sleep(1000)
    }
    // Visita um vizinho (outro jogador simulado ou um bot) e rouba o que der.
    const owner = Math.random() < 0.8 ? pick(handles) : pick(['dona_cida', 'seu_ze'])
    if (owner === handle) continue
    const visit = (await call('farm', `/api/farm?owner=${owner}`, { ip, cookie })).json as Farm
    for (const p of (visit.plots ?? []).filter((p) => p.state === 'ripe').slice(0, 3)) {
      if (Date.now() >= until) break
      await act({ type: 'steal', owner, idx: p.idx })
      await sleep(1000)
    }
    if (Math.random() < 0.3) { await act({ type: 'sell_all' }); await sleep(1000) }
  }
}

function pct(xs: number[], p: number) {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}

async function main() {
  const health = await fetch(BASE + '/api/health').then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }))
  console.log('servidor:', BASE, health)
  const db = new pg.Pool({ connectionString: DB_URL, max: 2 })
  const handles = Array.from({ length: USERS }, (_, i) => `carga_${RUN}_${i}`)
  const until = Date.now() + DURATION
  // "Relógio rápido": a cada 10 s amadurece tudo que está plantado e tira a quarentena das contas da carga.
  const clock = setInterval(() => void db.query(
    `with u as (update users set created_at = now() - interval '2 days' where handle like $1 and created_at > now() - interval '1 day' returning id)
     update plots set planted_at = now() - interval '2 hours', ready_at = now() - interval '1 minute', dry_at = null, nat_pest_at = null, nat_weed_at = null
     where seed_id is not null and not withered and ready_at > now() and owner_id in (select id from users where handle like $1)`,
    [`carga_${RUN}_%`]).catch((e) => console.error('relógio:', e.message)), 10_000)
  const t0 = Date.now()
  const results = await Promise.allSettled(handles.map((_, i) => player(i, handles, until)))
  clearInterval(clock)
  const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
  const secs = (Date.now() - t0) / 1000

  console.log(`\n${USERS} jogadores, ${secs.toFixed(0)} s, ${samples.length} requisições (${(samples.length / secs).toFixed(0)}/s)`)
  console.log('rota     n      p50     p95     p99     máx   status')
  const report: Record<string, unknown> = {}
  for (const route of ['login', 'farm', 'action']) {
    const s = samples.filter((x) => x.route === route)
    const ms = s.map((x) => x.ms)
    const statuses = Object.entries(s.reduce<Record<number, number>>((m, x) => ((m[x.status] = (m[x.status] ?? 0) + 1), m), {}))
      .map(([k, v]) => `${k}:${v}`).join(' ')
    const row = { n: s.length, p50: pct(ms, 50), p95: pct(ms, 95), p99: pct(ms, 99), max: Math.max(...ms) }
    report[route] = { ...row, statuses }
    console.log(`${route.padEnd(7)} ${String(row.n).padStart(5)} ${row.p50.toFixed(0).padStart(6)}ms ${row.p95.toFixed(0).padStart(6)}ms ${row.p99.toFixed(0).padStart(6)}ms ${row.max.toFixed(0).padStart(6)}ms  ${statuses}`)
  }
  if (failed.length) console.log(`\n${failed.length} jogadores pararam com erro; 1º:`, failed[0].reason?.message ?? failed[0].reason)
  const errors5xx = samples.filter((x) => x.status >= 500).length
  console.log(JSON.stringify({ users: USERS, seconds: Math.round(secs), requests: samples.length, errors5xx, ...report }))
  // Limpa as contas da carga (cascata apaga lotes, roubos, eventos…).
  if (process.env.KEEP !== '1') await db.query('delete from users where handle like $1', [`carga_${RUN}_%`])
  await db.end()
  if (errors5xx > 0 || failed.length) process.exitCode = 1
}

await main()
