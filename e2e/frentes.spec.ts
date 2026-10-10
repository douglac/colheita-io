// Fluxos de frentes que entram no main em paralelo (e-mail, pagamento, decoração).
// Cada teste confere se a frente já está no servidor; se não estiver, fica PENDENTE (skip com o motivo)
// e liga sozinho quando ela entrar.
import { expect, test } from '@playwright/test'
import { farm, loginDev, MAILPIT, routeExists, uniq } from './helpers'

test('login por e-mail com o link que chega no Mailpit', async ({ page }) => {
  test.skip(!(await routeExists(page.request, 'POST', '/api/auth/request')), 'frente de e-mail ainda não está no main')
  const mailpitUp = await fetch(`${MAILPIT}/api/v1/info`).then((r) => r.ok).catch(() => false)
  test.skip(!mailpitUp, `Mailpit fora do ar em ${MAILPIT}`)

  const email = `${uniq('e2e')}@teste.local`
  await page.goto('/')
  await page.locator('input[type="email"]').first().fill(email)
  await page.locator('input[type="email"]').first().press('Enter')

  // Espera o e-mail (até 15 s) e pega o link mágico.
  let link: string | undefined
  for (let i = 0; i < 30 && !link; i++) {
    const found = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`).then((r) => r.json())
    const id = found.messages?.[0]?.ID
    if (id) {
      const msg = await fetch(`${MAILPIT}/api/v1/message/${id}`).then((r) => r.json())
      link = String(msg.Text ?? '').match(/https?:\/\/\S+/g)?.find((u: string) => /auth|entrar|login|verify|token/i.test(u))
    }
    if (!link) await page.waitForTimeout(500)
  }
  expect(link, 'link do e-mail').toBeTruthy()
  await page.goto(link!)
  // O link não entra sozinho: um toque confirma (antivírus que abre links não gasta o link).
  const confirm = page.getByRole('button', { name: /entrar na fazenda/i })
  if (await confirm.isVisible().catch(() => false)) await confirm.click()
  // Conta nova vai escolher apelido e idade em /bem-vindo; conta antiga cai na fazenda.
  await expect(page).toHaveURL(/\/(fazenda|bem-vindo)/)
})

test('decoração: o martelo abre o modo edição', async ({ page }) => {
  await loginDev(page, uniq('e2e'))
  test.skip(!('decor' in (await farm(page))), 'frente de decoração ainda não está no main')
  await page.getByRole('button', { name: 'Arrumar a fazenda' }).click()
  await expect(page.getByRole('button', { name: 'Arrumar a fazenda' })).toHaveAttribute('aria-pressed', 'true')
})
