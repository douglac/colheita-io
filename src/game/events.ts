// Eventos sazonais: calendário em Brasília, o que a loja vende na época, a trava "não acaba antes de a
// semente amadurecer" (lição do Bis Limão) e as contas puras da tigela, dos visitantes e das missões.
// Sem I/O: o servidor (server/events.ts) chama estas funções com o relógio dele.
import { SEED_BY_ID, SHOP_BY_ID, type Seed, type ShopItem } from './catalog'
import { calendarWindow, dateInWindow, EVENT_TZ, nextWindow, zonedDate, zonedMidnight, type EventWindow } from './event-calendar'
import { EVENT_DEFS } from './event-content'
import type { EventDef, EventMission } from './event-types'
import { parsePiece, SERIES_BY_ID } from './decor'
import { EVENTS, inSeason, type GameEvent } from './config'
import { growMs, regrowMs } from './rules'

export type { EventDef, EventMission } from './event-types'
export { EVENT_DEFS } from './event-content'
export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENT_DEFS.map((e) => [e.id, e]))

export { EVENT_TZ, zonedMidnight, zonedDate, easter, nthSunday, dateInWindow, type EventWindow } from './event-calendar'

// ---------- calendário ----------

/** Janela do evento que começa no ano `y` (fim inclusive: termina à meia-noite do dia seguinte ao último dia). */
export function windowOfYear(def: EventDef, y: number): EventWindow {
  return calendarWindow(def.calendar, y)
}

/** Janela em curso ou a próxima (a primeira que ainda não acabou). */
export function eventWindow(def: EventDef, now: number): EventWindow {
  return nextWindow(def.calendar, now)
}

/** Pares de eventos cujas janelas se encostam no ano `y` (ou na virada para y+1). `activeEvent` pega o 1º da lista,
 *  então dois eventos ao mesmo tempo esconderiam o 2º: o teste exige lista vazia (E2). */
export function overlaps(defs: EventDef[], y: number): string[] {
  const ws = defs.flatMap((d) => [y, y + 1].map((yy) => ({ id: d.id, ...windowOfYear(d, yy) })))
  const out: string[] = []
  for (let i = 0; i < ws.length; i++) {
    for (let j = i + 1; j < ws.length; j++) {
      const a = ws[i], b = ws[j]
      if (a.id !== b.id && a.startsAt < b.endsAt && b.startsAt < a.endsAt) out.push(`${a.id} × ${b.id} (${y})`)
    }
  }
  return [...new Set(out)]
}

/** Atalho de QA (/api/dev) guardado no banco: força um evento agora (com fim escolhido) ou desliga todos. */
export type EventOverride = { mode: 'off' } | { mode: 'on'; eventId: string; startsAt: number; endsAt: number }

export type ActiveEvent = EventWindow & {
  def: EventDef
  seedsUntil: number // a loja para de vender as sementes do evento aqui (trava do Bis Limão)
  forced: boolean
  shift: number // EVENT_NOW (QA): quanto o calendário está adiantado em relação ao relógio real
}

// ---------- trava do Bis Limão ----------

/** Do plantio até a última safra madura (perene: 1ª safra + as seguintes), no ritmo do jogo. */
export function seedLifeMs(seed: Seed): number {
  return growMs(seed) + Math.max(0, (seed.seasons ?? 1) - 1) * regrowMs(seed)
}

/** Maior tempo de crescimento entre as culturas do evento (0 se não tem cultura). */
export function eventGrowMs(def: EventDef): number {
  return Math.max(0, ...def.seeds.map((id) => (SEED_BY_ID[id] ? seedLifeMs(SEED_BY_ID[id]) : 0)))
}

/**
 * Lição do Bis Limão: um evento nunca termina antes de a semente dele amadurecer. A loja para de vender a
 * semente com antecedência igual ao tempo de crescimento (mais a folga para colher e trocar): quem compra a
 * última semente colhe e troca os doces antes do fim.
 */
export function seedsUntil(def: EventDef, endsAt: number): number {
  return endsAt - eventGrowMs(def) - def.graceH * 3600_000
}

/** Item que um prêmio, troca ou missão pode dar: do depósito (catálogo ou do evento), peça de decoração ou bicho do evento. */
export function knownReward(def: EventDef, item: string): boolean {
  if (parsePiece(item)) return true
  if (item.startsWith('bicho:')) return !!def.pets?.some((p) => `bicho:${p.id}` === item)
  if (item.startsWith('semente:')) return !!SEED_BY_ID[item.slice(8)]
  return !!SHOP_BY_ID[item] || eventItemIds(def).has(item)
}

/** Itens do depósito que este evento cria (moeda, loja, materiais, presentes, cartões, ovos). */
export function eventItemIds(def: EventDef): Set<string> {
  return new Set([
    ...(def.currency ? [def.currency.id] : []), ...def.shop.map((i) => i.id), ...(def.items ?? []).map((i) => i.id),
    ...(def.workshop?.recipes.map((r) => r.id) ?? []),
  ])
}

type Reward = EventMission['reward']

/** Todos os prêmios do evento, com onde estão (para validar os itens). */
function allRewards(def: EventDef): [string, Reward][] {
  return [
    ...def.missions.map((m, i): [string, Reward] => [`missão ${i}`, m.reward]),
    ...(def.bowl ? [['tigela', def.bowl.prize] as [string, Reward]] : []),
    ...(def.help ? [['ajuda', def.help.prize] as [string, Reward]] : []),
    ...(def.gifts ? [['presentes', def.gifts.prize] as [string, Reward]] : []),
    ...(def.advent?.milestones.map(([n, r]): [string, Reward] => [`meia ${n}`, r]) ?? []),
    ...(def.build?.levels.map((l, i): [string, Reward] => [`nível ${i + 1}`, l.prize]) ?? []),
    ...(def.workshop ? [['conjunto', def.workshop.setPrize] as [string, Reward], ...def.workshop.recipes.map((r): [string, Reward] => [`receita ${r.id}`, r.open])] : []),
  ]
}

/** Problemas de configuração do evento (o teste exige lista vazia): janela curta demais para a semente, itens
 *  inexistentes, campos novos (E3–E14) incoerentes… */
export function validateEvent(def: EventDef, year = 2026): string[] {
  const out: string[] = []
  const w = windowOfYear(def, year)
  if (!(w.endsAt > w.startsAt)) out.push('janela vazia')
  if (w.endsAt - w.startsAt > 60 * 86400_000) out.push('janela de mais de 60 dias')
  if (seedsUntil(def, w.endsAt) <= w.startsAt) out.push('a semente não teria tempo de amadurecer antes do fim')
  for (const id of def.seeds) if (!SEED_BY_ID[id] || SEED_BY_ID[id].event !== def.id) out.push(`cultura ${id} fora do catálogo`)
  for (const id of def.series) if (SERIES_BY_ID[id]?.event !== def.id) out.push(`série ${id} sem o evento`)
  for (const t of def.trades) if (!(t.give > 0 && t.qty > 0)) out.push(`troca ${t.id} sem preço`)
  for (const t of def.trades) {
    if (t.kind === 'decor' ? !parsePiece(t.item) : !knownReward(def, t.item)) out.push(`troca ${t.id}: item ${t.item} desconhecido`)
  }
  // E11: sem moeda não há o que trocar, nem doce por colheita, nem tigela.
  if (!def.currency && (def.trades.length || def.harvestCandy > 0 || def.bowl || def.drops?.length)) out.push('evento sem moeda com troca, tigela ou doce por colheita')
  const rewards = allRewards(def)
  for (const [where, r] of rewards) {
    for (const [item, qty] of r.items ?? []) if (!(qty > 0) || !knownReward(def, item)) out.push(`${where}: prêmio ${item} desconhecido`)
    if (r.candy && !def.currency) out.push(`${where}: dá moeda que o evento não tem`)
  }
  // E12: cada tipo de missão precisa da mecânica que a faz andar.
  const has: Record<EventMission['kind'], boolean> = {
    plant: def.seeds.length > 0, harvest: def.seeds.length > 0 || !!def.drops?.length, fill: !!def.bowl, take: !!def.bowl,
    shoo: !!def.critters, trade: def.trades.length > 0, visit: true, send: !!def.send?.length, help: !!def.help,
    build: !!def.build, craft: !!def.workshop, open: !!(def.gifts || def.workshop), checkin: !!def.advent,
  }
  for (const m of def.missions) {
    if (!(m.target > 0)) out.push(`missão ${m.title} sem alvo`)
    if (!has[m.kind]) out.push(`missão ${m.title}: o evento não tem ${m.kind}`)
    if (m.of && (m.kind === 'plant' || m.kind === 'harvest') && !def.seeds.includes(m.of) && !def.drops?.some((d) => d.seed === m.of)) out.push(`missão ${m.title}: cultura ${m.of} não é do evento`)
    if (m.of && m.kind === 'craft' && !def.workshop?.recipes.some((r) => r.id === m.of)) out.push(`missão ${m.title}: receita ${m.of} desconhecida`)
  }
  for (const d of def.drops ?? []) if (!SEED_BY_ID[d.seed] || !(d.qty > 0)) out.push(`material da cultura ${d.seed} inválido`)
  if (def.drops?.length && !def.currency) out.push('material por colheita sem moeda')
  if (def.help) {
    const h = def.help
    if (!(h.friends > 0 && h.days > 0)) out.push('ajuda sem número de amigos ou prazo')
    if (h.unlockAt && !def.workshop) out.push('ajuda destravada por aberturas num evento sem oficina')
  }
  if (def.gifts) {
    const g = def.gifts
    if (!def.build) out.push('presentes pendurados precisam da construção (vagas por nível)')
    if (!(g.perLevel > 0) || !g.kinds.length) out.push('presentes sem vaga ou sem tipo')
    if (!(dateInWindow(w, g.unlock) < w.endsAt)) out.push('os presentes abririam depois do fim do evento')
  }
  if (def.advent) {
    const a = def.advent
    if (!(a.days > 0 && a.days <= Math.round((w.endsAt - w.startsAt) / 86400_000))) out.push('calendário de presença maior que o evento')
    if (a.milestones.some(([n]) => !(n > 0 && n <= a.days))) out.push('marco do calendário fora dos dias')
  }
  if (def.build) {
    const b = def.build
    if (!b.levels.length || !b.friendItems.length || !(b.perFriend > 0)) out.push('construção sem níveis ou sem material de amigo')
    const needed = new Set(b.levels.flatMap((l) => l.needs.map(([it]) => it)))
    for (const it of b.friendItems) if (!needed.has(it)) out.push(`material ${it} que nenhum nível pede`)
    // O que o amigo não manda tem de sair da troca (a estrela do topo).
    for (const it of needed) if (!b.friendItems.includes(it) && !def.trades.some((t) => t.item === it)) out.push(`material ${it} sem jeito de conseguir`)
    for (const it of needed) if (!eventItemIds(def).has(it)) out.push(`material ${it} sem nome (items)`)
  }
  if (def.workshop) {
    const ws = def.workshop
    const ids = new Set(ws.recipes.map((r) => r.id))
    for (const r of ws.recipes) {
      if (!(r.minutes > 0) || !r.needs.length) out.push(`receita ${r.id} sem tempo ou sem ingrediente`)
      for (const [it] of r.needs) if (!ids.has(it) && !knownReward(def, it)) out.push(`receita ${r.id}: ingrediente ${it} desconhecido`)
    }
    if (ws.recipes[0]?.unlockAt !== 0) out.push('a 1ª receita da oficina tem de estar aberta desde o começo')
    for (const [rid, nth, piece] of ws.pieces) if (!ids.has(rid) || !(nth > 0) || !parsePiece(piece)) out.push(`peça ${piece} da oficina inválida`)
  }
  for (const sd of def.send ?? []) {
    if (!(sd.charm >= 0)) out.push(`envio ${sd.id} com popularidade negativa`)
    const obtainable = sd.free || def.currency?.id === sd.id || def.shop.some((i) => i.id === sd.id) || def.trades.some((t) => t.item === sd.id)
    if (!obtainable) out.push(`envio ${sd.id} sem jeito de conseguir`)
    if (!eventItemIds(def).has(sd.id)) out.push(`envio ${sd.id} sem nome (items)`)
  }
  if (def.freeSeries && !def.series.length) out.push('série grátis sem série')
  if (def.light && def.light !== 'noite' && def.light !== 'dia-noite') out.push(`luz ${def.light} desconhecida`)
  for (const p of def.pets ?? []) {
    const it = `bicho:${p.id}`
    if (!def.trades.some((t) => t.item === it) && !rewards.some(([, r]) => r.items?.some(([x]) => x === it))) out.push(`bicho ${p.id} sem jeito de ganhar`)
  }
  return out
}

/** E13: a fazenda está de noite agora? `noite` o evento todo; `dia-noite` anoitece às 19h00 e amanhece às 7h00 (Brasília). */
export function eventNight(light: EventDef['light'], now: number): boolean {
  if (light === 'noite') return true
  if (light !== 'dia-noite') return false
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: EVENT_TZ, hour: 'numeric', hourCycle: 'h23' }).format(now))
  return h < 7 || h >= 19
}

/** Relógio do evento para QA (EVENT_NOW=2026-12-20, só em desenvolvimento): quanto somar ao relógio real para cair
 *  nesse dia, na mesma hora de agora. 0 sem a variável ou com data inválida. */
export function eventClockShift(forced: string | undefined, now: number): number {
  const m = forced?.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return 0
  const today = zonedDate(now)
  return zonedMidnight(Number(m[1]), Number(m[2]), Number(m[3])) - zonedMidnight(today.y, today.m, today.d)
}

/** Evento em curso agora (com o atalho de QA por cima do calendário). `shift` (EVENT_NOW) desloca só o calendário:
 *  as horas da janela voltam para o relógio real, para timers e loja seguirem o relógio de sempre. */
export function activeEvent(now: number, override: EventOverride | null = null, defs: EventDef[] = EVENT_DEFS, shift = 0): ActiveEvent | null {
  if (override?.mode === 'off') return null
  if (override?.mode === 'on') {
    const def = defs.find((e) => e.id === override.eventId)
    if (def && now >= override.startsAt && now < override.endsAt) {
      return { def, startsAt: override.startsAt, endsAt: override.endsAt, seedsUntil: seedsUntil(def, override.endsAt), forced: true, shift: 0 }
    }
    if (def) return null // forçado e já acabou: fica sem evento até o atalho mudar
  }
  const t = now + shift
  for (const def of defs) {
    if (def.needsArt) continue
    const w = eventWindow(def, t)
    if (t >= w.startsAt && t < w.endsAt) {
      const startsAt = w.startsAt - shift, endsAt = w.endsAt - shift
      return { def, startsAt, endsAt, seedsUntil: seedsUntil(def, endsAt), forced: shift !== 0, shift }
    }
  }
  return null
}

/** Quando os presentes pendurados abrem (E5), no relógio real. Pelo calendário: o dia `unlock` da janela. Com o
 *  atalho de QA (/api/dev, janela inventada): na mesma fração do evento em que a data cai no calendário. */
export function giftsUnlockAt(ev: ActiveEvent): number {
  if (!ev.def.gifts) return Infinity
  const unlock = ev.def.gifts.unlock
  if (ev.forced && ev.shift === 0) {
    const cal = windowOfYear(ev.def, zonedDate(ev.startsAt).y)
    const frac = (dateInWindow(cal, unlock) - cal.startsAt) / (cal.endsAt - cal.startsAt)
    return ev.startsAt + Math.round((ev.endsAt - ev.startsAt) * frac)
  }
  return dateInWindow({ startsAt: ev.startsAt + ev.shift, endsAt: ev.endsAt + ev.shift }, unlock) - ev.shift
}

/** Material que o amigo manda para a construção (E7): fixo por jogador (cada amigo manda sempre o mesmo tipo de item). */
export function friendItemFor(def: EventDef, helperId: string): string | null {
  if (!def.build) return null
  let h = 0
  for (const c of helperId) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return def.build.friendItems[h % def.build.friendItems.length]
}

/** Dia do evento (1 = primeiro dia), no calendário de Brasília. */
export function dayOfEvent(ev: ActiveEvent, now: number): number {
  const s = zonedDate(ev.startsAt + ev.shift), n = zonedDate(now + ev.shift)
  return Math.round((Date.UTC(n.y, n.m - 1, n.d) - Date.UTC(s.y, s.m - 1, s.d)) / 86400_000) + 1
}

/** Ano do evento (separa a árvore de 2026 da de 2027 nas tabelas novas). */
export const seasonOf = (ev: ActiveEvent) => zonedDate(ev.startsAt + ev.shift).y

/** Progresso de missão: `kind` ou `kind:of` (Evolução 13, E12). */
export const missionKey = (m: Pick<EventMission, 'kind' | 'of'>) => (m.of ? `${m.kind}:${m.of}` : m.kind)

// ---------- loja ----------

/** Sementes do evento que o bônus diário pode dar agora: as mesmas que a loja vende (trava do Bis Limão). */
export function bonusEventSeeds(ev: ActiveEvent | null, now: number): string[] {
  return ev && now < ev.seedsUntil ? ev.def.seeds.filter((id) => SEED_BY_ID[id]) : []
}

/** Item de evento à venda agora? Itens comuns: sempre. Semente de evento: só até `seedsUntil`. */
export function shopOpenFor(item: Pick<ShopItem, 'event' | 'seedId'>, ev: ActiveEvent | null, now: number): boolean {
  if (!item.event) return true
  // Evento completo em curso (inclusive o Natal da Evolução 13): a trava do Bis Limão pela janela dele.
  if (ev?.def.id === item.event) return item.seedId ? now < ev.seedsUntil : true
  if (item.event in EVENTS) {
    // Evento só de semente (config.EVENTS, ex.: Natal): na época e, pela mesma trava, só se ainda amadurece nela.
    const e = item.event as GameEvent, seed = item.seedId ? SEED_BY_ID[item.seedId] : undefined
    return inSeason(e, now) && (!seed || inSeason(e, now + seedLifeMs(seed)))
  }
  return false
}

/** Série de decoração à venda agora? (série de evento só na época; quem comprou continua usando). */
export function seriesOnSale(seriesId: string, ev: ActiveEvent | null): boolean {
  const s = SERIES_BY_ID[seriesId]
  if (!s) return false
  return !s.event || ev?.def.id === s.event
}

// ---------- tigela ----------

export type BowlLook = 'vazia' | 'meia' | 'cheia'
/** Desenho da tigela (lote S): vazia, pela metade (1 até a metade) e cheia (acima da metade). */
export function bowlLook(candies: number, capacity: number): BowlLook {
  if (candies <= 0) return 'vazia'
  return candies > capacity / 2 ? 'cheia' : 'meia'
}

/** Arquivo da tigela: `<dir>/<bowl>_<look>.png`. O saco de confete do Carnaval é masculino (saco_cheio/meio/vazio). */
export function bowlSrc(dir: string, prefix = 'tigela', look: BowlLook): string {
  const male: Record<BowlLook, string> = { cheia: 'cheio', meia: 'meio', vazia: 'vazio' }
  return `${dir}/${prefix}_${prefix === 'saco' ? male[look] : look}.png`
}

/** Arte do objeto com ajuda dos amigos (E4) conforme as ajudas: monte → meio → boneco pronto; baú e ovo fechado → aberto.
 *  null = sem arte (o emoji fica no lugar). */
export function helpSrc(dir: string, id: string, helps: number, friends: number, claimed: boolean): string | null {
  const done = claimed || helps >= friends
  switch (id) {
    case 'boneco_neve': return `${dir}/boneco_${done ? 'pronto' : helps * 2 >= friends ? 'meio' : 'monte'}.png`
    case 'bau_flores': return `${dir}/bau_flores_${claimed ? 'aberto' : 'fechado'}.png`
    case 'coracao_agradecido': return `${dir}/bau_coracao_${claimed ? 'aberto' : 'fechado'}.png`
    case 'ovo_gigante': return `${dir}/ovo_gigante${claimed ? '_aberto' : ''}.png`
    default: return null
  }
}
export const HELP_EMOJI: Record<string, string> = { boneco_neve: '⛄', bau_flores: '🧰', coracao_agradecido: '💝', ovo_gigante: '🥚' }

/** Arte da construção (E7) por nível: a árvore de Natal tem 0 (pinheiro sem decoração) a 3. */
export const buildSrc = (dir: string, eventId: string, level: number) => (eventId === 'natal' ? `${dir}/arvore_nivel_${level}.png` : null)

// ---------- missões ----------

export type EventMissionView = EventMission & { idx: number; progress: number; claimed: boolean; open: boolean }

/** Cadeia de missões: só a primeira não resgatada fica aberta (as seguintes aparecem trancadas, como "Próxima missão"). */
export function missionChain(def: EventDef, progress: (key: string) => number, claimed: (idx: number) => boolean): EventMissionView[] {
  let open = true
  return def.missions.map((m, idx) => {
    const c = claimed(idx)
    const v = { ...m, idx, progress: Math.min(m.target, progress(missionKey(m))), claimed: c, open: open && !c }
    if (!c) open = false
    return v
  })
}

/** Fim do evento em texto curto ("termina em 3 dias", "termina em 5 h"). */
export function endsInText(endsAt: number, now: number): string {
  const ms = Math.max(0, endsAt - now)
  const h = ms / 3600_000
  if (h >= 48) return `termina em ${Math.floor(h / 24)} dias`
  if (h >= 1) return `termina em ${Math.floor(h)} h`
  return `termina em ${Math.max(1, Math.ceil(ms / 60_000))} min`
}

/** Data e hora de Brasília para mostrar ("05/11 às 23:59"). */
export function brDateTime(t: number): string {
  return new Date(t).toLocaleString('pt-BR', { timeZone: EVENT_TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' às')
}
