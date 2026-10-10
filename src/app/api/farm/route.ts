import { NextResponse } from 'next/server'
import { loadFarm } from '@/server/game'
import { fail } from '@/server/http'
import { trackOpen } from '@/server/metrics'
import { allow, tooMany } from '@/server/ratelimit'
import { currentUser, renewSession } from '@/server/session'

export async function GET(req: Request) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Faça login' }, { status: 401 })
  // Visitas: rajada de 30 e depois 2 por segundo (pular de vizinho em vizinho cabe; raspar todas as fazendas não).
  if (!allow(`farm:${user.id}`, 30, 2)) return tooMany('Calma, fazendeiro! Muitas visitas seguidas.')
  try {
    const owner = new URL(req.url).searchParams.get('owner') ?? undefined
    const res = NextResponse.json(await loadFarm(user.id, owner))
    await trackOpen(user.id) // sessão: aberturas com menos de 30 min entre elas contam uma vez só
    await renewSession(res) // quem joga não cai: a sessão de 30 dias renova a cada dia de uso
    return res
  } catch (e) {
    return fail(e)
  }
}
