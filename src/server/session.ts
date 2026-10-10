import { cookies } from 'next/headers'
import type { NextResponse } from 'next/server'
import { createHash, randomBytes } from 'node:crypto'
import { getDb, type Q } from './db'

export const SESSION_COOKIE = 'fz_sid'
export const INVITE_COOKIE = 'cf_invite'
/** E-mail confirmado esperando o primeiro acesso (apelido, idade, termos). */
export const SIGNUP_COOKIE = 'cf_signup'

/** Sessão dura 30 dias desde o último uso: renova no máximo 1 vez por dia (rota /api/farm). */
export const SESSION_DAYS = 30
const RENEW_AFTER_MS = 24 * 3600_000

/** Cookie só por HTTPS em produção. COOKIE_SECURE=0 desliga (produção local em http://, ex.: perfil prod-local do Docker). */
export const secureCookies = () => process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== '0'

export type SessionUser = { id: string; handle: string }

/** O cookie leva o segredo; o banco guarda só o hash. Vazou o banco, as sessões não valem. */
export const hashSecret = (s: string) => createHash('sha256').update(s).digest('base64url')

export function cookieOptions(maxAgeSec: number) {
  return { httpOnly: true, secure: secureCookies(), sameSite: 'lax' as const, path: '/', maxAge: maxAgeSec }
}

export async function currentUser(): Promise<SessionUser | null> {
  const sid = (await cookies()).get(SESSION_COOKIE)?.value
  if (!sid) return null
  const db = await getDb()
  const { rows } = await db.query<SessionUser>(
    'select u.id, u.handle from sessions s join users u on u.id = s.user_id where s.id = $1 and s.expires_at > now()',
    [hashSecret(sid)],
  )
  return rows[0] ?? null
}

export async function createSession(userId: string, userAgent?: string | null, q?: Q): Promise<string> {
  const sid = randomBytes(24).toString('base64url')
  const db = q ?? await getDb()
  await db.query(
    `insert into sessions (id, user_id, user_agent, expires_at) values ($1, $2, $3, now() + $4 * interval '1 day')`,
    [hashSecret(sid), userId, userAgent?.slice(0, 200) ?? null, SESSION_DAYS])
  return sid
}

export function setSessionCookie(res: NextResponse, sid: string) {
  res.cookies.set(SESSION_COOKIE, sid, cookieOptions(SESSION_DAYS * 24 * 3600))
}

/** Renovação deslizante: quem joga não cai. Chamada nas rotas que o jogo usa sempre. */
export async function renewSession(res: NextResponse) {
  const sid = (await cookies()).get(SESSION_COOKIE)?.value
  if (!sid) return
  const db = await getDb()
  const { rows } = await db.query(
    `update sessions set expires_at = now() + $2 * interval '1 day', renewed_at = now()
     where id = $1 and expires_at > now() and renewed_at < now() - $3 * interval '1 millisecond' returning id`,
    [hashSecret(sid), SESSION_DAYS, RENEW_AFTER_MS])
  if (rows.length) setSessionCookie(res, sid)
}

export async function destroySession() {
  const jar = await cookies()
  const sid = jar.get(SESSION_COOKIE)?.value
  if (sid) await (await getDb()).query('delete from sessions where id = $1', [hashSecret(sid)])
  jar.delete(SESSION_COOKIE)
}

/** "Sair de todos os aparelhos": derruba todas as sessões da conta (inclusive esta). */
export async function destroyAllSessions(userId: string) {
  await (await getDb()).query('delete from sessions where user_id = $1', [userId])
  ;(await cookies()).delete(SESSION_COOKIE)
}
