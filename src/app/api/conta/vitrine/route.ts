import { NextResponse } from 'next/server'
import { fail } from '@/server/http'
import { currentUser } from '@/server/session'
import { setPublicRanking } from '@/server/vitrine'

// Minha conta: aparecer (só com as iniciais) no ranking público da página inicial, ou sair dele.
export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Faça login' }, { status: 401 })
  try {
    const { on } = (await req.json().catch(() => ({}))) as { on?: unknown }
    if (typeof on !== 'boolean') return NextResponse.json({ error: 'Valor inválido' }, { status: 400 })
    await setPublicRanking(user.id, on)
    return NextResponse.json({ ok: true, on })
  } catch (e) {
    return fail(e)
  }
}
