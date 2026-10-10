// Operação: logs estruturados (uma linha JSON por evento, prontos para Fly/Railway/Loki/Datadog)
// e captura de erros. Com SENTRY_DSN no ambiente, cada erro também vai para o Sentry pela API de
// envelope (sem SDK e sem chave no código). Sem a variável, só o log.
import { randomUUID } from 'node:crypto'

type Level = 'debug' | 'info' | 'warn' | 'error'
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const MIN = ORDER[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? 20

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  if (ORDER[level] < MIN || process.env.VITEST) return
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields })
  if (level === 'error' || level === 'warn') console.error(line)
  else console.log(line)
}

export function errorFields(e: unknown) {
  return e instanceof Error ? { err: e.message, stack: e.stack?.split('\n').slice(0, 6).join(' | ') } : { err: String(e) }
}

type Dsn = { url: string; key: string }
function parseDsn(dsn: string | undefined): Dsn | null {
  if (!dsn) return null
  try {
    const u = new URL(dsn)
    const project = u.pathname.replace(/^\//, '')
    return { url: `${u.protocol}//${u.host}/api/${project}/envelope/`, key: u.username }
  } catch {
    return null
  }
}

/** Registra o erro e, se houver SENTRY_DSN, envia ao Sentry (sem esperar e sem derrubar a requisição). */
export function captureError(e: unknown, context: Record<string, unknown> = {}) {
  log('error', 'erro', { ...errorFields(e), ...context })
  const dsn = parseDsn(process.env.SENTRY_DSN)
  if (!dsn) return
  const id = randomUUID().replace(/-/g, '')
  const err = e instanceof Error ? e : new Error(String(e))
  const event = {
    event_id: id,
    timestamp: Date.now() / 1000,
    platform: 'node',
    level: 'error',
    environment: process.env.APP_ENV ?? process.env.NODE_ENV,
    release: process.env.APP_VERSION,
    exception: { values: [{ type: err.name, value: err.message, stacktrace: { frames: frames(err.stack) } }] },
    extra: context,
  }
  const body = [JSON.stringify({ event_id: id, sent_at: new Date().toISOString() }), JSON.stringify({ type: 'event' }), JSON.stringify(event)].join('\n')
  void fetch(dsn.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-sentry-envelope',
      'x-sentry-auth': `Sentry sentry_version=7, sentry_key=${dsn.key}, sentry_client=colheita-feliz/1.0`,
    },
    body,
    signal: AbortSignal.timeout(3000),
  }).catch(() => {})
}

function frames(stack: string | undefined) {
  return (stack ?? '').split('\n').slice(1, 30).reverse().map((l) => {
    const m = /at (?:(.+?) )?\(?(.+?):(\d+):(\d+)\)?$/.exec(l.trim())
    return m ? { function: m[1] ?? '?', filename: m[2], lineno: Number(m[3]), colno: Number(m[4]) } : { function: l.trim() }
  })
}

export const _test = { parseDsn }
