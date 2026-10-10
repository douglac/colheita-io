import { NextResponse } from 'next/server'
import { exportUserData } from '@/server/account'
import { allow } from '@/server/ratelimit'
import { currentUser } from '@/server/session'

// LGPD: baixar os próprios dados em JSON.
export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Faça login' }, { status: 401 })
  if (!allow(`export:${user.id}`, 3, 3 / 600)) return NextResponse.json({ error: 'Espere alguns minutos para baixar de novo.' }, { status: 429 })
  const data = await exportUserData(user.id)
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="colheita-feliz-${user.handle}-dados.json"`,
      'cache-control': 'no-store',
    },
  })
}
