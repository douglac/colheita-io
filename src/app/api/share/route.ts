import { NextResponse } from 'next/server'
import { isSharePlace, track } from '@/server/metrics'
import { allow } from '@/server/ratelimit'
import { currentUser } from '@/server/session'

// Métricas: tocou em compartilhar ou convidar (o menu em si é do navegador; aqui só fica o "tocou" e o lugar).
// Nunca falha para o jogador: sem login, lugar estranho ou rajada, responde 204 sem gravar.
export async function POST(req: Request) {
  const user = await currentUser()
  const body = (await req.json().catch(() => ({}))) as { place?: unknown }
  if (user && isSharePlace(body.place) && allow(`share:${user.id}`, 20, 20 / 60)) await track(user.id, 'share_click', null, { lugar: body.place })
  return new NextResponse(null, { status: 204 })
}
