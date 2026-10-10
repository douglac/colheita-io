import { NextResponse } from 'next/server'
import { loginOrCreate } from '@/server/game'
import { fail } from '@/server/http'
import { allow, clientIp, tooMany } from '@/server/ratelimit'
import { cookies } from 'next/headers'
import { testLoginBlocked, testLoginEnabled } from '@/server/flags'
import { createSession, INVITE_COOKIE, setSessionCookie } from '@/server/session'
import { claimSharedCookie, SHARE_COOKIE } from '@/server/share-xp'

// Login de teste: só apelido, sem senha. Só em desenvolvimento ou no staging (server/flags.ts); conta com e-mail não entra por aqui.
// Desligado (colheita.io), a rota nem existe para o público: 404.
export async function POST(req: Request) {
  if (testLoginBlocked()) return NextResponse.json({ error: 'Login de teste bloqueado em produção' }, { status: 403 })
  if (!testLoginEnabled()) return new NextResponse(null, { status: 404 })
  // Criação de conta em massa: no máximo 10 entradas por minuto por endereço.
  if (!allow(`login:${clientIp(req)}`, 10, 10 / 60)) return tooMany('Muitas tentativas. Espere um minuto.')
  try {
    const { handle } = (await req.json()) as { handle?: string }
    // Veio por um link /c/<código>: vira amigo de quem convidou (só vale para conta nova).
    const jar = await cookies()
    const invite = jar.get(INVITE_COOKIE)?.value
    const userId = await loginOrCreate(String(handle ?? '').trim().toLowerCase(), invite)
    const sid = await createSession(userId, req.headers.get('user-agent'))
    const res = NextResponse.json({ ok: true })
    setSessionCookie(res, sid)
    if (invite) res.cookies.delete(INVITE_COOKIE)
    await claimSharedCookie(res, userId, jar.get(SHARE_COOKIE)?.value, invite)
    return res
  } catch (e) {
    return fail(e)
  }
}
