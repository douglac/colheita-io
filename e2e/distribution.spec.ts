import { expect, test } from '@playwright/test'
import { loginDev, farm, uniq, closeOverlays } from './helpers'

test('base comunitária: login local, compra por ouro, plantio, colheita e cobrança indisponível', async ({ page, baseURL }) => {
  if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) throw new Error('Smoke permitido somente no servidor local')
  // Também bloqueia recursos externos no navegador: este teste não usa e-mail nem serviços de produção.
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort()
  })
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await loginDev(page, uniq('base'))
  const before = await farm(page)
  const buy = await page.request.post('/api/action', { data: { type: 'buy', itemId: 'semente:nabo', qty: 1 } })
  expect(buy.ok(), await buy.text()).toBe(true)
  expect((await farm(page)).me.gold).toBeLessThan(before.me.gold)
  const plant = await page.request.post('/api/action', { data: { type: 'plant', idx: 0, seedId: 'nabo' } })
  expect(plant.ok(), await plant.text()).toBe(true)
  const ready = await page.request.post('/api/dev', { data: { stage: 5, stagePlots: [0] } })
  expect(ready.ok(), await ready.text()).toBe(true)
  const harvest = await page.request.post('/api/action', { data: { type: 'harvest', idx: 0 } })
  expect(harvest.ok(), await harvest.text()).toBe(true)
  expect((await farm(page)).inventory.some((i: { itemId: string; qty: number }) => i.itemId === 'nabo' && i.qty > 0)).toBe(true)
  await page.reload()
  await closeOverlays(page)
  await page.getByRole('button', { name: 'Comprar moedas' }).click()
  await expect(page.getByText('Compras com dinheiro indisponíveis')).toBeVisible()
  for (const url of ['/api/pay', '/api/pay/fake', '/api/pay/birth', '/api/pay/order/any', '/api/pay/webhook/fake', '/api/pay/webhook/stripe', '/api/pay/webhook/mercadopago', '/api/admin/pay', '/api/admin/metricas']) {
    expect((await page.request.get(url)).status(), url).toBe(404)
    expect((await page.request.post(url, { data: { provider: 'fake', outcome: 'approve' } })).status(), url).toBe(404)
  }
  expect((await farm(page)).me.gold).toBeGreaterThanOrEqual(0)
  expect(errors).toEqual([])
})
