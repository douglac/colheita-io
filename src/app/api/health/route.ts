import { NextResponse } from 'next/server'
import { getDb } from '@/server/db'
import { payFakeEnabled, testLoginEnabled } from '@/server/flags'

export const dynamic = 'force-dynamic'

const started = Date.now()

// Saúde para o balanceador/monitor: app no ar + banco respondendo. 503 se o banco não responder em 2 s.
// testLogin/payFake: só aparecem quando ligados (dev e staging); em produção (colheita.io) ficam de fora.
export async function GET() {
  const t = performance.now()
  const flags = { ...(testLoginEnabled() && { testLogin: true }), ...(payFakeEnabled() && { payFake: true }) }
  try {
    const db = await getDb()
    await Promise.race([
      db.query('select 1'),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000)),
    ])
    return NextResponse.json(
      { ok: true, db: 'ok', dbMs: Math.round(performance.now() - t), uptimeS: Math.round((Date.now() - started) / 1000),
        version: process.env.APP_VERSION ?? 'dev', driver: process.env.DATABASE_URL ? 'postgres' : 'pglite', ...flags },
      { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ ok: false, db: 'down', ...flags, error: String(e instanceof Error ? e.message : e) },
      { status: 503, headers: { 'cache-control': 'no-store' } })
  }
}
