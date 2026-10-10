import type { Metadata, Viewport } from 'next'
import { GAME_NAME, GAME_TAGLINE, isStaging } from '@/game/config'
import './globals.css'
import './decor.css'

export const metadata: Metadata = {
  title: GAME_NAME,
  description: GAME_TAGLINE,
  // Instalado na tela inicial do iPhone: abre em tela cheia, como app.
  appleWebApp: { capable: true, title: GAME_NAME, statusBarStyle: 'black-translucent' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
}
// Jogo: o zoom é do próprio jogo (pinça na fazenda), não da página. viewport-fit=cover usa a tela toda
// e o CSS respeita os recortes (notch, barra do iPhone) com env(safe-area-inset-*).
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: 'cover', themeColor: '#8cd23c',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        {isStaging() && <div className="staging-badge" aria-hidden>versão de teste</div>}
      </body>
    </html>
  )
}
