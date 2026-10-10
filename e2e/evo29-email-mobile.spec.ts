// Evo 29: entrada por e-mail no celular. Fonte >= 16 px (o iOS dá zoom no foco abaixo disso), nada mais largo que o
// painel de madeira em 320 px e e-mail longo sem ficar centralizado e cortado no começo.
// O cadastro precisa do código: lê no Mailpit ou, sem ele, no log do servidor de dev com MAIL_PROVIDER=console
// (E2E_MAIL_LOG=/caminho/do/log). Sem nenhum dos dois, o teste do cadastro é pulado.
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { MAILPIT } from './helpers'

const LONG = 'fulano.de.tal.com.nome.longo.demais@example.com'
const SIZES = [[320, 568], [375, 667], [390, 844], [412, 915]] as const

test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
test.skip(() => test.info().project.name !== 'celular', 'tamanhos de celular fixos; roda uma vez só')

/** Elementos do painel que passam da área de dentro da madeira (com 1 px de tolerância). */
function overflowing(page: Page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.entry-panel')!
    const p = panel.getBoundingClientRect()
    const cs = getComputedStyle(panel)
    const left = p.left + parseFloat(cs.borderLeftWidth), right = p.right - parseFloat(cs.borderRightWidth)
    return [...panel.querySelectorAll('*')].filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && (r.left < left - 1 || r.right > right + 1)
    }).map((el) => `${el.tagName.toLowerCase()}.${el.className}`)
  })
}

const fontPx = (page: Page, sel: string) => page.locator(sel).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize))

async function codeFor(page: Page, email: string) {
  for (let i = 0; i < 40; i++) {
    const log = process.env.E2E_MAIL_LOG
    if (log) {
      const m = [...readFileSync(log, 'utf8').matchAll(/\[mail\] para (\S+): (\d{6}) /g)].filter((x) => x[1] === email).pop()
      if (m) return m[2]
    } else {
      const found = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`).then((r) => r.json()).catch(() => null)
      const subject: string | undefined = found?.messages?.[0]?.Subject
      if (subject?.match(/^\d{6}/)) return subject.slice(0, 6)
    }
    await page.waitForTimeout(250)
  }
  return null
}

for (const [w, h] of SIZES) {
  test(`e-mail no celular ${w}x${h}: fonte, largura e e-mail longo`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/')
    const email = page.locator('.entry-panel input[name="email"]')
    await email.waitFor()
    expect(await fontPx(page, '.entry-panel input[name="email"]')).toBeGreaterThanOrEqual(16)
    await expect(email).toHaveAttribute('autocomplete', 'email')
    await expect(email).toHaveAttribute('inputmode', 'email')
    await expect(email).toHaveAttribute('enterkeyhint', 'send')
    expect(await overflowing(page)).toEqual([])

    await email.click()
    await email.pressSequentially(LONG, { delay: 2 })
    const st = await email.evaluate((el: HTMLInputElement) => ({
      align: getComputedStyle(el).textAlign, scrollLeft: el.scrollLeft, overflow: el.scrollWidth > el.clientWidth,
    }))
    // Centralizado + texto maior que o campo = começo e fim cortados. Alinhado à esquerda, o cursor no fim mostra o fim.
    expect(st.align).not.toBe('center')
    if (st.overflow) expect(st.scrollLeft).toBeGreaterThan(0)
    expect(await overflowing(page)).toEqual([])
  })
}

test('código e cadastro cabem em 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': `10.29.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` })
  await page.goto('/')
  const to = `evo29.${Date.now().toString(36)}@example.com`
  await page.locator('.entry-panel input[name="email"]').fill(to)
  await page.getByRole('button', { name: 'Receber código' }).click()
  const code = page.locator('.code-input')
  await code.waitFor()
  expect(await fontPx(page, '.code-input')).toBeGreaterThanOrEqual(16)
  await expect(code).toHaveAttribute('autocomplete', 'one-time-code')
  await code.fill('000000')
  expect(await code.evaluate((el: HTMLInputElement) => el.scrollWidth <= el.clientWidth)).toBe(true)
  await code.fill('')
  expect(await overflowing(page)).toEqual([])

  const c = await codeFor(page, to)
  test.skip(!c, 'sem Mailpit nem E2E_MAIL_LOG: não dá para ler o código')
  await code.fill(c!)
  await page.waitForURL(/\/bem-vindo/)
  await page.locator('input[name="handle"]').waitFor()
  for (const sel of ['input[name="handle"]', 'input[name="birthDate"]']) expect(await fontPx(page, sel)).toBeGreaterThanOrEqual(16)
  expect(await overflowing(page)).toEqual([])
  const [hHandle, hDate] = await Promise.all(['input[name="handle"]', 'input[name="birthDate"]'].map((s) => page.locator(s).evaluate((el) => el.getBoundingClientRect().height)))
  expect(Math.abs(hHandle - hDate)).toBeLessThanOrEqual(1)
  await page.getByRole('button', { name: /faixa de idade/ }).click()
  expect(await fontPx(page, 'select[name="ageBand"]')).toBeGreaterThanOrEqual(16)
  expect(await overflowing(page)).toEqual([])
})
