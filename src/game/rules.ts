// Regras puras: sem I/O, sem relógio próprio. Tudo recebe `now` (epoch ms) e, quando há sorte, `rand`.
import { EVEN_STAGES, regrowStage, SEED_BY_ID, stageFracs, STAGE_NAMES, type Seed } from './catalog'
import { CARE, DAILY_SEEDS, DOG_LEVEL, GROWTH_SPEED, PATROL, POPULARITY_CAP, STEAL, TUTORIAL, type DogBreed, type StealMode } from './config'

export type PlotRow = {
  idx: number
  seed_id: string | null
  planted_at: number | null
  ready_at: number | null
  yield_total: number | null
  yield_left: number | null
  withered: boolean
  sow_seq?: number
  season?: number // safra atual (1..seasons)
  pests?: number
  weeds?: number
  dry_at?: number | null // quando seca (ou secou); null = não seca nesta safra
  dry_ms?: number // tempo seco acumulado em regas anteriores
  nat_pest_at?: number | null // praga natural agendada
  nat_weed_at?: number | null // erva natural agendada
}

export type PlotState = 'empty' | 'growing' | 'ripe' | 'withered'

export type PlotView = {
  idx: number
  state: PlotState
  seedId?: string
  stage?: number
  plantedAt?: number
  readyAt?: number
  yieldTotal?: number
  yieldLeft?: number
  pests?: number
  weeds?: number
  dry?: boolean
  health?: number
  season?: number
  seasons?: number
  // Só em visita: o visitante ainda pode roubar deste lote?
  canSteal?: boolean
  // O estágio atual já recebeu adubo (1 por estágio)
  fertilized?: boolean
}

export const RIPE_STAGE = STAGE_NAMES.length - 1

/** Tempo até a 1ª colheita (com GROWTH_SPEED). `tutorial`: o nabo do nível 1 e dos vizinhos-bot (config.ts, TUTORIAL). */
export function growMs(seed: Seed, tutorial = false): number {
  const min = tutorial && seed.id === TUTORIAL.seedId ? TUTORIAL.minutes : seed.growMinutes
  return Math.max(1000, Math.round((min * 60_000) / GROWTH_SPEED))
}

/** O plantio usa o tempo do tutorial? (só o nabo, só até o nível do tutorial) */
export const tutorialGrow = (seedId: string, level: number) => seedId === TUTORIAL.seedId && level <= TUTORIAL.maxLevel

/** Tempo de cada safra seguinte de uma perene (com GROWTH_SPEED). */
export function regrowMs(seed: Seed): number {
  return Math.max(1000, Math.round(((seed.regrowMinutes ?? seed.growMinutes) * 60_000) / GROWTH_SPEED))
}

/** Próxima safra de cultura perene: volta para o estágio de `regrowStage` (quase sempre "folhas grandes") e fica
 *  pronta em regrowMinutes. */
export function nextSeason(seed: Seed, now: number): { plantedAt: number; readyAt: number } {
  const regrow = regrowMs(seed)
  const readyAt = now + regrow
  // Linha do tempo com o estágio k começando agora: os estágios que faltam (k..4) somam o tempo de reamadurecer,
  // na proporção das horas oficiais, e os anteriores ficam para trás. Arredonda para cima: nunca cai no k − 1.
  const fr = stageFracs(seed), k = regrowStage(seed)
  const plantedAt = now - Math.ceil((regrow * fr[k]) / (1 - fr[k]) - 1e-6)
  return { plantedAt, readyAt }
}

export function plotState(p: PlotRow, now: number): PlotState {
  if (p.withered) return 'withered'
  if (!p.seed_id || p.planted_at == null || p.ready_at == null) return 'empty'
  return now >= p.ready_at ? 'ripe' : 'growing'
}

/** Estágio da arte (0..5); 5 = maduro. `fr` = início de cada estágio em fração do crescimento: as horas de
 *  cada estágio (`stageFracs(seed)`) ou 5 trechos iguais. Estágio de 0 h é pulado (o nabo vai das
 *  folhas pequenas direto para o florescendo). */
export function stageAt(plantedAt: number, readyAt: number, now: number, fr: readonly number[] = EVEN_STAGES): number {
  if (now >= readyAt) return RIPE_STAGE
  const frac = Math.max(0, (now - plantedAt) / (readyAt - plantedAt))
  // O 1e-9 absorve o erro de ponto flutuante bem na divisa (ex.: a safra seguinte começa exata no 3).
  let n = 0
  for (let k = 1; k < RIPE_STAGE; k++) if (frac + 1e-9 >= fr[k]) n = k
  return n
}

/** Quando começa o estágio `n` (0..5) desta linha do tempo. */
export function stageStart(plantedAt: number, readyAt: number, n: number, fr: readonly number[] = EVEN_STAGES): number {
  return n >= RIPE_STAGE ? readyAt : plantedAt + (readyAt - plantedAt) * fr[n]
}

/** Nome do estágio para o balão do lote, o próximo nome e quando ele chega (para "faltam X para ..."). */
export function growthName(plantedAt: number, readyAt: number, now: number, fr: readonly number[] = EVEN_STAGES): { name: string; next: string | null; nextAt: number | null } {
  const i = stageAt(plantedAt, readyAt, now, fr)
  if (i >= RIPE_STAGE) return { name: STAGE_NAMES[RIPE_STAGE], next: null, nextAt: null }
  let j = i + 1
  while (j < RIPE_STAGE && fr[j + 1] <= fr[j]) j++ // pula estágio de 0 h
  return { name: STAGE_NAMES[i], next: STAGE_NAMES[j], nextAt: stageStart(plantedAt, readyAt, j, fr) }
}

/** Adubo: no máximo 1 por estágio. O estágio em que o adubo deixa a planta conta como adubado
 *  (senão dava para emendar adubos e amadurecer na hora). `fertStage` vale só na safra `fertSeq`. */
export function fertilizedNow(stage: number, sowSeq: number, fertSeq: number, fertStage: number): boolean {
  return fertSeq === sowSeq && stage <= fertStage
}

/**
 * Semente grátis do bônus diário: muda a cada dia, entre as que o jogador já pode plantar.
 * Com evento em curso, vem uma semente do evento (`eventSeeds`), se alguma servir para o nível.
 */
export function dailySeed(day: string, level: number, eventSeeds: readonly string[] = []): string {
  const fits = (id: string) => (SEED_BY_ID[id]?.minLevel ?? 99) <= level
  const special = eventSeeds.filter(fits)
  const pool = special.length ? special : DAILY_SEEDS.filter(fits)
  return pool[Math.floor(Date.parse(day) / 86_400_000) % pool.length]
}

// ---------- cuidados ----------

/** O que agendar ao plantar: seca na metade do caminho e pragas/ervas naturais (tudo antes de amadurecer). */
export function scheduleCare(plantedAt: number, grow: number, rand: () => number = Math.random) {
  const at = (from: number, to: number) => Math.round(plantedAt + grow * (from + rand() * (to - from)))
  return {
    dry_at: rand() < CARE.dryChance ? Math.round(plantedAt + grow * 0.5) : null,
    nat_pest_at: rand() < CARE.naturalPestChance ? at(0.3, 0.8) : null,
    nat_weed_at: rand() < CARE.naturalWeedChance ? at(0.2, 0.7) : null,
  }
}

export type Care = { pests: number; weeds: number; dry: boolean; dryMs: number; health: number }

/** Estado dos cuidados agora. Eventos naturais só contam depois de acontecerem e antes de amadurecer. */
export function careAt(p: PlotRow, now: number): Care {
  const until = Math.min(now, p.ready_at ?? now)
  const due = (t: number | null | undefined) => t != null && t <= until
  const pests = (p.pests ?? 0) + (due(p.nat_pest_at) ? 1 : 0)
  const weeds = (p.weeds ?? 0) + (due(p.nat_weed_at) ? 1 : 0)
  const dry = due(p.dry_at)
  const dryMs = (p.dry_ms ?? 0) + (dry ? until - p.dry_at! : 0)
  const penalty = Math.min(CARE.maxPenalty, CARE.penaltyPer * (pests + weeds))
    + (dryMs > CARE.dryLimitMs / GROWTH_SPEED ? CARE.dryPenalty : 0)
  return { pests, weeds, dry, dryMs, health: 100 - penalty }
}

/** Rendimento depois da saúde. O que já foi roubado sai do total efetivo. */
export function effectiveYield(p: PlotRow, now: number): { total: number; left: number } {
  const base = p.yield_total ?? 0
  const taken = base - (p.yield_left ?? 0)
  const total = Math.max(1, Math.round((base * careAt(p, now).health) / 100))
  return { total, left: Math.max(0, total - taken) }
}

/** O que fica com o dono: `keep` = fração da safra (a da cultura ou do bicho; sem ela, 60%). */
export function ownerFloor(yieldTotal: number, keep: number = STEAL.ownerFloor): number {
  return Math.ceil(yieldTotal * keep - 1e-9)
}

/** Quanto a safra inteira deixa roubar (tudo acima do piso do dono). */
export function stealPool(yieldTotal: number, keep?: number): number {
  return Math.max(0, yieldTotal - ownerFloor(yieldTotal, keep))
}

/**
 * Quanto um roubo (ou um toque, no modo 'tap') leva agora (0 = não há o que roubar).
 * Recebe o total e o restante efetivos.
 */
export function stealQty(yieldTotal: number, yieldLeft: number, mode: StealMode = STEAL.mode, keep?: number): number {
  const available = yieldLeft - ownerFloor(yieldTotal, keep)
  if (available <= 0) return 0
  if (mode === 'tap') return 1
  return Math.min(available, Math.max(1, Math.round(yieldTotal * STEAL.perSteal)))
}

/** Limite diário: tentativas no 'chunk', unidades no 'tap'. */
export const stealDailyCap = (mode: StealMode = STEAL.mode) => (mode === 'tap' ? STEAL.dailyUnits : STEAL.dailyLimit)

/**
 * Chance de mordida de UMA tentativa. No 'chunk' é a da raça (1 tentativa por lote).
 * No 'tap' o ladrão precisa de k = stealPool(total) toques para esvaziar o lote; com chance p por
 * toque, a chance de ser mordido até esvaziar é 1 − (1 − p)^k. Igualando à da raça (b):
 *   p = 1 − (1 − b)^(1/k)
 * Ex.: Pastor (b = 55%) num nabo de 9: k = 3 → p ≈ 23% por toque; num morango de 22: k = 8 → p ≈ 9,5%.
 */
export function biteChance(bite: number, yieldTotal: number, mode: StealMode = STEAL.mode, keep?: number): number {
  if (mode === 'chunk') return bite
  const k = Math.max(1, stealPool(yieldTotal, keep))
  return 1 - (1 - bite) ** (1 / k)
}

// ---------- nível do cachorro (ossos) ----------

/** Nível do cachorro pelos ossos já dados (nível N pede 10·N ossos a mais que o N−1). */
export function dogLevel(bones: number): number {
  let level = 0, need = 0
  while (level < DOG_LEVEL.max && bones >= need + DOG_LEVEL.bonesFor(level + 1)) need += DOG_LEVEL.bonesFor(++level)
  return level
}

/** Barra da ficha: "faltam N ossos para o nível X" (null = nível máximo). */
export function dogNextLevel(bones: number): { level: number; missing: number; have: number; need: number } | null {
  const level = dogLevel(bones)
  if (level >= DOG_LEVEL.max) return null
  let spent = 0
  for (let l = 1; l <= level; l++) spent += DOG_LEVEL.bonesFor(l)
  const need = DOG_LEVEL.bonesFor(level + 1)
  return { level: level + 1, missing: need - (bones - spent), have: bones - spent, need }
}

/** Raça + nível: chance da raça (esvaziar um lote inteiro), multa e teto da multa. */
export function dogPower(breed: Pick<DogBreed, 'bite' | 'finePct' | 'fineMax'>, level: number) {
  return {
    bite: 1 - (1 - breed.bite) * (1 - DOG_LEVEL.bitePer * level),
    finePct: breed.finePct * (1 + DOG_LEVEL.finePer * level),
    fineMax: Math.round(breed.fineMax * (1 + DOG_LEVEL.finePer * level)),
  }
}

/** Chance de mordida de um toque, com o cachorro de costas (`away`) ou de frente para o alvo. */
export function tapBiteChance(bite: number, yieldTotal: number, away: boolean, mode: StealMode = STEAL.mode, keep?: number): number {
  return Math.min(PATROL.maxBite, biteChance(bite, yieldTotal, mode, keep) * (away ? PATROL.backMult : PATROL.frontMult))
}

/** Identifica a safra atual de um lote (no 'chunk', um ladrão só rouba 1 vez por safra). */
export function harvestKey(plotId: string, sowSeq: number): string {
  return `${plotId}#${sowSeq}`
}

export function viewPlot(p: PlotRow, now: number): PlotView {
  const state = plotState(p, now)
  if (state === 'empty') return { idx: p.idx, state }
  const v: PlotView = { idx: p.idx, state, seedId: p.seed_id ?? undefined }
  if (state === 'withered') return v
  v.plantedAt = p.planted_at!
  v.readyAt = p.ready_at!
  v.stage = stageAt(v.plantedAt, v.readyAt, now, stageFracs(SEED_BY_ID[p.seed_id!]))
  const care = careAt(p, now)
  v.pests = care.pests
  v.weeds = care.weeds
  v.dry = state === 'growing' && care.dry
  v.health = care.health
  const seasons = SEED_BY_ID[p.seed_id!]?.seasons ?? 1
  if (seasons > 1) { v.season = p.season ?? 1; v.seasons = seasons }
  if (state === 'ripe') {
    const y = effectiveYield(p, now)
    v.yieldTotal = y.total
    v.yieldLeft = y.left
  }
  return v
}

/** Venda com bônus de popularidade (+1% por ponto, com teto). Conta em inteiros (décimos de ouro × pontos percentuais)
 *  e arredonda para baixo só no fim: em float, 2,3 × 100 daria 229. */
export function salePrice(unit: number, qty: number, popularity: number): number {
  const pop = Math.min(POPULARITY_CAP, popularity)
  return Math.floor((Math.round(unit * 10) * qty * (100 + pop)) / 1000)
}

// Níveis: XP acumulado para alcançar o nível L = 25·L·(L−1). (estimativa)
export function xpToReach(level: number): number {
  return 25 * level * (level - 1)
}

export function levelForXp(xp: number): number {
  let level = 1
  while (xp >= xpToReach(level + 1)) level++
  return level
}

// Popularidade também tem nível ("Popularidade atual: X / Para o próximo nível: Y").
// Curva com a mesma forma da do XP, em escala de flores (5·L·(L−1)).
export function popToReach(level: number): number {
  return 5 * level * (level - 1)
}

export function popLevelFor(pop: number): number {
  let level = 1
  while (pop >= popToReach(level + 1)) level++
  return level
}

export function seedOrThrow(id: string): Seed {
  const seed = SEED_BY_ID[id]
  if (!seed) throw new GameError('Semente desconhecida')
  return seed
}

/** Erro de regra do jogo (vira 400 com a mensagem). `code` = fala do balão do lote (lines.ts), quando houver. */
export class GameError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message)
  }
}

/** Dia corrente no fuso de Brasília, para limites diários. */
export function gameDay(now: number): string {
  return new Date(now - 3 * 3600_000).toISOString().slice(0, 10)
}

export function prevDay(day: string): string {
  return new Date(Date.parse(day) - 86_400_000).toISOString().slice(0, 10)
}

// ---------- missões diárias ----------

export type MissionKind = 'harvest' | 'plant' | 'sell' | 'water' | 'help' | 'steal' | 'visit'
export type MissionDef = { kind: MissionKind; target: number; text: string; gold: number; xp: number }

const SOLO: MissionDef[] = [
  { kind: 'harvest', target: 3, text: 'Colha 3 vezes', gold: 30, xp: 5 },
  { kind: 'plant', target: 5, text: 'Plante 5 sementes', gold: 25, xp: 5 },
  { kind: 'sell', target: 2, text: 'Venda no depósito 2 vezes', gold: 20, xp: 4 },
  { kind: 'water', target: 2, text: 'Regue 2 lotes secos', gold: 20, xp: 4 },
]
// Uma missão por dia é sempre social: é o motor do convite e da visita.
const SOCIAL: MissionDef[] = [
  { kind: 'help', target: 2, text: 'Ajude 2 vezes na fazenda de amigos', gold: 40, xp: 8 },
  { kind: 'steal', target: 3, text: 'Pegue da horta de amigos 3 vezes', gold: 30, xp: 6 },
  { kind: 'visit', target: 2, text: 'Visite 2 fazendas', gold: 25, xp: 5 },
]

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** As 3 missões do dia: sorteio determinístico por jogador e dia (não precisa guardar). */
export function dailyMissions(userId: string, day: string): MissionDef[] {
  const h = hash(`${userId}:${day}`)
  const a = h % SOLO.length
  const b = (a + 1 + ((h >>> 8) % (SOLO.length - 1))) % SOLO.length
  return [SOLO[a], SOLO[b], SOCIAL[(h >>> 16) % SOCIAL.length]]
}
