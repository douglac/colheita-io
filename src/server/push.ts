// Notificações no celular (Web Push, padrão aberto do navegador; sem serviço pago).
// Chaves VAPID: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY no ambiente; em dev são geradas uma vez em .data/.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import webpush from 'web-push'
import { getDb } from './db'

type Keys = { publicKey: string; privateKey: string }

const g = globalThis as unknown as { __cfVapid?: Keys }

function keys(): Keys {
  if (g.__cfVapid) return g.__cfVapid
  let k: Keys
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    k = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
  } else {
    const file = path.join(process.cwd(), '.data', 'vapid.json')
    try {
      k = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      k = webpush.generateVAPIDKeys()
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, JSON.stringify(k), { mode: 0o600 })
    }
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:contato@colheitafeliz.local', k.publicKey, k.privateKey)
  return (g.__cfVapid = k)
}

export const publicKey = () => keys().publicKey

export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } }

export async function subscribe(userId: string, sub: PushSub) {
  const db = await getDb()
  await db.query(
    `insert into push_subs (user_id, endpoint, p256dh, auth) values ($1, $2, $3, $4)
     on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    [userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth])
}

export async function unsubscribe(endpoint: string) {
  await (await getDb()).query('delete from push_subs where endpoint = $1', [endpoint])
}

export type Note = { title: string; body: string; url?: string; tag?: string }

/** Envia para todos os aparelhos do jogador — só se ele não estiver jogando agora (visto há > 90 s). */
export async function notify(userId: string, note: Note, opts: { evenIfActive?: boolean } = {}) {
  const db = await getDb()
  if (!opts.evenIfActive) {
    const seen = (await db.query<{ last_seen_at: Date }>('select last_seen_at from users where id = $1', [userId])).rows[0]
    if (seen && Date.now() - seen.last_seen_at.getTime() < 90_000) return
  }
  const subs = (await db.query<{ endpoint: string; p256dh: string; auth: string }>(
    'select endpoint, p256dh, auth from push_subs where user_id = $1', [userId])).rows
  if (!subs.length) return
  keys()
  const payload = JSON.stringify({ icon: '/icons/icon-192.png', url: '/fazenda', ...note })
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 })
    } catch (e) {
      // 404/410: o aparelho cancelou a assinatura; apaga para não insistir.
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await unsubscribe(s.endpoint)
    }
  }))
}

// "Sua horta está pronta" (e o aviso aos amigos) saem da varredura persistente em ./ripe.ts.
