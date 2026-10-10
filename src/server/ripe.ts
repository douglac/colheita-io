// Horta madura: avisa o dono e o "plantão de roubo" dos amigos.
// Nada fica só em memória: o banco guarda o horário de amadurecer (plots.ready_at) e a última safra já avisada
// (plots.ripe_seq). Uma varredura acha o que falta — no boot, num timer para o próximo lote e a cada minuto —,
// então reiniciar o servidor não perde aviso e as safras seguintes das perenes entram sozinhas.
import { friendAlertBlock, friendRipeNote, groupNow, ownerRipeNote } from '@/game/alerts'
import { RIPE_ALERT } from '@/game/config'
import { gameDay } from '@/game/rules'
import { tx } from './db'
import { publish } from './hub'
import { captureError, log } from './observe'
import { notify, type Note } from './push'

type Send = (userId: string, note: Note) => Promise<unknown>

export type RipeReport = {
  owners: { owner: string; plots: number; friends: string[]; skipped: Record<string, string> }[]
  nextAt: number | null // próximo lote que vai amadurecer (para o timer)
}

// Lote por varredura: transação curta. "skip locked": o lote que um jogador está colhendo/roubando agora
// não espera a varredura (nem a varredura espera ele); fica para a próxima passada, segundos depois.
const BATCH = 2000

type Due = { id: string; owner_id: string; handle: string; is_bot: boolean; seed_id: string; ready_at: Date }

export async function sweepRipe(now = Date.now(), send: Send = notify): Promise<RipeReport> {
  const out: (() => void)[] = []
  const report = await tx(async (q) => {
    const at = new Date(now)
    const due = (await q.query<Due>(
      `select p.id, p.owner_id, u.handle, u.is_bot, p.seed_id, p.ready_at from plots p join users u on u.id = p.owner_id
       where p.seed_id is not null and not p.withered and p.ready_at <= $1 and p.ripe_seq <> p.sow_seq
       order by p.ready_at limit ${BATCH} for update of p skip locked`, [at])).rows
    const byOwner = new Map<string, Due[]>()
    for (const p of due) byOwner.set(p.owner_id, [...(byOwner.get(p.owner_id) ?? []), p])

    const report: RipeReport = { owners: [], nextAt: null }
    for (const [ownerId, plots] of byOwner) {
      const { handle, is_bot } = plots[0]
      const fresh = plots.filter((p) => now - p.ready_at.getTime() <= RIPE_ALERT.staleMs)
      if (!is_bot && fresh.length) {
        // Junta num aviso só os lotes que amadurecem logo em seguida.
        const next = (await q.query<{ at: Date | null }>(
          `select min(ready_at) as at from plots where owner_id = $1 and seed_id is not null and not withered
             and ready_at > $2 and ripe_seq <> sow_seq`, [ownerId, at])).rows[0].at
        if (!groupNow(now, fresh[0].ready_at.getTime(), next ? next.getTime() : null)) continue
      }
      await q.query('update plots set ripe_seq = sow_seq where id = any($1)', [plots.map((p) => p.id)])
      if (is_bot || !fresh.length) continue // vizinhos do jogo e safra velha (servidor esteve fora): só marca

      const seeds = fresh.map((p) => p.seed_id)
      out.push(() => void send(ownerId, ownerRipeNote(seeds)).catch(() => {}))

      // Amigos com aviso ligado (aparelho assinado). Quem desligou não tem assinatura e fica de fora.
      const friends = (await q.query<{ id: string; handle: string }>(
        `select u.id, u.handle from friendships f join users u on u.id = f.friend_id
         where f.user_id = $1 and not u.is_bot and exists (select 1 from push_subs s where s.user_id = u.id)`, [ownerId])).rows
      const day = gameDay(now)
      const sent: string[] = [], skipped: Record<string, string> = {}
      for (const f of friends) {
        const h = (await q.query<{ today: number; last: Date | null }>(
          `select (select count(*)::int from ripe_alerts where user_id = $1 and day = $2) as today,
                  (select max(created_at) from ripe_alerts where user_id = $1 and owner_id = $3) as last`, [f.id, day, ownerId])).rows[0]
        const block = friendAlertBlock(now, { sentToday: h.today, lastFromOwner: h.last ? h.last.getTime() : null })
        if (block) { skipped[f.handle] = block; continue }
        await q.query('insert into ripe_alerts (user_id, owner_id, day, plots, created_at) values ($1, $2, $3, $4, $5)',
          [f.id, ownerId, day, fresh.length, at])
        // Registro no Mural do amigo (fica mesmo se o push não chegar) e aviso em tempo real se ele estiver jogando.
        const payload = { plots: fresh.length, seeds: [...new Set(seeds)] }
        await q.query('insert into events (user_id, actor_id, kind, payload, created_at) values ($1, $2, $3, $4, $5)',
          [f.id, ownerId, 'friend_ripe', payload, at])
        const note = friendRipeNote(handle, seeds)
        out.push(() => {
          publish(f.id, { kind: 'friend_ripe', payload: { ...payload, handle } })
          void send(f.id, note).catch(() => {})
        })
        sent.push(f.handle)
      }
      report.owners.push({ owner: handle, plots: fresh.length, friends: sent, skipped })
    }

    const next = (await q.query<{ at: Date | null }>(
      `select min(ready_at) as at from plots where seed_id is not null and not withered and ready_at > $1 and ripe_seq <> sow_seq`,
      [at])).rows[0].at
    report.nextAt = due.length >= BATCH ? now + 1000 : next ? next.getTime() : null
    return report
  })
  // Push e tempo real só depois do commit.
  for (const fn of out) fn()
  return report
}

// ---------- agenda (um processo; com várias instâncias a marcação ripe_seq evita aviso em dobro) ----------

type Watch = { timer?: ReturnType<typeof setTimeout>; at: number }
const g = globalThis as unknown as { __cfRipe?: Watch }

function schedule(at: number) {
  const w = g.__cfRipe!
  const now = Date.now()
  at = Math.min(at, now + RIPE_ALERT.sweepMs)
  if (w.timer && w.at <= at) return
  clearTimeout(w.timer)
  w.at = at
  w.timer = setTimeout(() => void tick(), Math.max(500, at - now + 250))
  w.timer.unref?.()
}

async function tick() {
  const w = g.__cfRipe!
  w.timer = undefined
  w.at = Infinity
  let next = Date.now() + RIPE_ALERT.sweepMs
  try {
    const r = await sweepRipe()
    // Registro no log do servidor: quem foi avisado e quem foi barrado (e por quê).
    for (const o of r.owners) log('info', 'horta madura', { owner: o.owner, plots: o.plots, notified: o.friends, skipped: o.skipped })
    if (r.nextAt != null) next = Math.min(next, r.nextAt)
  } catch (e) {
    captureError(e, { job: 'ripe' })
  }
  schedule(next)
}

/** Liga a varredura (no boot, via instrumentation.ts). Nos testes fica desligada: eles chamam sweepRipe na mão. */
export function startRipeWatch() {
  if (g.__cfRipe || process.env.VITEST) return
  g.__cfRipe = { at: Infinity }
  void tick()
}

/** Um lote vai amadurecer em `at` (plantou, adubou, safra nova): garante uma varredura nessa hora. */
export function kickRipe(at: number) {
  if (process.env.VITEST) return
  if (!g.__cfRipe) return startRipeWatch()
  schedule(at)
}
