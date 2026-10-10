// O ciclo do jogo pela interface, no desktop e no celular: entrar, plantar, colher, vender, visitar o amigo e roubar.
import { expect, request as pwRequest, test } from '@playwright/test'
import { ageAccount, apiLogin, farm, loginDev, nextAction, ripenAll, tapPlot, tapPlotAction, uniq, waitScene } from './helpers'

test('login de teste abre a fazenda', async ({ page }) => {
  const me = uniq('e2e')
  await loginDev(page, me)
  await expect(page.getByTestId('gold')).toBeVisible()
  const f = await farm(page)
  expect(f.me.handle).toBe(me)
  expect(f.plots.length).toBeGreaterThanOrEqual(6)
})

test('plantar, colher e vender', async ({ page }) => {
  const me = uniq('e2e')
  await loginDev(page, me)

  // Lote vazio + seta: abre os pertences para escolher a semente.
  await tapPlot(page, 0)
  const nabo = page.locator('.bag .slot', { hasText: 'Nabo' })
  await expect(nabo).toBeVisible()
  const planted = nextAction(page)
  await nabo.click()
  expect((await planted).status).toBe(200)
  expect((await farm(page)).plots[0].state).toBe('growing')

  // Adianta o relógio: a horta amadurece. Toque no lote maduro = colher.
  await ripenAll(me)
  await page.reload()
  await waitScene(page)
  const h = await tapPlotAction(page, 0)
  expect(h.status, JSON.stringify(h.body)).toBe(200)
  expect(h.body.message).toMatch(/Colheu/)
  const goldBefore = (await farm(page)).me.gold

  // Depósito > Vender tudo > confirmar.
  await page.locator('[data-barn]:visible').first().click() // HUD no desktop, barra de abas no celular
  await page.getByRole('button', { name: 'Vender tudo' }).click()
  const sold = nextAction(page)
  await page.getByRole('alertdialog').getByRole('button', { name: 'Vender' }).click()
  expect((await sold).status).toBe(200)
  await expect(page.getByText('Vendido!')).toBeVisible()
  expect((await farm(page)).me.gold).toBeGreaterThan(goldBefore)
})

test('visitar o amigo pela faixa de vizinhos e roubar', async ({ page, baseURL }) => {
  const me = uniq('e2e')
  const friend = uniq('amigo')
  // O amigo planta 3 nabos (pela API, em outra sessão) e a horta dele amadurece.
  const other = await pwRequest.newContext({ baseURL })
  await apiLogin(other, friend)
  for (const idx of [0, 1, 2]) {
    const r = await other.post('/api/action', { data: { type: 'plant', idx, seedId: 'nabo' } })
    expect(r.ok(), await r.text()).toBeTruthy()
  }
  await ripenAll(friend)

  await loginDev(page, me)
  await ageAccount(me) // conta nova não rouba de amigo (quarentena)
  const add = await page.request.post('/api/action', { data: { type: 'add_friend', handle: friend } })
  expect(add.ok(), await add.text()).toBeTruthy()
  await page.reload()
  await waitScene(page)

  // Desktop: faixa de vizinhos embaixo. Celular: a faixa pode ficar fora da tela; aí entra pelo link direto.
  const nb = page.getByRole('region', { name: 'Vizinhos' }).getByRole('link', { name: new RegExp(friend) })
  if (await nb.isVisible().catch(() => false)) await nb.click()
  else await page.goto(`/fazenda/${friend}`)
  await expect(page).toHaveURL(new RegExp(`/fazenda/${friend}`))
  await waitScene(page)

  const s = await tapPlotAction(page, 0)
  expect(s.status, JSON.stringify(s.body)).toBe(200)
  const inv = (await farm(page)).inventory as { itemId: string; qty: number }[]
  const got = inv.find((i) => i.itemId === 'nabo')?.qty ?? 0
  // A mordida do cachorro é sorte; sem cachorro na horta do amigo, o toque sempre leva algo.
  expect(got).toBeGreaterThan(0)
  await other.dispose()
})
