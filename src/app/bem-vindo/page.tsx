import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SignupForm } from '@/components/AuthForms'
import { GameLogo } from '@/components/GameLogo'
import { GAME_NAME } from '@/game/config'
import { signupEmail } from '@/server/auth'
import { inviteCard } from '@/server/game'
import { currentUser, INVITE_COOKIE, SIGNUP_COOKIE } from '@/server/session'

export const dynamic = 'force-dynamic'
export const metadata = { title: `Bem-vindo · ${GAME_NAME}`, robots: { index: false } }

// Primeiro acesso depois de confirmar o e-mail.
export default async function BemVindo() {
  if (await currentUser()) redirect('/fazenda')
  const jar = await cookies()
  const email = await signupEmail(jar.get(SIGNUP_COOKIE)?.value)
  if (!email) redirect('/')
  const invite = jar.get(INVITE_COOKIE)?.value
  const card = invite ? await inviteCard(invite) : null
  return (
    <main className="farm-screen">
      <div className="farm-screen-backdrop" aria-hidden="true" />
      <div className="farm-screen-content">
        <header className="farm-screen-hero"><GameLogo size="compact" as="div" /></header>
        <section className="farm-panel entry-panel" aria-labelledby="bem-vindo">
          <h1 className="entry-title" id="bem-vindo">Bem-vindo!</h1>
          <p className="entry-text">Falta pouco para a sua fazenda.</p>
          <SignupForm email={email} inviter={card?.handle} />
        </section>
      </div>
    </main>
  )
}
