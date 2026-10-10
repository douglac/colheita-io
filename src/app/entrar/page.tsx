import Link from 'next/link'
import { LinkConfirm } from '@/components/AuthForms'
import { GameLogo } from '@/components/GameLogo'
import { GAME_NAME } from '@/game/config'
import { peekLink } from '@/server/auth'

export const dynamic = 'force-dynamic'
export const metadata = { title: `Entrar · ${GAME_NAME}`, robots: { index: false } }

const LABEL = { login: 'Entrar na fazenda', link: 'Confirmar este e-mail', delete: 'Excluir minha conta para sempre' } as const

// Link mágico do e-mail. Não entra sozinho: o toque no botão confirma (robôs que abrem links não gastam o link).
export default async function Entrar({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const t = (await searchParams).t ?? ''
  const purpose = await peekLink(t)
  return (
    <main className="farm-screen">
      <div className="farm-screen-backdrop" aria-hidden="true" />
      <div className="farm-screen-content">
        <header className="farm-screen-hero"><GameLogo size="compact" /></header>
        <section className="farm-panel entry-panel" aria-label="Link do e-mail">
          {purpose ? (
            <>
              <p className="entry-text">{purpose === 'delete' ? 'Confirme: a fazenda, o celeiro e as amizades serão apagados.' : 'Tudo certo! Toque no botão para continuar.'}</p>
              <LinkConfirm token={t} label={LABEL[purpose]} danger={purpose === 'delete'} />
            </>
          ) : (
            <>
              <h2 className="entry-title">Link vencido</h2>
              <p className="entry-text">Esse link venceu ou já foi usado. Os links valem por 15 minutos e uma vez só.</p>
            </>
          )}
        </section>
        {!purpose && <Link className="farm-cta" href="/">Pedir um código novo <span aria-hidden="true">›</span></Link>}
      </div>
    </main>
  )
}
