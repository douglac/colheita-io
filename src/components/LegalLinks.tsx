import Link from 'next/link'
import { GAME_NAME } from '@/game/config'
import { LEGAL } from '@/game/legal'

/** Rodapé: © do jogo e os links de Termos e Privacidade. */
export function LegalLinks() {
  return (
    <footer className="legal-links">
      <nav><Link href="/termos">Termos de Uso</Link> · <Link href="/privacidade">Privacidade</Link></nav>
      <small className="legal-company">© {LEGAL.updated.slice(0, 4)} {GAME_NAME}</small>
    </footer>
  )
}
