import type { Metadata } from 'next'
import { FarmPeekScreen } from '@/components/FarmPeekScreen'
import { rankingReturn } from '@/game/vitrine-text'
import { GAME_NAME } from '@/game/config'
import { vitrineFarm } from '@/server/vitrine'

export const dynamic = 'force-dynamic'
// Fora dos buscadores: o link vence em 1–2 dias e a fazenda é de outra pessoa.
export const metadata: Metadata = { title: `Fazenda em destaque · ${GAME_NAME}`, robots: { index: false, follow: false } }

/** Fazenda do ranking em tela cheia, só para olhar. Aceita só o token opaco da vitrine (nunca id ou apelido). */
export default async function Espiar({ params, searchParams }: PageProps<'/espiar/[token]'>) {
  const { token } = await params
  const hit = await vitrineFarm(token).catch(() => null)
  // Só o que a cena e a HUD mostram: iniciais, nível e a fazenda (sem avatar).
  const body = hit && { initials: hit.initials, level: hit.level, farm: hit.farm }
  return <FarmPeekScreen token={token} body={body} returnTo={rankingReturn((await searchParams).voltar)} />
}
