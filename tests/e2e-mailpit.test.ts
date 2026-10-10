// Ponta a ponta do cadastro por e-mail com o Mailpit (Docker): pedir código, ler o e-mail na API do Mailpit,
// entrar, escolher apelido, sair e entrar de novo. Roda só com o servidor e o Mailpit no ar:
//   docker run -d --name cf-mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit
//   npm run dev   (MAIL_PROVIDER vazio = SMTP em localhost:1025)
//   E2E_BASE_URL=http://localhost:3100 npx vitest run tests/e2e-mailpit.test.ts
import { describe, expect, it } from 'vitest'

const BASE = process.env.E2E_BASE_URL
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025'

class Browser {
  jar = new Map<string, string>()
  async go(path: string, init: RequestInit = {}) {
    const res = await fetch(BASE + path, {
      ...init,
      redirect: 'manual',
      headers: { ...(init.headers ?? {}), cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '), 'user-agent': 'e2e-mailpit' },
    })
    for (const c of res.headers.getSetCookie()) {
      const [kv, ...attrs] = c.split(';')
      const [k, v] = [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)]
      const expired = attrs.some((a) => /max-age=0|expires=thu, 01 jan 1970/i.test(a.trim())) || v === ''
      if (expired) this.jar.delete(k)
      else this.jar.set(k, v)
    }
    return res
  }
  post(path: string, body: unknown) {
    return this.go(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  }
}

async function lastMailTo(email: string, after: number) {
  for (let i = 0; i < 40; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json() as { messages: { ID: string; Created: string }[] }
    const m = list.messages.find((x) => Date.parse(x.Created) >= after - 1000)
    if (m) return await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json() as { Subject: string; Text: string; HTML: string }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('e-mail não chegou no Mailpit')
}

describe.skipIf(!BASE)('e2e: cadastro por e-mail com o Mailpit', () => {
  it('pede código, lê no Mailpit, entra, escolhe apelido, sai e entra de novo (agora pelo link)', async () => {
    const stamp = Date.now().toString(36)
    const email = `e2e-${stamp}@example.com`
    const handle = `e2e_${stamp}`.slice(0, 20)
    const b = new Browser()

    let t0 = Date.now()
    expect((await b.post('/api/auth/request', { email })).status).toBe(200)
    const mail = await lastMailTo(email, t0)
    expect(mail.Subject).toMatch(/código para entrar/)
    const code = /(\d{6}) é o seu código/.exec(mail.Subject)![1]
    expect(mail.HTML).toContain('Entrar na fazenda')

    const wrong = await b.post('/api/auth/verify', { email, code: code === '000000' ? '111111' : '000000' })
    expect(wrong.status).toBe(400)
    const v = await b.post('/api/auth/verify', { email, code })
    expect(await v.json()).toMatchObject({ ok: true, next: '/bem-vindo' })
    expect(b.jar.has('cf_signup')).toBe(true)
    expect((await b.post('/api/auth/verify', { email, code })).status).toBe(400) // uso único

    const s = await b.post('/api/auth/signup', { handle, birthDate: '1988-03-15', acceptTerms: true })
    expect(await s.json()).toMatchObject({ ok: true, next: '/fazenda' })
    const farm = await b.go('/api/farm')
    expect(farm.status).toBe(200)
    expect((await farm.json()).me.handle).toBe(handle)

    expect((await b.post('/api/logout', {})).status).toBe(200)
    expect((await b.go('/api/farm')).status).toBe(401)

    // Entrar de novo: respeita o respiro de 30 s entre códigos e usa o link mágico do e-mail.
    expect((await b.post('/api/auth/request', { email })).status).toBe(429)
    await new Promise((r) => setTimeout(r, 31_000))
    t0 = Date.now()
    expect((await b.post('/api/auth/request', { email })).status).toBe(200)
    const mail2 = await lastMailTo(email, t0)
    const link = /\/entrar\?t=([A-Za-z0-9_-]+)/.exec(mail2.Text)![1]
    const page = await b.go(`/entrar?t=${link}`)
    expect(await page.text()).toContain('Entrar na fazenda')
    const v2 = await b.post('/api/auth/verify', { token: link })
    expect(await v2.json()).toMatchObject({ ok: true, next: '/fazenda' })
    expect((await (await b.go('/api/farm')).json()).me.handle).toBe(handle)
    expect((await b.post('/api/auth/verify', { token: link })).status).toBe(400) // link de uso único

    // Sair de todos os aparelhos derruba esta sessão também.
    expect((await b.post('/api/logout', { all: true })).status).toBe(200)
    expect((await b.go('/api/farm')).status).toBe(401)
  }, 60_000)
})
