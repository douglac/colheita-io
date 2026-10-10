import { expect, test, type Locator, type Page } from '@playwright/test'
import { tokenMail } from '../src/server/mail-templates'

const EMAIL = 'otp-regression@example.com'
const CODE = '123456' // fictício; nunca usa códigos recebidos por e-mail

/** Copy/paste nativo: não atribui value nem despacha ClipboardEvent sintético. */
async function paste(page: Page, input: Locator, text: string, selection?: [number, number]) {
  await page.evaluate((value) => {
    const source = document.createElement('textarea')
    source.id = 'clipboard-source'
    source.value = value
    document.body.append(source)
    source.focus()
    source.select()
  }, text)
  await page.keyboard.press('ControlOrMeta+c')
  await page.locator('#clipboard-source').evaluate((el) => el.remove())
  await input.focus()
  if (selection) await input.evaluate((el: HTMLInputElement, [start, end]) => el.setSelectionRange(start, end), selection)
  await input.evaluate((el) => {
    delete el.dataset.trustedPaste
    el.addEventListener('paste', (e) => { el.dataset.trustedPaste = String(e.isTrusted) }, { once: true })
  })
  await page.keyboard.press('ControlOrMeta+v')
  await expect(input).toHaveAttribute('data-trusted-paste', 'true')
}

async function openCode(page: Page, outcome: { next?: string; abort?: boolean } = {}) {
  const requests: unknown[] = []
  await page.route('**/api/auth/request', (route) => route.fulfill({ json: { ok: true } }))
  // Mantém a verificação pendente para inspecionar valor e envios concorrentes.
  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/api/auth/verify', async (route) => {
    requests.push(route.request().postDataJSON())
    await pending
    if (outcome.abort) await route.abort('failed')
    else if (outcome.next) await route.fulfill({ json: { ok: true, next: outcome.next } })
    else await route.fulfill({ status: 400, json: { error: 'Código fictício de teste.' } })
  })
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Seu e-mail' }).fill(EMAIL)
  await page.getByRole('button', { name: 'Receber código' }).click()
  const input = page.getByRole('textbox', { name: 'Código de 6 números' })
  await expect(input).toBeVisible()
  return { input, requests, release }
}

test('cola código do HTML do e-mail sem perder o último dígito', async ({ page }, info) => {
  const mail = tokenMail('login', EMAIL, CODE, 'http://example.invalid/entrar', 15)
  const mailPage = await page.context().newPage()
  await mailPage.setContent(mail.html)
  const formatted = await mailPage.locator('span').innerText()
  expect(formatted).toBe('123 456')
  expect(mail.text).toContain('    123 456\n')
  await mailPage.close()
  const { input, requests, release } = await openCode(page)
  await paste(page, input, formatted)
  await page.screenshot({ path: info.outputPath('email-paste.png') })
  try {
    await expect(input).toHaveValue(CODE)
    await expect.poll(() => requests).toEqual([{ email: EMAIL, code: CODE, purpose: 'login' }])
  } finally { release() }
})

for (const [label, text] of [
  ['NBSP', '123\u00a0456'],
  ['bordas e quebras de linha', ' \t\r\n123\n456\r\n '],
  ['sem formatação', CODE],
  ['limite após limpeza', '123 4567'],
] as const) {
  test(`colagem: ${label}`, async ({ page }) => {
    const { input, requests, release } = await openCode(page)
    try {
      await paste(page, input, text)
      await expect(input).toHaveValue(CODE)
      await expect.poll(() => requests).toEqual([{ email: EMAIL, code: CODE, purpose: 'login' }])
    } finally { release() }
  })
}

for (const [label, initial, text, selection] of [
  ['substitui tudo', '99999', '123 456', [0, 5]],
  ['preserva prefixo e sufixo', '1296', '3 45', [2, 3]],
  ['insere no cursor', '126', '3 45', [2, 2]],
] as const) {
  test(`seleção: ${label}`, async ({ page }) => {
    const { input, requests, release } = await openCode(page)
    try {
      await input.pressSequentially(initial)
      await paste(page, input, text, [...selection])
      await expect(input).toHaveValue(CODE)
      await expect.poll(() => requests).toHaveLength(1)
    } finally { release() }
  })
}

test('incompleto não envia, nem por Enter ou submit direto', async ({ page }) => {
  const { input, requests, release } = await openCode(page)
  try {
    await paste(page, input, '123 45')
    await expect(input).toHaveValue('12345')
    await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeDisabled()
    expect(await input.evaluate((el: HTMLInputElement) => el.checkValidity())).toBe(false)
    await input.press('Enter')
    await input.evaluate((el: HTMLInputElement) => el.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    // Dá tempo para uma requisição incorreta sair, sem depender de resposta de rede.
    await page.waitForTimeout(150)
    expect(requests).toEqual([])
  } finally { release() }
})

test('digitação, backspace e tentativa nova após erro; só um envio pendente', async ({ page }) => {
  const { input, requests, release } = await openCode(page)
  try {
    await input.pressSequentially('12x3')
    await expect(input).toHaveValue('123')
    await input.press('Backspace')
    await expect(input).toHaveValue('12')
    await input.pressSequentially('3456')
    await expect.poll(() => requests).toHaveLength(1)
    await expect(input).toBeDisabled()
    await page.keyboard.press('Enter')
    await input.evaluate((el: HTMLInputElement) => {
      for (let i = 0; i < 2; i++) el.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await page.waitForTimeout(150)
    expect(requests).toHaveLength(1)
    release()
    await expect(page.getByRole('alert').filter({ hasText: 'Código fictício' })).toBeVisible()
    await expect(input).toBeEnabled()
    await expect(input).toHaveValue('')
    await paste(page, input, '123 456')
    await expect.poll(() => requests).toHaveLength(2)
  } finally { release() }
})

test('mantém contrato de one-time-code e inserção completa em um evento', async ({ page }) => {
  const { input, requests, release } = await openCode(page)
  try {
    await expect(input).toHaveAttribute('autocomplete', 'one-time-code')
    await expect(input).toHaveAttribute('inputmode', 'numeric')
    await expect(input).toHaveAttribute('pattern', '\\d{6}')
    await input.focus()
    // Exercita a inserção nativa em um evento; não simula a UI de autofill do sistema operacional.
    await page.keyboard.insertText('123 456')
    await expect(input).toHaveValue(CODE)
    await expect.poll(() => requests).toHaveLength(1)
  } finally { release() }
})

for (const [label, next] of [['login', '/fazenda'], ['cadastro', '/bem-vindo']] as const) {
  test(`${label}: envia uma vez e mantém a trava até a navegação`, async ({ page }) => {
    const { input, requests, release } = await openCode(page, { next })
    let releaseNavigation!: () => void
    const pendingNavigation = new Promise<void>((resolve) => { releaseNavigation = resolve })
    await page.route((url) => url.pathname === next, async (route) => {
      await pendingNavigation
      await route.abort()
    })
    try {
      await paste(page, input, '123 456')
      await expect.poll(() => requests).toHaveLength(1)
      const navigation = page.waitForRequest((req) => new URL(req.url()).pathname === next)
      release()
      await navigation
      await expect(input).toBeDisabled()
      await input.evaluate((el: HTMLInputElement) => {
        for (let i = 0; i < 2; i++) el.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      })
      await page.waitForTimeout(150)
      expect(requests).toEqual([{ email: EMAIL, code: CODE, purpose: 'login' }])
    } finally { release(); releaseNavigation() }
  })
}

test('falha de rede libera uma nova tentativa', async ({ page }) => {
  const { input, requests, release } = await openCode(page, { abort: true })
  try {
    await paste(page, input, '123 456')
    await expect.poll(() => requests).toHaveLength(1)
    release()
    await expect(page.getByRole('alert').filter({ hasText: 'Erro de conexão' })).toBeVisible()
    await expect(input).toBeEnabled()
    await expect(input).toHaveValue('')
    await paste(page, input, '123 456')
    await expect.poll(() => requests).toHaveLength(2)
  } finally { release() }
})
