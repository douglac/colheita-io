import { NextResponse } from 'next/server'
import { fail } from '@/server/http'
import { allow, clientIp, tooMany } from '@/server/ratelimit'
import { vitrineFarm } from '@/server/vitrine'

// Prévia "só para olhar" de uma fazenda do ranking público. Aceita só o token opaco da linha (nunca id ou apelido);
// adulterado, vencido ou de quem saiu do ranking → 404.
export async function GET(req: Request, ctx: RouteContext<'/api/vitrine/fazenda/[token]'>) {
  if (!allow(`vitrine-farm:${clientIp(req)}`, 20, 0.5)) return tooMany()
  try {
    const { token } = await ctx.params
    const body = await vitrineFarm(token)
    if (!body) return NextResponse.json({ error: 'Fazenda não encontrada' }, { status: 404 })
    return NextResponse.json(body, { headers: { 'cache-control': 'public, max-age=30, s-maxage=60' } })
  } catch (e) {
    return fail(e, { route: 'vitrine/fazenda' })
  }
}
