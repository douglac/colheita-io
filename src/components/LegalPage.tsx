import Link from 'next/link'
import { legalDate } from '@/game/legal'
import { LegalLinks } from './LegalLinks'

/** Moldura das páginas legais (Privacidade e Termos): título, data da última atualização e rodapé da empresa. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="legal">
      <h1>{title}</h1>
      <p className="muted small">Última atualização: {legalDate()}</p>
      {children}
      <p className="legal-back"><Link className="btn" href="/">🌱 Voltar ao jogo</Link></p>
      <LegalLinks />
    </main>
  )
}
