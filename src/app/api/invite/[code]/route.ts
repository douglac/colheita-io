import { NextResponse, type NextRequest } from 'next/server'
import { acceptInviteAsFriend, claimShareXp } from '@/server/game'
import { currentUser, INVITE_COOKIE } from '@/server/session'
import { rememberShare, SHARE_COOKIE, shareLevel } from '@/server/share-xp'

// Botão "Entrar na fazenda" da página de convite.
// Sem conta: guarda o código (vale no cadastro, com bônus) e vai para o login.
// Já logado: vira amigo de quem convidou e vai direto para a fazenda dele.
// Link de level-up (?n=<nível>): quem abre ganha XP (na hora, se já joga; no cadastro, se ainda não).
// Redireciona pelo caminho (Location relativo): fica no mesmo endereço que a pessoa abriu, mesmo atrás de proxy
// ou com outro nome de host (req.url no next dev vira "localhost" e o cookie do convite ficava no outro host).
const go = (path: string) => new NextResponse(null, { status: 307, headers: { location: path } })

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params
  if (!/^[a-z0-9]{4,12}$/i.test(code)) return go('/')
  const level = shareLevel(req.nextUrl.searchParams.get('n'))
  const user = await currentUser()
  if (user) {
    const inviter = await acceptInviteAsFriend(user.id, code)
    if (level) await claimShareXp(user.id, code, level).catch(() => null)
    return go(inviter ? `/fazenda/${inviter}` : '/fazenda')
  }
  const res = go('/')
  res.cookies.set(INVITE_COOKIE, code.toLowerCase(), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 })
  if (level) rememberShare(res, code, level)
  else res.cookies.delete(SHARE_COOKIE)
  return res
}
