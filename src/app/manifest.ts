import type { MetadataRoute } from 'next'
import { GAME_NAME, GAME_TAGLINE } from '@/game/config'

// PWA: "Adicionar à tela inicial" abre o jogo em tela cheia, sem barra do navegador.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: GAME_NAME,
    short_name: GAME_NAME,
    description: GAME_TAGLINE,
    start_url: '/fazenda',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#8cd23c',
    theme_color: '#8cd23c',
    lang: 'pt-BR',
    categories: ['games'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
