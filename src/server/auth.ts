// Entrar com e-mail, sem senha: código de 6 dígitos + link mágico, 15 min, uso único.
// No banco só ficam hashes (HMAC com sal para o código, sha256 para o link). Limites por e-mail e por IP.
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { ageFrom, bandFromAge, canSignUp, isAgeBand, needsGuardian, type AgeBand } from '@/game/age'
import { GameError } from '@/game/rules'
import { isAvatar } from '@/game/avatar'
import { LEGAL } from '@/game/legal'
import { getDb, tx, type Q } from './db'
import { registerAccount } from './game'
import type { SignupOrigin } from './metrics'
import { sendMail } from './mail'
import { tokenMail, type TokenPurpose } from './mail-templates'
import { createSession, hashSecret } from './session'

export const TOKEN_MINUTES = 15
export const MAX_ATTEMPTS = 5
/** Versão dos Termos gravada no aceite do cadastro: a data da última atualização (src/game/legal.ts). */
export const TERMS_VERSION = LEGAL.updated
/** Limites de envio: por e-mail e por IP, em janelas de 15 min e de 24 h; e um respiro entre dois pedidos. */
export const SEND_LIMITS = { emailShort: 3, emailDay: 10, ipShort: 10, ipDay: 50, cooldownSec: 30 }
const SIGNUP_HOURS = 2

export class AuthError extends GameError {
  constructor(message: string, readonly status = 400, code?: string) { super(message, code) }
}

export function secret(): string {
  const s = process.env.AUTH_SECRET
  if (s) return s
  if (process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET não configurado')
  return 'dev-only-colheita-feliz-auth-secret'
}

const hmac = (salt: string, code: string) => createHmac('sha256', secret()).update(`${salt}:${code}`).digest('base64url')

export function normalizeEmail(raw: unknown): string {
  const e = String(raw ?? '').trim().toLowerCase()
  if (e.length > 254 || !/^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/.test(e)) throw new AuthError('Confira o e-mail: parece que falta alguma coisa.')
  return e
}

type TokenRow = {
  id: string; email: string; purpose: TokenPurpose; user_id: string | null; code_hash: string
  attempts: number; expires_at: Date; used_at: Date | null
}

/** Manda código + link. `userId` vai junto em 'link' (vincular e-mail) e 'delete' (excluir conta). */
export async function requestToken(opts: { email: string; purpose: TokenPurpose; ip: string; baseUrl: string; userId?: string }) {
  const { email, purpose, ip, userId } = opts
  const db = await getDb()
  if (purpose === 'link') {
    const other = await db.query('select 1 from users where email = $1 and id <> $2', [email, userId])
    if (other.rows.length) throw new AuthError('Esse e-mail já está ligado a outra fazenda.')
  }
  const { rows: [n] } = await db.query<{ e15: number; e24: number; i15: number; i24: number; last: number | null }>(
    `select
       count(*) filter (where email = $1 and created_at > now() - interval '15 minutes')::int as e15,
       count(*) filter (where email = $1)::int as e24,
       count(*) filter (where ip = $2 and created_at > now() - interval '15 minutes')::int as i15,
       count(*) filter (where ip = $2)::int as i24,
       extract(epoch from now() - max(created_at) filter (where email = $1))::float as last
     from auth_tokens where (email = $1 or ip = $2) and created_at > now() - interval '24 hours'`, [email, ip])
  if (n.last != null && n.last < SEND_LIMITS.cooldownSec) {
    throw new AuthError(`Acabamos de mandar um código. Espere ${Math.ceil(SEND_LIMITS.cooldownSec - n.last)} segundos para pedir outro.`, 429, 'cooldown')
  }
  if (n.e15 >= SEND_LIMITS.emailShort || n.i15 >= SEND_LIMITS.ipShort) {
    throw new AuthError('Muitos códigos pedidos. Espere 15 minutos e tente de novo.', 429, 'rate')
  }
  if (n.e24 >= SEND_LIMITS.emailDay || n.i24 >= SEND_LIMITS.ipDay) {
    throw new AuthError('Limite de códigos de hoje atingido. Tente de novo amanhã.', 429, 'rate')
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const salt = randomBytes(9).toString('base64url')
  const link = randomBytes(32).toString('base64url')
  await tx(async (q) => {
    // Só o último código vale: pedir outro aposenta o anterior (menos chances de chute).
    await q.query(`update auth_tokens set expires_at = least(expires_at, now()) where email = $1 and purpose = $2 and used_at is null`, [email, purpose])
    await q.query(
      `insert into auth_tokens (email, purpose, user_id, code_hash, link_hash, ip, expires_at)
       values ($1, $2, $3, $4, $5, $6, now() + $7 * interval '1 minute')`,
      [email, purpose, userId ?? null, `${salt}.${hmac(salt, code)}`, hashSecret(link), ip, TOKEN_MINUTES])
  })
  const url = `${opts.baseUrl.replace(/\/$/, '')}/entrar?t=${link}`
  await sendMail(tokenMail(purpose, email, code, url, TOKEN_MINUTES))
  return { code, link } // o código só volta para os testes; as rotas não devolvem nada disso
}

const EXPIRED = 'Esse código venceu ou já foi usado. Peça um novo.'

/** Confere o código digitado. Errou: conta tentativa; na 5ª o código morre. Certo: marca como usado (uma vez só). */
export async function verifyCode(opts: { email: string; code: string; purpose: TokenPurpose; userId?: string }): Promise<TokenRow> {
  const code = String(opts.code ?? '').replace(/\D/g, '')
  if (code.length !== 6) throw new AuthError('O código tem 6 números.')
  // Erro de código não pode lançar dentro da transação: o rollback desfaria a tentativa contada.
  const r = await tx(async (q): Promise<TokenRow | AuthError> => {
    const t = (await q.query<TokenRow>(
      `select * from auth_tokens where email = $1 and purpose = $2 and used_at is null and expires_at > now()
       order by id desc limit 1 for update`, [opts.email, opts.purpose])).rows[0]
    if (!t || t.attempts >= MAX_ATTEMPTS) return new AuthError(EXPIRED, 400, 'expired')
    if (opts.userId && t.user_id && t.user_id !== opts.userId) return new AuthError(EXPIRED, 400, 'expired')
    const [salt, want] = t.code_hash.split('.')
    const got = hmac(salt, code)
    if (got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
      const left = MAX_ATTEMPTS - t.attempts - 1
      await q.query('update auth_tokens set attempts = attempts + 1 where id = $1', [t.id])
      return new AuthError(left > 0 ? `Código errado. ${left === 1 ? 'Resta 1 tentativa' : `Restam ${left} tentativas`}.` : 'Código errado de novo. Peça um código novo.', 400, 'wrong_code')
    }
    await q.query('update auth_tokens set used_at = now() where id = $1', [t.id])
    return t
  })
  if (r instanceof AuthError) throw r
  return r
}

/** Link mágico: acha pelo hash, uso único. */
export async function verifyLink(link: string): Promise<TokenRow> {
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(link)) throw new AuthError(EXPIRED, 400, 'expired')
  const { rows } = await (await getDb()).query<TokenRow>(
    `update auth_tokens set used_at = now()
     where link_hash = $1 and used_at is null and expires_at > now() and attempts < $2 returning *`, [hashSecret(link), MAX_ATTEMPTS])
  if (!rows[0]) throw new AuthError(EXPIRED, 400, 'expired')
  return rows[0]
}

/** Para a página do link: o que esse link faz (sem gastar o link). */
export async function peekLink(link: string): Promise<TokenPurpose | null> {
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(link)) return null
  const { rows } = await (await getDb()).query<{ purpose: TokenPurpose }>(
    'select purpose from auth_tokens where link_hash = $1 and used_at is null and expires_at > now()', [hashSecret(link)])
  return rows[0]?.purpose ?? null
}

/** E-mail confirmado: entra na conta que já existe ou abre o primeiro acesso (apelido, idade, termos). */
export async function loginWithEmail(email: string): Promise<{ userId: string } | { signup: string }> {
  const db = await getDb()
  const user = (await db.query<{ id: string }>('select id from users where email = $1', [email])).rows[0]
  if (user) return { userId: user.id }
  const signup = randomBytes(24).toString('base64url')
  await db.query(`delete from auth_signups where expires_at < now()`)
  await db.query(`insert into auth_signups (id, email, expires_at) values ($1, $2, now() + $3 * interval '1 hour')`,
    [hashSecret(signup), email, SIGNUP_HOURS])
  return { signup }
}

export async function signupEmail(signup: string | undefined): Promise<string | null> {
  if (!signup) return null
  const { rows } = await (await getDb()).query<{ email: string }>(
    'select email from auth_signups where id = $1 and expires_at > now()', [hashSecret(signup)])
  return rows[0]?.email ?? null
}

export type SignupForm = { handle?: unknown; birthDate?: unknown; ageBand?: unknown; guardianConsent?: unknown; acceptTerms?: unknown; avatar?: unknown }

/** Primeiro acesso: valida idade e aceite, cria a fazenda e encerra o cadastro pendente. */
export async function completeSignup(signup: string | undefined, form: SignupForm, inviteCode?: string, origin?: SignupOrigin): Promise<string> {
  return finishSignup(signup, form, inviteCode, origin)
}

/** Conta, amizade, bônus, consumo do token e sessão confirmam juntos; falha permite tentar de novo. */
export async function signupWithSession(signup: string | undefined, form: SignupForm, inviteCode?: string, origin?: SignupOrigin, userAgent?: string | null) {
  let sid = ''
  const userId = await finishSignup(signup, form, inviteCode, origin, async (q, id) => {
    sid = await createSession(id, userAgent, q)
  })
  return { userId, sid }
}

async function finishSignup(signup: string | undefined, form: SignupForm, inviteCode?: string, origin?: SignupOrigin,
  finalize?: (q: Q, userId: string) => Promise<void>): Promise<string> {
  const email = await signupEmail(signup)
  if (!email) throw new AuthError('O cadastro expirou. Peça um código novo para entrar.', 400, 'signup_expired')
  const handle = String(form.handle ?? '').trim().toLowerCase()
  let band: AgeBand
  let birthDate: string | null = null
  if (form.birthDate) {
    const age = ageFrom(String(form.birthDate))
    if (age == null) throw new AuthError('Confira a data de nascimento.')
    birthDate = String(form.birthDate)
    band = bandFromAge(age)
  } else if (isAgeBand(form.ageBand)) {
    band = form.ageBand
  } else {
    throw new AuthError('Conte sua idade (data de nascimento ou faixa).')
  }
  if (!canSignUp(band)) throw new AuthError('A fazenda é para quem tem 13 anos ou mais. Até logo! 🌻', 403, 'too_young')
  if (needsGuardian(band) && form.guardianConsent !== true) {
    throw new AuthError('Quem tem menos de 16 anos precisa da autorização do pai, mãe ou responsável.', 400, 'guardian')
  }
  if (form.acceptTerms !== true) throw new AuthError('Para jogar, aceite os Termos de Uso e a Política de Privacidade.')
  const id = await registerAccount(handle, { email, birthDate, ageBand: band, guardianConsent: needsGuardian(band), termsVersion: TERMS_VERSION, avatar: isAvatar(form.avatar) ? form.avatar : null }, inviteCode, origin, async (q, userId) => {
    // Reconfere o token dentro da transação; pedidos repetidos não reutilizam um cadastro consumido.
    const consumed = await q.query('delete from auth_signups where id = $1 and expires_at > now() returning id', [hashSecret(signup!)])
    if (!consumed.rows.length) throw new AuthError('O cadastro expirou. Peça um código novo para entrar.', 400, 'signup_expired')
    await finalize?.(q, userId)
    await q.query('delete from auth_signups where email = $1', [email])
  })
  return id
}

/** Liga um e-mail confirmado a uma conta antiga (do login de teste por apelido). */
export async function linkEmail(userId: string, email: string) {
  try {
    await (await getDb()).query('update users set email = $2 where id = $1', [userId, email])
  } catch {
    throw new AuthError('Esse e-mail já está ligado a outra fazenda.')
  }
}
