import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { deleteAccount } from '@/server/account'
import { AuthError, linkEmail, loginWithEmail, normalizeEmail, verifyCode, verifyLink } from '@/server/auth'
import { acceptInviteAsFriend } from '@/server/game'
import { fail } from '@/server/http'
import { allow, clientIp } from '@/server/ratelimit'
import { cookieOptions, createSession, currentUser, INVITE_COOKIE, SESSION_COOKIE, setSessionCookie, SIGNUP_COOKIE } from '@/server/session'
import { claimSharedCookie, SHARE_COOKIE } from '@/server/share-xp'

// Confere o código (e-mail + 6 dígitos) ou o link mágico ({ token }) e faz o que ele promete:
// entrar, ligar o e-mail à conta ou excluir a conta. Responde { next } com a página seguinte.
export async function POST(req: Request) {
  if (!allow(`authverify:${clientIp(req)}`, 20, 20 / 600)) {
    return NextResponse.json({ error: 'Muitas tentativas. Espere alguns minutos.' }, { status: 429 })
  }
  try {
    const body = (await req.json().catch(() => ({}))) as { email?: string; code?: string; token?: string; purpose?: string }
    const user = await currentUser()
    const t = body.token
      ? await verifyLink(String(body.token))
      : await verifyCode({
        email: normalizeEmail(body.email),
        code: String(body.code ?? ''),
        purpose: body.purpose === 'link' || body.purpose === 'delete' ? body.purpose : 'login',
        userId: user?.id,
      })

    if (t.purpose === 'link') {
      if (!t.user_id || t.user_id !== user?.id) throw new AuthError('Entre na fazenda certa e abra o link de novo.')
      await linkEmail(t.user_id, t.email)
      return NextResponse.json({ ok: true, next: '/conta?ligado=1' })
    }
    if (t.purpose === 'delete') {
      if (!t.user_id) throw new AuthError('Link inválido.')
      await deleteAccount(t.user_id)
      const res = NextResponse.json({ ok: true, next: '/conta/excluida' })
      if (user?.id === t.user_id) res.cookies.delete(SESSION_COOKIE)
      return res
    }

    const jar = await cookies()
    const invite = jar.get(INVITE_COOKIE)?.value
    const r = await loginWithEmail(t.email)
    if ('signup' in r) {
      const res = NextResponse.json({ ok: true, next: '/bem-vindo' })
      res.cookies.set(SIGNUP_COOKIE, r.signup, cookieOptions(2 * 3600))
      return res
    }
    // Já tinha conta e veio por um convite: vira amigo de quem convidou e vai para a fazenda dele.
    const inviter = invite ? await acceptInviteAsFriend(r.userId, invite) : null
    const res = NextResponse.json({ ok: true, next: inviter ? `/fazenda/${inviter}` : '/fazenda' })
    setSessionCookie(res, await createSession(r.userId, req.headers.get('user-agent')))
    if (invite) res.cookies.delete(INVITE_COOKIE)
    await claimSharedCookie(res, r.userId, jar.get(SHARE_COOKIE)?.value, invite)
    return res
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status })
    return fail(e)
  }
}
