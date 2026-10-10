import Image from 'next/image'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { EmailLogin } from '@/components/AuthForms'
import { GameLogo } from '@/components/GameLogo'
import { LegalLinks } from '@/components/LegalLinks'
import { LoginForm } from '@/components/LoginForm'
import { FeaturedFarms, OnlineNow, VitrineLive } from '@/components/Vitrine'
import { avatarOf, avatarSrc } from '@/game/avatar'
import { GAME_TAGLINE, INVITE, SHARE_XP } from '@/game/config'
import { testLoginEnabled } from '@/server/flags'
import { inviteCard } from '@/server/game'
import { countDaily, isAutomated } from '@/server/metrics'
import { currentUser, INVITE_COOKIE } from '@/server/session'
import { parseShareCookie, SHARE_COOKIE } from '@/server/share-xp'
import { vitrineData, type VitrineData } from '@/server/vitrine'

export const dynamic = 'force-dynamic'

/** Ranking e contador já no HTML (cache de ~45 s). Se o banco demorar, a página sai sem eles e o navegador busca depois. */
async function vitrineFast(ms = 400): Promise<VitrineData | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<null>((r) => { timer = setTimeout(() => r(null), ms) })
  try {
    return await Promise.race([vitrineData().catch(() => null), late])
  } finally {
    clearTimeout(timer)
  }
}

export default async function Home() {
  if (await currentUser()) redirect('/fazenda')
  // Métricas: só +1 no dia (sem usuário, IP nem aparelho); robôs de prévia e prefetch não contam.
  if (!isAutomated(await headers())) await countDaily('lp_view')
  const jar = await cookies()
  const invite = jar.get(INVITE_COOKIE)?.value
  const card = invite ? await inviteCard(invite) : null
  const shared = parseShareCookie(jar.get(SHARE_COOKIE)?.value)
  const vitrine = await vitrineFast()
  return (
    <main className="farm-screen">
      <div className="farm-screen-backdrop" aria-hidden="true" />
      <VitrineLive initial={vitrine}>
        <div className="farm-screen-content">
          <header className="farm-screen-hero">
            <GameLogo preload />
            <p>{GAME_TAGLINE}</p>
            <OnlineNow />
          </header>
          <div className="entry-col">
            <section className="farm-panel entry-panel" aria-label="Entrar na fazenda">
              {card && (
                <>
                  <div className="invite-person">
                    <span className="invite-avatar"><Image src={avatarSrc(avatarOf(card.avatar, card.handle))} width={68} height={68} alt="" /></span>
                    <div>
                      <span className="invite-eyebrow">Convite de amigo</span>
                      <p><b>{card.handle}</b> te chamou para plantar junto!</p>
                    </div>
                  </div>
                  <ul className="invite-perks">
                    <li><Image src="/art/ui/coin.png" width={40} height={40} alt="" /><span>Entre com seu e-mail: você e {card.handle} ganham <b>+{INVITE.gold} de ouro</b>.</span></li>
                    {shared && <li><Image src="/art/ui/xp_star.png" width={40} height={40} alt="" /><span>E você ganha <b>+{SHARE_XP.xp} EXP</b> na sua fazenda.</span></li>}
                  </ul>
                  <div className="invite-divider" />
                </>
              )}
              <EmailLogin />
              <small className="entry-hint">Sem senha: mandamos um código de 6 números para o seu e-mail.</small>
            </section>
            {testLoginEnabled() && (
              <details className="test-login">
                <summary>Login de teste (só apelido)</summary>
                <LoginForm />
              </details>
            )}
          </div>
          <FeaturedFarms />
          <LegalLinks />
        </div>
      </VitrineLive>
    </main>
  )
}
