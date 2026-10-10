// Vitrine pública da página inicial: "Fazendas em destaque" (Top 10) e quantas pessoas estão plantando agora.
// Quem não está logado vê, mas não chega à fazenda de verdade:
// - cada jogador aparece só pelas iniciais ("maria_clara" → "M.C."), nunca pelo apelido, e-mail, id ou convite;
// - a prévia da fazenda é pedida por um token opaco (HMAC de id + dia com AUTH_SECRET) que vale hoje e ontem
//   (UTC) e só resolve para quem está no ranking agora: adulterado, velho ou de quem saiu do ranking → 404;
// - a prévia (vitrineFarmOf, em game.ts) traz só o que a cena desenha: sem registro de visitas, amigos ou ouro.
// Fica de fora do ranking: bots, contas de teste (login só por apelido = sem e-mail), menores de 18 anos, quem desligou
// em /conta e, claro, contas excluídas (a exclusão apaga a linha). O contador soma só gente de verdade (sem bots nem
// contas de teste) e, abaixo de VITRINE.onlineMin, a página mostra um texto neutro no lugar do número.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { avatarOf, type AvatarId } from '@/game/avatar'
import { secret } from './auth'
import { getDb, type Q } from './db'
import { vitrineFarmOf } from './game'

export const VITRINE = {
  top: 10,
  onlineMin: 3, // abaixo disto não mostra o número (jogo "vazio" e risco de identificar alguém)
  onlineWindowMin: 5, // mesmo critério de "online" da janela Amigos (game.ts)
  cacheMs: 45_000,
  farmCacheMs: 30_000,
}

export const BOARDS = ['nivel', 'moedas', 'popularidade'] as const
export type Board = (typeof BOARDS)[number]

export type VitrineRow = { pos: number; initials: string; avatar: AvatarId; level: number; value: number; token: string }
export type VitrineData = { online: number | null; boards: Record<Board, VitrineRow[]> }

// ---------- iniciais ----------

/**
 * Até 2 iniciais do apelido, sem acento: "maria_clara" → "M.C.", "joao123" → "J.", "Ágata" → "A.".
 * Palavras separadas por espaço, _, -, . ou dígitos no meio contam como uma só ("j0ao" → "J."). Sem letra nenhuma → "?".
 */
export function initials(name: string): string {
  const letters: string[] = []
  for (const word of name.normalize('NFD').replace(/\p{M}/gu, '').split(/[\s_.-]+/u)) {
    const first = word.match(/\p{L}/u)?.[0]
    if (first) letters.push(first.toLocaleUpperCase('pt-BR'))
    if (letters.length === 2) break
  }
  return letters.length ? letters.map((c) => `${c}.`).join('') : '?'
}

// ---------- token opaco ----------

const DAY_MS = 86_400_000
const dayOf = (now: number) => Math.floor(now / DAY_MS)
const mac = (userId: string, day: number, key: string) =>
  createHmac('sha256', key).update(`vitrine:${userId}:${day}`).digest('base64url').slice(0, 22)

/** Token da linha do ranking: "<dia em base 36>.<HMAC>". Não revela o id e muda todo dia. */
export function vitrineToken(userId: string, now = Date.now(), key = secret()): string {
  const day = dayOf(now)
  return `${day.toString(36)}.${mac(userId, day, key)}`
}

const TOKEN_RE = /^([0-9a-z]{1,8})\.([A-Za-z0-9_-]{22})$/

/** De quem é o token, entre os candidatos (quem está no ranking agora). Vale no dia em que saiu e no seguinte. */
export function tokenOwner(token: string, candidates: Iterable<string>, now = Date.now(), key = secret()): string | null {
  const m = TOKEN_RE.exec(token)
  if (!m) return null
  const day = parseInt(m[1], 36), today = dayOf(now)
  if (day !== today && day !== today - 1) return null
  const got = Buffer.from(m[2])
  for (const id of candidates) {
    const want = Buffer.from(mac(id, day, key))
    if (want.length === got.length && timingSafeEqual(want, got)) return id
  }
  return null
}

// ---------- quem entra ----------

/** Contas de teste (só apelido, sem e-mail) entram no ranking só em desenvolvimento, com VITRINE_TEST_ACCOUNTS=1 (QA). */
export const includeTestAccounts = (env: Record<string, string | undefined> = process.env) =>
  env.NODE_ENV !== 'production' && env.VITRINE_TEST_ACCOUNTS === '1'

/** Gente de verdade: sem bots e sem contas de teste. */
export const realPlayerSql = (includeTest = includeTestAccounts()) => `not u.is_bot${includeTest ? '' : ' and u.email is not null'}`

/** Quem pode aparecer no ranking: gente de verdade, maior de idade (ou sem faixa registrada) e que não desligou. */
export const rankableSql = (includeTest = includeTestAccounts()) =>
  `${realPlayerSql(includeTest)} and u.public_ranking and (u.age_band is null or u.age_band = '18p')`

// value = o número mostrado na linha; has = quem tem algo para mostrar nesta categoria.
const ORDER: Record<Board, { value: string; has: string; order: string }> = {
  nivel: { value: 'u.xp', has: 'u.level > 0', order: 'u.level desc, u.xp desc' },
  moedas: { value: 'u.gold', has: 'u.gold > 0', order: 'u.gold desc, u.level desc' },
  popularidade: { value: 'u.popularity', has: 'u.popularity > 0', order: 'u.popularity desc, u.level desc' },
}

type RankDb = { id: string; handle: string; avatar: string | null; level: number; value: number }

export async function rankBoard(q: Q, board: Board, opts: { includeTest?: boolean; limit?: number } = {}): Promise<RankDb[]> {
  const o = ORDER[board]
  return (await q.query<RankDb>(
    `select u.id, u.handle, u.avatar, u.level, ${o.value}::int as value from users u
     where ${rankableSql(opts.includeTest)} and ${o.has}
     order by ${o.order}, u.created_at limit $1`, [opts.limit ?? VITRINE.top])).rows
}

/** Pessoas com o jogo aberto nos últimos 5 minutos (sem bots e sem contas de teste). */
export async function countOnline(q: Q, includeTest = includeTestAccounts()): Promise<number> {
  const { rows } = await q.query<{ n: number }>(
    `select count(*)::int as n from users u
     where u.last_seen_at > now() - make_interval(mins => $1) and ${realPlayerSql(includeTest)}`, [VITRINE.onlineWindowMin])
  return Number(rows[0]?.n ?? 0)
}

/** O número só sai da API a partir do mínimo; abaixo, null (a página mostra "Fazendas abertas agora"). */
export const onlineShown = (n: number, min = VITRINE.onlineMin): number | null => (n >= min ? n : null)

export { onlineLabel } from '@/game/vitrine-text'

// ---------- cache ----------

type Snapshot = { at: number; data: VitrineData; ids: Map<string, VitrineRow> } // id → linha (o id nunca sai daqui)
const g = globalThis as unknown as { __cfVitrine?: { snap: Snapshot | null; loading: Promise<Snapshot> | null; farms: Map<string, { at: number; body: unknown }> } }
const cache = (g.__cfVitrine ??= { snap: null, loading: null, farms: new Map() })

async function build(now: number): Promise<Snapshot> {
  const db = await getDb()
  const ids = new Map<string, VitrineRow>()
  const boards = {} as Record<Board, VitrineRow[]>
  for (const b of BOARDS) {
    boards[b] = (await rankBoard(db, b)).map((r, i) => {
      const row = { pos: i + 1, initials: initials(r.handle), avatar: avatarOf(r.avatar, r.handle), level: r.level, value: r.value, token: vitrineToken(r.id, now) }
      if (!ids.has(r.id)) ids.set(r.id, row)
      return row
    })
  }
  return { at: now, data: { online: onlineShown(await countOnline(db)), boards }, ids }
}

async function snapshot(now = Date.now()): Promise<Snapshot> {
  if (cache.snap && now - cache.snap.at < VITRINE.cacheMs) return cache.snap
  cache.loading ??= build(now).then((s) => (cache.snap = s)).finally(() => { cache.loading = null })
  return cache.loading
}

/** Ranking + contador (cache de ~45 s no processo). */
export async function vitrineData(): Promise<VitrineData> {
  return (await snapshot()).data
}

/** Prévia da fazenda pelo token da linha; null = não existe (token adulterado, velho ou fora do ranking). */
export async function vitrineFarm(token: string, now = Date.now()) {
  const hit = cache.farms.get(token)
  if (hit && now - hit.at < VITRINE.farmCacheMs) return hit.body
  const snap = await snapshot(now)
  const id = tokenOwner(token, snap.ids.keys(), now)
  const row = id ? snap.ids.get(id) : null
  if (!id || !row) return null
  const farm = await vitrineFarmOf(await getDb(), id, now)
  if (!farm) return null
  const body = { initials: row.initials, avatar: row.avatar, level: row.level, farm }
  if (cache.farms.size > 200) cache.farms.clear()
  cache.farms.set(token, { at: now, body })
  return body
}

/** Testes: esquece o que está guardado. */
export function resetVitrineCache() {
  cache.snap = null
  cache.loading = null
  cache.farms.clear()
}

/** Minha conta: aparecer (só com as iniciais) ou não no ranking público. */
export async function setPublicRanking(userId: string, on: boolean) {
  await (await getDb()).query('update users set public_ranking = $2 where id = $1', [userId, on])
  resetVitrineCache()
}
