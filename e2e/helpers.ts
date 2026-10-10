import { expect, type APIRequestContext, type Page } from '@playwright/test'
import pg from 'pg'

export const DB_URL = process.env.DATABASE_URL ?? 'postgres://colheita:colheita@localhost:5433/colheita'
export const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025'

let pool: pg.Pool | null = null
export function sql<T = Record<string, unknown>>(q: string, params: unknown[] = []) {
  pool ??= new pg.Pool({ connectionString: DB_URL, max: 2 })
  return pool.query(q, params).then((r) => r.rows as T[])
}

/** Apelido único por teste e projeto (desktop/celular rodam o mesmo teste). */
export const uniq = (prefix: string) => `${prefix}_${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 100)}`.slice(0, 20)

/** Login de teste (só apelido). Usa o formulário se a página inicial tiver um; senão, a API. */
export async function loginDev(page: Page, handle: string) {
  // Sem o tutorial do Seu Zé (Coach.tsx guarda o passo em cf:coach:<apelido>): ele cobre a sacola e os lotes.
  await page.addInitScript((h) => localStorage.setItem(`cf:coach:${h}`, 'done'), handle)
  await page.goto('/')
  const field = page.locator('input[name="handle"]')
  // Com o login por e-mail, o de teste fica recolhido num <details> "Login de teste".
  const summary = page.locator('summary', { hasText: /login de teste/i })
  if (!(await field.isVisible().catch(() => false)) && (await summary.isVisible().catch(() => false))) await summary.click()
  if (await field.isVisible().catch(() => false)) {
    await field.fill(handle)
    await page.getByRole('button', { name: /entrar na fazenda/i }).click()
  } else {
    const r = await page.request.post('/api/login', { data: { handle } })
    expect(r.ok(), await r.text()).toBeTruthy()
    await page.goto('/fazenda')
  }
  await expect(page).toHaveURL(/\/fazenda/)
  await waitScene(page)
}

/** Cria/entra numa conta só pela API (para o "amigo" de um teste). */
export async function apiLogin(request: APIRequestContext, handle: string) {
  const r = await request.post('/api/login', { data: { handle } })
  expect(r.ok(), await r.text()).toBeTruthy()
}

export async function waitScene(page: Page) {
  await page.getByTestId('scene').locator('canvas').waitFor()
  await page.waitForFunction(() => {
    const f = (window as unknown as { __cfPlotPoint?: (i: number) => unknown }).__cfPlotPoint
    return !!f && !!f(0)
  })
  await closeOverlays(page)
}

/** Fecha o que cobre a fazenda no 1º acesso (bônus diário, convites, pedido de aviso). */
export async function closeOverlays(page: Page) {
  // Tutorial do Seu Zé (1º acesso): cobre a sacola. Os testes pulam.
  const skip = page.getByText('Pular tutorial')
  if (await skip.isVisible().catch(() => false)) await skip.click()
  for (let i = 0; i < 4; i++) {
    const btn = page.locator('.dialog .close, .share-hook .close, [role="dialog"] button[aria-label="Fechar"]').first()
    if (!(await btn.isVisible().catch(() => false))) break
    await btn.click().catch(() => {})
    await page.waitForTimeout(200)
  }
}

/** Toca no lote `idx` da cena (Pixi): mouse no desktop, toque no celular. */
export async function tapPlot(page: Page, idx: number) {
  const where = () => page.evaluate((i) => (window as unknown as { __cfPlotPoint: (i: number) => { x: number; y: number } | null }).__cfPlotPoint(i), idx)
  // A câmera se ajusta logo depois de carregar (enquadramento, zoom do celular): espera o lote parar no lugar.
  let p = await where()
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150)
    const q = await where()
    if (p && q && Math.abs(p.x - q.x) < 1 && Math.abs(p.y - q.y) < 1) break
    p = q
  }
  if (!p) throw new Error(`lote ${idx} fora da cena`)
  if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) await page.touchscreen.tap(p.x, p.y)
  else await page.mouse.click(p.x, p.y)
}

/** Toca no lote e devolve a resposta da ação; se o toque não virar ação em 4 s (cena ainda montando), toca de novo. */
export async function tapPlotAction(page: Page, idx: number) {
  for (let i = 0; ; i++) {
    const res = nextAction(page)
    await tapPlot(page, idx)
    const r = await Promise.race([res, page.waitForTimeout(4000).then(() => null)])
    if (r || i >= 2) return r ?? res
  }
}

/** Espera a próxima resposta de POST /api/action e devolve o JSON. */
export function nextAction(page: Page) {
  return page.waitForResponse((r) => r.url().includes('/api/action') && r.request().method() === 'POST')
    .then(async (r) => ({ status: r.status(), body: await r.json() }))
}

export async function farm(page: Page, owner?: string) {
  const r = await page.request.get(`/api/farm${owner ? `?owner=${owner}` : ''}`)
  expect(r.ok()).toBeTruthy()
  return r.json()
}

/** "Adianta o relógio": todos os lotes plantados do jogador ficam maduros agora. */
export async function ripenAll(handle: string) {
  await sql(`update plots set planted_at = now() - (ready_at - planted_at) - interval '1 minute', ready_at = now() - interval '1 minute',
               dry_at = null, nat_pest_at = null, nat_weed_at = null, pests = 0, weeds = 0
             where seed_id is not null and owner_id = (select id from users where handle = $1)`, [handle])
}

/** Conta "antiga": passa da quarentena de roubo de conta nova. */
export async function ageAccount(handle: string) {
  await sql("update users set created_at = now() - interval '2 days' where handle = $1", [handle])
}

export async function routeExists(request: APIRequestContext, method: 'GET' | 'POST', path: string) {
  const r = method === 'GET' ? await request.get(path) : await request.post(path, { data: {} })
  return r.status() !== 404
}
