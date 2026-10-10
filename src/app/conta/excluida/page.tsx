import Link from 'next/link'
import { GameLogo } from '@/components/GameLogo'
import { GAME_NAME } from '@/game/config'

export const metadata = { title: `Conta excluída · ${GAME_NAME}`, robots: { index: false } }

export default function Excluida() {
  return (
    <main className="farm-screen">
      <div className="farm-screen-backdrop" aria-hidden="true" />
      <div className="farm-screen-content">
        <header className="farm-screen-hero"><GameLogo size="compact" as="div" /></header>
        <section className="farm-panel entry-panel" aria-labelledby="ate-logo">
          <h1 className="entry-title" id="ate-logo">Até logo!</h1>
          <p className="entry-text">Sua conta e os dados dela foram excluídos. Se um dia bater saudade, é só plantar de novo.</p>
        </section>
        <Link className="farm-cta" href="/">Voltar ao início <span aria-hidden="true">›</span></Link>
      </div>
    </main>
  )
}
