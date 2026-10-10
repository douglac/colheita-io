import { NextResponse } from 'next/server'
import { currentUser, destroyAllSessions, destroySession } from '@/server/session'

// Sair. Com { all: true }: sai de todos os aparelhos (derruba todas as sessões da conta).
export async function POST(req: Request) {
  const { all } = (await req.json().catch(() => ({}))) as { all?: boolean }
  const user = all ? await currentUser() : null
  if (user) await destroyAllSessions(user.id)
  else await destroySession()
  return NextResponse.json({ ok: true })
}
