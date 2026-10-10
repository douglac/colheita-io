import { NextResponse } from 'next/server'
import { AuthError, normalizeEmail, requestToken } from '@/server/auth'
import { getDb } from '@/server/db'
import { countDaily } from '@/server/metrics'
import { baseUrl } from '@/server/flags'
import { fail } from '@/server/http'
import { allow, clientIp } from '@/server/ratelimit'
import { currentUser } from '@/server/session'

// Pede o código de 6 dígitos + link mágico.
//   login  (padrão): qualquer e-mail; conta nova ou antiga, a resposta é a mesma.
//   link   : jogador logado liga um e-mail à conta de teste dele.
//   delete : jogador logado confirma a exclusão da conta pelo próprio e-mail.
export async function POST(req: Request) {
  const ip = clientIp(req)
  if (!allow(`authreq:${ip}`, 5, 5 / 60)) return NextResponse.json({ error: 'Muitos pedidos. Espere um minuto.' }, { status: 429 })
  try {
    const body = (await req.json().catch(() => ({}))) as { email?: string; purpose?: string }
    const purpose = body.purpose === 'link' || body.purpose === 'delete' ? body.purpose : 'login'
    let email: string
    let userId: string | undefined
    if (purpose === 'login') {
      email = normalizeEmail(body.email)
    } else {
      const user = await currentUser()
      if (!user) return NextResponse.json({ error: 'Faça login' }, { status: 401 })
      userId = user.id
      if (purpose === 'link') email = normalizeEmail(body.email)
      else {
        const row = (await (await getDb()).query<{ email: string | null }>('select email from users where id = $1', [user.id])).rows[0]
        if (!row?.email) throw new AuthError('Essa conta não tem e-mail ligado.')
        email = row.email
      }
    }
    await requestToken({ email, purpose, ip, baseUrl: baseUrl(req), userId })
    if (purpose === 'login') await countDaily('login_code_sent') // só a contagem do dia, sem o e-mail
    return NextResponse.json({ ok: true, email })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status })
    return fail(e)
  }
}
