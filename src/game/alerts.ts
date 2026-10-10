// Regras puras do aviso de horta madura. Sem I/O: tudo recebe `now`.
import { SEED_BY_ID } from './catalog'
import { RIPE_ALERT } from './config'

const hourFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' })

/** Hora cheia (0–23) no horário de Brasília. */
export function brHour(now: number): number {
  return Number(hourFmt.format(now)) % 24
}

/** Entre 23h e 8h de Brasília os amigos não são acordados. */
export function quietHours(now: number): boolean {
  const h = brHour(now), { quietFrom: from, quietTo: to } = RIPE_ALERT
  if (from === to) return false
  return from > to ? h >= from || h < to : h >= from && h < to
}

export type FriendAlertHistory = {
  sentToday: number // avisos de horta madura que este amigo já recebeu hoje (de qualquer dono)
  lastFromOwner: number | null // último aviso sobre a horta deste dono (epoch ms)
}

/** Por que não avisar este amigo agora (null = pode avisar). */
export function friendAlertBlock(now: number, h: FriendAlertHistory): 'quiet' | 'daily' | 'owner_gap' | null {
  if (quietHours(now)) return 'quiet'
  if (h.sentToday >= RIPE_ALERT.friendDaily) return 'daily'
  if (h.lastFromOwner != null && now - h.lastFromOwner < RIPE_ALERT.perOwnerGapMs) return 'owner_gap'
  return null
}

/** Manda já ou espera mais um pouco para juntar os lotes que amadurecem logo em seguida? */
export function groupNow(now: number, oldestReady: number, nextReady: number | null): boolean {
  if (now - oldestReady >= RIPE_ALERT.maxWaitMs) return true
  return nextReady == null || nextReady - now > RIPE_ALERT.groupMs
}

/** "Nabo e Milho" / "Nabo, Milho e Tomate" (sem repetir). */
export function cropList(seedIds: string[]): string {
  const names = [...new Set(seedIds)].map((id) => SEED_BY_ID[id]?.name ?? id)
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`
}

export function ownerRipeNote(seedIds: string[]) {
  const n = seedIds.length
  return {
    title: 'Sua horta está pronta! 🌱',
    body: `${cropList(seedIds)} ${n > 1 ? `madura em ${n} lotes` : 'madura'}. Colhe antes que os vizinhos passem por aí…`,
    tag: 'ready',
  }
}

export function friendRipeNote(owner: string, seedIds: string[]) {
  const n = seedIds.length
  return {
    title: `A horta de ${owner} está madura. Corre lá! 🧺`,
    body: `${cropList(seedIds)} no ponto${n > 1 ? ` (${n} lotes)` : ''}. Quem chega primeiro leva um pouco…`,
    tag: `ripe:${owner}`,
    url: `/fazenda/${owner}`,
  }
}
