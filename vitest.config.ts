import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  // e2e/ é do Playwright (npm run e2e).
  // PGlite abre arquivos locais; muitos workers simultâneos atrasam imports e causam timeouts espúrios.
  test: { include: ['tests/**/*.test.ts'], maxWorkers: 2 },
})
