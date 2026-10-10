// Testes de ponta a ponta (npm run e2e), no desktop e no celular.
// Rodam contra um servidor de verdade com Postgres (padrão: o perfil prod-local do Docker em http://localhost:3200):
//   docker compose --profile prod-local up -d --build && npm run e2e
// Outro alvo: E2E_BASE_URL=http://localhost:3100 DATABASE_URL=… npm run e2e
// O banco é usado só para "adiantar o relógio" (amadurecer a horta, tirar a quarentena de conta nova).
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // O jogo pede notificação depois do 1º plantio: nega de cara para o diálogo do navegador não aparecer.
    permissions: [],
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'celular', use: { ...devices['Pixel 7'] } },
  ],
})
