import { NextResponse } from 'next/server'
import { publicKey, subscribe, unsubscribe, type PushSub } from '@/server/push'
import { track } from '@/server/metrics'
import { allow, tooMany } from '@/server/ratelimit'
import { currentUser } from '@/server/session'

// GET: chave pública para o navegador assinar. POST: guarda a assinatura. DELETE: cancela.
export async function GET() {
  return NextResponse.json({ key: publicKey() })
}

export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Faça login' }, { status: 401 })
  if (!allow(`push:${user.id}`, 10, 10 / 60)) return tooMany()
  const sub = (await req.json()) as PushSub
  if (!sub?.endpoint?.startsWith('https://') || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: 'Assinatura inválida' }, { status: 400 })
  }
  await subscribe(user.id, sub)
  await track(user.id, 'push_optin')
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const { endpoint } = (await req.json()) as { endpoint?: string }
  if (endpoint) await unsubscribe(endpoint)
  return NextResponse.json({ ok: true })
}
