import { NextResponse } from 'next/server'
import { ACTION_TYPES, runAction, type Action } from '@/server/game'
import { fail } from '@/server/http'
import { allow, tooMany } from '@/server/ratelimit'
import { currentUser } from '@/server/session'

export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Faça login' }, { status: 401 })
  // Até 20 ações seguidas e depois 1 por segundo: humano não percebe, robô para.
  if (!allow(`act:${user.id}`, 20, 1)) return tooMany('Calma, fazendeiro! Muitas ações seguidas.')
  try {
    const body = (await req.json()) as Action
    if (!body || !ACTION_TYPES.has(body.type)) return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
    if ('idx' in body && !Number.isInteger(body.idx)) return NextResponse.json({ error: 'Lote inválido' }, { status: 400 })
    return NextResponse.json(await runAction(user.id, body))
  } catch (e) {
    return fail(e, { route: 'action', user: user.id })
  }
}
