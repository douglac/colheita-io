import { NextResponse } from 'next/server'
import { GameError } from '@/game/rules'
import { setAvatar } from '@/server/game'
import { fail } from '@/server/http'
import { currentUser } from '@/server/session'

// Minha conta: trocar o rosto do fazendeiro (lote Q, A9).
export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Faça login' }, { status: 401 })
  try {
    const { avatar } = (await req.json().catch(() => ({}))) as { avatar?: unknown }
    return NextResponse.json({ ok: true, avatar: await setAvatar(user.id, avatar) })
  } catch (e) {
    if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: 400 })
    return fail(e)
  }
}
