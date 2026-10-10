import { subscribe } from '@/server/hub'
import { allow, tooMany } from '@/server/ratelimit'
import { currentUser } from '@/server/session'

export const dynamic = 'force-dynamic'

// SSE: avisa o dono em tempo real quando alguém mexe na fazenda dele.
export async function GET(req: Request) {
  const user = await currentUser()
  if (!user) return new Response('unauthorized', { status: 401 })
  // Reconectar é normal (rede do celular); abrir dezenas de conexões por minuto não.
  if (!allow(`sse:${user.id}`, 20, 20 / 60)) return tooMany()
  const enc = new TextEncoder()
  let cleanup = () => {}
  const stream = new ReadableStream({
    start(ctrl) {
      const send = (data: unknown) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`))
      send({ kind: 'hello' })
      const unsub = subscribe(user.id, send)
      const ping = setInterval(() => ctrl.enqueue(enc.encode(': ping\n\n')), 25_000)
      cleanup = () => { unsub(); clearInterval(ping) }
      req.signal.addEventListener('abort', () => { cleanup(); try { ctrl.close() } catch {} })
    },
    cancel() { cleanup() },
  })
  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' },
  })
}
