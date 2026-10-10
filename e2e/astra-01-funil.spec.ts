// Opt-in: servidor local com MAIL_PROVIDER=console, banco exclusivo astra01_* e login de fixture em staging.
import { readFile } from 'node:fs/promises'
import { test, expect, request as pwRequest } from '@playwright/test'
import pg from 'pg'
import { INVITE, SHARE_XP } from '../src/game/config'
import { waitScene, tapPlotAction, farm } from './helpers'

const logFile = process.env.ASTRA01_MAIL_LOG
const dbUrl = process.env.DATABASE_URL
const local = (url: string) => ['localhost', '127.0.0.1'].includes(new URL(url).hostname)
test.skip(!logFile, 'Defina ASTRA01_MAIL_LOG para o log do transporte console local.')
test.use({ launchOptions: { args: ['--mute-audio'] } })
let pool: pg.Pool

test.beforeAll(async ({ baseURL }) => {
  if (!baseURL || !local(baseURL) || !dbUrl || !local(dbUrl) || !new URL(dbUrl).pathname.startsWith('/astra01_')) {
    throw new Error('Este teste só roda em localhost com banco exclusivo astra01_*.')
  }
  pool = new pg.Pool({ connectionString: dbUrl, max: 2 })
})
test.afterAll(async () => { await pool?.end() })

for (const switched of [true, false]) {
  test(`convite → e-mail local → cadastro → amizade/bônus → primeiro roubo (${switched ? 'troca A por B' : 'XP do nível'})`, async ({ page, baseURL }) => {
    const suffix = Date.now().toString(36)
    const a = `a_${suffix}`, b = `b_${suffix}`, guest = `g_${suffix}`
    const email = `${guest}@example.test`
    await page.addInitScript(h => {
      localStorage.setItem('cf:sound', JSON.stringify({ sfx: false, music: false, sfxVol: 0, musicVol: 0 }))
      localStorage.setItem(`cf:coach:${h}`, 'done')
    }, guest)
    const fixture = await pwRequest.newContext({ baseURL })
    try {
      for (const handle of [a, b]) {
        const r = await fixture.post('/api/login', { data: { handle } })
        expect(r.status(), await r.text()).toBe(200)
      }
      await pool.query('update users set level = 5 where handle = $1', [a])
      const rows = (await pool.query('select id, handle, invite_code, gold from users where handle = any($1)', [[a, b]])).rows
      const alice = rows.find(r => r.handle === a)!, inviter = rows.find(r => r.handle === (switched ? b : a))!
      await page.goto(`/c/${alice.invite_code}?n=5`)
      await page.getByRole('link', { name: /Entrar na fazenda/ }).click()
      if (switched) {
        await page.goto(`/c/${inviter.invite_code}`)
        await page.getByRole('link', { name: /Entrar na fazenda/ }).click()
      }
      await page.getByRole('textbox', { name: 'Seu e-mail' }).fill(email)
      await page.getByRole('button', { name: 'Receber código', exact: true }).click()
      let code = ''
      await expect.poll(async () => {
        const log = await readFile(logFile!, 'utf8')
        code = new RegExp(`\\[mail\\] para ${email.replaceAll('.', '\\.')}:[^\\n]*?(\\d{6})`).exec(log)?.[1] ?? ''
        return code
      }).toMatch(/^\d{6}$/)
      await page.getByRole('textbox', { name: 'Código de 6 números' }).fill(code)
      await expect(page).toHaveURL(/\/bem-vindo/)
      await page.locator('input[name=handle]').fill(guest)
      await page.locator('input[name=birthDate]').fill('1990-05-10')
      await page.getByRole('checkbox', { name: /Li e aceito/ }).check()
      await page.getByRole('button', { name: /Começar minha fazenda/ }).click()
      await expect(page).toHaveURL(/\/fazenda$/)
      await waitScene(page)
      const me = (await pool.query('select id, xp from users where handle = $1', [guest])).rows[0]
      expect(me.xp).toBe(switched ? 0 : SHARE_XP.xp)
      expect((await pool.query('select friend_id, via from friendships where user_id = $1', [me.id])).rows).toEqual([{ friend_id: inviter.id, via: 'invite' }])
      expect((await pool.query('select gold, dog from users where id = $1', [inviter.id])).rows[0]).toEqual({ gold: inviter.gold + INVITE.gold, dog: 'vira_lata' })
      expect((await pool.query('select * from share_claims where viewer_id = $1', [me.id])).rows).toHaveLength(switched ? 0 : 1)
      const blocked = await page.request.post('/api/action', { data: { type: 'steal', owner: inviter.handle, idx: 0 } })
      expect(blocked.status()).toBe(400)
      expect((await blocked.json()).error).toMatch(/Fazendeiro novo/)
      // Fixture: adianta quarentena e safra; cachorro do bônus dorme para não depender de sorte.
      await pool.query("update users set created_at = now() - interval '2 days' where id = $1", [me.id])
      await pool.query("update users set dog_fed_until = now() - interval '1 minute' where id = $1", [inviter.id])
      await pool.query(`update plots set seed_id = 'nabo', sow_seq = sow_seq + 1, planted_at = now() - interval '1 hour',
        ready_at = now() - interval '1 minute', yield_total = 20, yield_left = 20, withered = false,
        dry_at = null, dry_ms = 0, nat_pest_at = null, nat_weed_at = null, pests = 0, weeds = 0
        where owner_id = $1 and idx = 0`, [inviter.id])
      await page.goto(`/fazenda/${inviter.handle}`)
      await waitScene(page)
      const stolen = await tapPlotAction(page, 0)
      expect(stolen.status, JSON.stringify(stolen.body)).toBe(200)
      expect((await farm(page)).inventory.find((i: { itemId: string }) => i.itemId === 'nabo')?.qty).toBeGreaterThan(0)
      await page.screenshot({ path: `test-results/astra01-${switched ? 'troca' : 'nivel'}.png` })
    } finally { await fixture.dispose() }
  })
}
