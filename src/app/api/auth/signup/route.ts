import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { GameError } from '@/game/rules'
import { AuthError, signupWithSession, type SignupForm } from '@/server/auth'
import { fail } from '@/server/http'
import { allow, clientIp } from '@/server/ratelimit'
import { INVITE_COOKIE, setSessionCookie, SIGNUP_COOKIE } from '@/server/session'
import { type SignupOrigin } from '@/server/metrics'
import { claimSharedCookie, parseShareCookie, SHARE_COOKIE } from '@/server/share-xp'

// Primeiro acesso: apelido, idade e aceite dos termos. Cria a fazenda (com o bônus do convite, se houver) e entra.
export async function POST(req: Request) {
  if (!allow(`signup:${clientIp(req)}`, 10, 10 / 60)) return NextResponse.json({ error: 'Muitas tentativas. Espere um minuto.' }, { status: 429 })
  try {
    const jar = await cookies()
    const invite = jar.get(INVITE_COOKIE)?.value
    const form = (await req.json()) as SignupForm & { origem?: unknown }
    // Origem (métricas): link de level-up > convite > prévia da vitrine (a página marca no navegador) > direto.
    const origin: SignupOrigin = invite && parseShareCookie(jar.get(SHARE_COOKIE)?.value)?.code === invite.toLowerCase() ? 'compartilhar'
      : invite ? 'convite' : form.origem === 'vitrine' ? 'vitrine' : 'direto'
    const { userId, sid } = await signupWithSession(jar.get(SIGNUP_COOKIE)?.value, form, invite, origin, req.headers.get('user-agent'))
    const res = NextResponse.json({ ok: true, next: '/fazenda' })
    setSessionCookie(res, sid)
    res.cookies.delete(SIGNUP_COOKIE)
    if (invite) res.cookies.delete(INVITE_COOKIE)
    await claimSharedCookie(res, userId, jar.get(SHARE_COOKIE)?.value, invite)
    return res
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status })
    if (e instanceof GameError) return NextResponse.json({ error: e.message, code: e.code }, { status: 400 })
    return fail(e)
  }
}
