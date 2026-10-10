import { NextResponse } from 'next/server'
import { fail } from '@/server/http'
import { allow, clientIp, tooMany } from '@/server/ratelimit'
import { vitrineData } from '@/server/vitrine'

// Vitrine pública da página inicial (sem login): Top 10 por nível, moedas e popularidade, só com iniciais, e o
// contador de quem está plantando agora. Nada de id, apelido, e-mail ou datas (server/vitrine.ts).
export async function GET(req: Request) {
  if (!allow(`vitrine:${clientIp(req)}`, 30, 0.5)) return tooMany()
  try {
    return NextResponse.json(await vitrineData(), {
      headers: { 'cache-control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=60' },
    })
  } catch (e) {
    return fail(e, { route: 'vitrine' })
  }
}
