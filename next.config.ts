import type { NextConfig } from 'next'
import { assertLegalReady } from './src/game/legal'

// colheita.io (APP_ENV=production): o build reprova se os dados das páginas legais estiverem vazios ou [ENTRE COLCHETES].
assertLegalReady(process.env.APP_ENV)

const isDev = process.env.NODE_ENV !== 'production'

// Cabeçalhos de segurança. A CSP aceita o que o jogo usa: Pixi (WebGL, texturas em blob:/data:, sem eval graças a
// 'pixi.js/unsafe-eval' na cena), SSE e fetch no próprio domínio, service worker de push e link do WhatsApp.
// 'unsafe-inline' em script/style: o Next injeta scripts inline de hidratação; para tirar, trocar por nonce num proxy.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' data: blob:${isDev ? ' ws: wss:' : ''}`,
  "worker-src 'self' blob:",
  "media-src 'self' data: blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self)' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // HSTS só no build de produção. Por http:// (perfil prod-local do Docker) o navegador ignora, como manda a norma.
  ...(!isDev ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }] : []),
]

const nextConfig: NextConfig = {
  // Resolve e empacota somente arquivos desta instalação.
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  // Imagem Docker pequena: .next/standalone leva só os arquivos que o servidor usa (ver Dockerfile).
  output: 'standalone',
  poweredByHeader: false,
  // PGlite carrega WASM e arquivos de dados próprios; não deve passar pelo bundler.
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  // A ficha da loja calcula os tempos no navegador com a mesma aceleração do servidor (só testes locais).
  // QA em paralelo: cookies não separam por porta, então cada frente usa um host (localhost, 127.0.0.1) no dev.
  allowedDevOrigins: ['127.0.0.1', '*.localhost'],
  // EVENTS_FORCE=natal mostra os itens de um evento fora da época (só QA; src/game/config.ts).
  // APP_ENV=staging (servidor de teste) mostra a faixa "versão de teste" (src/app/layout.tsx); production não mostra.
  env: {
    NEXT_PUBLIC_GROWTH_SPEED: process.env.GROWTH_SPEED || '1',
    NEXT_PUBLIC_EVENTS_FORCE: process.env.EVENTS_FORCE || '',
    NEXT_PUBLIC_APP_ENV: process.env.APP_ENV || '',
  },
  // www.colheita.io aponta para a mesma máquina: manda para o domínio sem www (cookies e links num host só).
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.colheita.io' }],
        destination: 'https://colheita.io/:path*',
        permanent: true,
      },
    ]
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Arte e ícones (public/): o padrão do Next é max-age=0, e o jogador que volta todo dia revalidava ~600
      // arquivos a cada entrada. Os nomes não têm hash (lote novo troca o arquivo no mesmo nome): 1 h fresco e,
      // depois, serve o guardado enquanto confere em segundo plano.
      { source: '/(art|icons)/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=604800' }] },
    ]
  },
}

export default nextConfig
