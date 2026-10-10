import type { Metadata } from 'next'
import Image from 'next/image'
import { GameLogo } from '@/components/GameLogo'
import { avatarOf, avatarSrc } from '@/game/avatar'
import { GAME_NAME, INVITE, SHARE_XP } from '@/game/config'
import { headers } from 'next/headers'
import { inviteCard } from '@/server/game'
import { isAutomated, trackInviteOpen } from '@/server/metrics'
import { currentUser } from '@/server/session'
import { shareLevel } from '@/server/share-xp'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ n?: string | string[] }> }

/** Link de level-up (?n=<nível>): vale se quem compartilhou já chegou nesse nível. */
const levelOf = (n: unknown, card: { level: number } | null) => {
  const level = shareLevel(n)
  return level && card && level <= card.level ? level : null
}

// Prévia do link no WhatsApp: título com quem convidou + imagem da fazenda (opengraph-image.tsx).
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const card = await inviteCard((await params).code)
  const level = levelOf((await searchParams).n, card)
  const title = card && level ? `${card.handle} subiu para o nível ${level} no ${GAME_NAME}! Quem abrir ganha ${SHARE_XP.xp} EXP`
    : card ? `${card.handle} te chamou para plantar junto no ${GAME_NAME}` : `${GAME_NAME}: vem plantar (e roubar) com a gente`
  const description = 'Planta, colhe e, com jeitinho, pega da horta dos amigos. Joga no celular, sem instalar.'
  return { title, description, openGraph: { title, description, type: 'website', locale: 'pt_BR' }, twitter: { card: 'summary_large_image', title, description } }
}

export default async function Invite({ params, searchParams }: Props) {
  const { code } = await params
  const card = await inviteCard(code)
  const level = levelOf((await searchParams).n, card)
  // Métricas: alguém (não o robô da prévia do WhatsApp) abriu o convite.
  if (card && !isAutomated(await headers())) await trackInviteOpen(code, (await currentUser())?.id ?? null, level)
  return (
    <main className="farm-screen">
      <div className="farm-screen-backdrop" aria-hidden="true" />
      <div className="farm-screen-content">
        <header className="farm-screen-hero">
          <GameLogo preload />
          <p>Uma fazenda espera por você!</p>
        </header>
        <section className="farm-panel" aria-label="Convite para a fazenda">
          {card ? (
            <>
              <div className="invite-person">
                <span className="invite-avatar"><Image src={avatarSrc(avatarOf(card.avatar, card.handle))} width={68} height={68} alt="" /></span>
                <div>
                  <span className="invite-eyebrow">Convite de amigo</span>
                  {level
                    ? <p><b>{card.handle}</b> subiu para o nível {level}!</p>
                    : <p><b>{card.handle}</b> te chamou para plantar junto!</p>}
                  <span className="invite-level">Fazendeiro nível {card.level}</span>
                </div>
              </div>
              <div className="invite-divider" />
              <ul className="invite-perks">
                {level && <li><Image src="/art/ui/xp_star.png" width={40} height={40} alt="" /><span>Ganhe <b>+{SHARE_XP.xp} EXP</b> na sua fazenda (até {SHARE_XP.perViewerDay} links por dia).</span></li>}
                <li><Image src="/art/ui/coin.png" width={40} height={40} alt="" /><span>Você e {card.handle} ganham <b>+{INVITE.gold} de ouro</b> ao entrar.</span></li>
                <li><Image src="/art/ui/seed_sack.png" width={40} height={40} alt="" /><span>Comece com sementes de <b>nabo e cenoura</b> de presente.</span></li>
                {card.ripe > 0 && <li><Image src="/art/ui/hand_steal.png" width={40} height={40} alt="" /><span>A horta de {card.handle} tem <b>{card.ripe} {card.ripe === 1 ? 'lote maduro' : 'lotes maduros'}</b> agora…</span></li>}
              </ul>
            </>
          ) : <p className="invite-missing">Esse convite não existe mais, mas a fazenda está aberta para você.</p>}
        </section>
        {/* A rota de API redireciona e grava o cookie de convite. */}
        <a className="farm-cta" href={`/api/invite/${encodeURIComponent(code)}${level ? `?n=${level}` : ''}`}>Entrar na fazenda <span aria-hidden="true">›</span></a>
        <small className="farm-footnote">Joga no navegador do celular, sem instalar nada.</small>
      </div>
    </main>
  )
}
