import { DOG_BREEDS, dogIcon, EVENTS, FERTILIZERS, inCalendar, inSeason, origGold, origUnit, PACE, POPULARITY_CAP, TUTORIAL, type GameEvent } from './config'
import { ACCESSORIES, ACCESSORY_BY_ID, accItem, FEED_ICON, FEEDS, isFeed, LIVESTOCK, PRODUCT_ICON, PRODUCTS, productPrice } from './livestock'
import { EVENT_DEFS, EVENT_SEED_DEFS } from './event-content'

// Um formatador só: `toLocaleString` com opções monta um Intl.NumberFormat novo a cada chamada (pesava no toque).
// No topo: a SHOP, mais abaixo, já formata ao carregar o módulo.
const GOLD_FMT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
// Catálogo. Todas as culturas usam os valores de balanceamento do jogo, levados ao ritmo do teste pelo PACE
// (config.ts).
export type Seed = {
  id: string
  name: string
  growMinutes: number
  cost: number // ouro por semente na loja
  yieldMin: number
  yieldMax: number
  sellPrice: number // ouro por unidade colhida (0 = não vende); pode ter 1 casa decimal (13 na tabela → 1,3)
  xp: number // por colheita
  minLevel: number
  flower?: boolean // flor: a colheita vira flor no depósito, para dar de presente (popularidade a quem recebe)
  charm?: number // flor: pontos de popularidade que cada flor dá a quem recebe ("Nível de charme"); padrão 1
  seasons?: number // safras (padrão 1). Depois de colher, volta a um estágio anterior e cresce de novo
  regrowMinutes?: number // tempo de cada safra seguinte
  stageFr?: readonly number[] // início de cada estágio 0..5, em fração do crescimento (horas oficiais de cada estágio)
  ownerKeep?: number // fração da safra que fica com o dono depois do roubo (min_output ÷ output da tabela)
  // Semente de evento: só aparece na loja na época dele; quem já tem planta quando quiser. Id de config.EVENTS
  // (Natal, só a semente) ou de event-content.ts (evento completo: Dia das Bruxas).
  event?: string
  color: number // cor do fruto no placeholder
  leaf: number
  needsArt?: boolean // sem arte ainda: fora da loja (e do servidor) até a arte chegar
}

// Uma linha da tabela de itens. Tudo em unidades da tabela: horas e ouro.
export type OrigSeed = {
  id: string; name: string; seasons: number
  h: number[] | number // horas de cada um dos 5 estágios (`detail`); flor: só o tempo total (a tabela não traz estágios)
  re?: number // horas de cada safra seguinte (`relife_cycle`)
  out: number; keep?: number // rendimento por safra (`output`) e o que sobra para o dono depois do roubo (`min_output`)
  unit: number // venda por unidade (0 = flor, não vende)
  gold: number; greens?: number; vip?: boolean // semente em ouro, em moeda verde (paga) e "só para membros VIP"
  level: number; xp: number // `clevel` e XP por safra
  minLevel?: number // nível decidido aqui, quando o da tabela não cabe (ver a linha)
  flower?: boolean; charm?: number // flor: popularidade que dá a quem recebe
  event?: string
  color: number; leaf: number; needsArt?: boolean
}

// Itens VIP ou só de moeda verde: aqui só ouro, nunca moeda paga. Preço equivalente:
// - semente: renda de todas as safras ÷ GREEN_SEED_RATIO, nunca abaixo do ouro-base.
// - flor: GOLD_PER_GREEN_FLOWER de ouro por unidade da coluna greens.
export const GREEN_SEED_RATIO = 2.5
export const GOLD_PER_GREEN_FLOWER = 2000
export function origSeedGold(o: OrigSeed): number {
  if (o.flower) return o.gold || (o.greens ?? 0) * GOLD_PER_GREEN_FLOWER
  if (!o.vip && !o.greens) return o.gold
  return Math.max(o.gold, Math.round((o.seasons * o.out * o.unit) / GREEN_SEED_RATIO / 10) * 10)
}
/** Horas de cada estágio (as flores dividem o tempo em 5 trechos iguais, como antes). */
export const origStageH = (o: OrigSeed) => (typeof o.h === 'number' ? Array(5).fill(o.h / 5) : o.h)
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

const fromOriginal = (o: OrigSeed): Seed => {
  const h = origStageH(o), total = sum(h)
  let acc = 0
  const fr = [0, ...h.map((x) => (acc += x) / total)]
  return {
    id: o.id, name: o.name,
    growMinutes: +(total * 60 * PACE.time).toFixed(2),
    ...(o.seasons > 1 ? { seasons: o.seasons, regrowMinutes: +((o.re ?? total) * 60 * PACE.time).toFixed(2) } : {}),
    cost: origGold(origSeedGold(o)), sellPrice: o.unit ? origUnit(o.unit) : 0, yieldMin: o.out, yieldMax: o.out,
    ...(typeof o.h === 'number' ? {} : { stageFr: fr }),
    ...(o.keep != null ? { ownerKeep: o.keep / o.out } : {}),
    ...(o.flower ? { flower: true, charm: o.charm ?? 1 } : {}),
    ...(o.event ? { event: o.event } : {}),
    xp: Math.max(1, Math.round(o.xp * PACE.xp)), minLevel: o.minLevel ?? Math.max(1, Math.round(o.level * PACE.level)),
    color: o.color, leaf: o.leaf, ...(o.needsArt ? { needsArt: true } : {}),
  }
}

// As 33 sementes básicas, na ordem da tabela de lucro (nível e preço). Valores de balanceamento do jogo.
// Nível 0 da tabela = nível 1 aqui. Itens VIP ou de verdes: preço pela regra acima.
export const ORIGINAL_SEEDS: OrigSeed[] = [
  { id: 'nabo', name: 'Nabo', seasons: 1, h: [2, 2, 3, 0, 3], out: 36, keep: 21, unit: 13, gold: 200, level: 0, xp: 40, color: 0xf3e9ff, leaf: 0x5fbf3a },
  { id: 'cenoura', name: 'Cenoura', seasons: 1, h: [3, 4, 4, 0, 4], out: 41, keep: 24, unit: 20, gold: 350, level: 0, xp: 40, color: 0xff8a1f, leaf: 0x58b83a },
  { id: 'milho', name: 'Milho', seasons: 1, h: [4, 4, 4, 4, 4], out: 42, keep: 25, unit: 28, gold: 500, level: 0, xp: 40, color: 0xffd23f, leaf: 0x4caf50 },
  { id: 'batata', name: 'Batata', seasons: 1, h: [4, 5, 5, 5, 5], out: 48, keep: 29, unit: 31, gold: 650, level: 0, xp: 40, color: 0xc8a165, leaf: 0x4f9e3a },
  { id: 'berinjela', name: 'Berinjela', seasons: 1, h: [6, 6, 6, 6, 6], out: 54, keep: 33, unit: 34, gold: 800, level: 0, xp: 40, color: 0x6b2d83, leaf: 0x3f8f35 },
  { id: 'tomate', name: 'Tomate', seasons: 2, h: [6, 5, 5, 5, 5], re: 10, out: 35, keep: 20, unit: 34, gold: 950, level: 5, xp: 45, color: 0xe8392b, leaf: 0x3f9e3a },
  { id: 'pimenta', name: 'Pimenta', seasons: 2, h: [6, 6, 6, 6, 6], re: 12, out: 39, keep: 23, unit: 35, gold: 1100, level: 5, xp: 45, color: 0xd81e1e, leaf: 0x3f8f35 },
  { id: 'abobora', name: 'Abóbora', seasons: 2, h: [8, 8, 6, 6, 6], re: 12, out: 36, keep: 21, unit: 43, gold: 1250, level: 5, xp: 45, color: 0xf28c28, leaf: 0x3f8f35 },
  { id: 'ervilha', name: 'Ervilha', seasons: 2, h: [7, 7, 6, 7, 7], re: 14, out: 43, keep: 26, unit: 40, gold: 1400, level: 5, xp: 45, color: 0x7cc242, leaf: 0x3f8f35 },
  { id: 'morango', name: 'Morango', seasons: 3, h: [7, 6, 6, 6, 6], re: 12, out: 31, keep: 18, unit: 42, gold: 1550, level: 10, xp: 50, color: 0xff3b5c, leaf: 0x2e9e44 },
  { id: 'maca', name: 'Maçã', seasons: 3, h: [7, 7, 7, 7, 7], re: 14, out: 28, keep: 17, unit: 55, gold: 1800, level: 10, xp: 50, color: 0xd7262e, leaf: 0x3f8f35 },
  { id: 'melancia', name: 'Melancia', seasons: 3, h: [9, 9, 8, 7, 7], re: 14, out: 30, keep: 21, unit: 55, gold: 1975, level: 11, xp: 51, color: 0x2f9e44, leaf: 0x3f8f35 },
  { id: 'banana', name: 'Banana', seasons: 3, h: [9, 9, 9, 9, 9], re: 18, out: 33, keep: 23, unit: 56, gold: 2150, level: 12, xp: 52, color: 0xf7d43a, leaf: 0x3f8f35 },
  { id: 'pessego', name: 'Pêssego', seasons: 3, h: [13, 13, 12, 11, 11], re: 22, out: 32, keep: 22, unit: 79, gold: 3075, level: 13, xp: 53, color: 0xf7a08a, leaf: 0x3f8f35 },
  { id: 'laranja', name: 'Laranja', seasons: 3, h: [14, 14, 14, 12, 12], re: 24, out: 34, keep: 23, unit: 80, gold: 3350, level: 14, xp: 54, color: 0xf39a1e, leaf: 0x3f8f35 },
  { id: 'uva', name: 'Uva', seasons: 4, h: [15, 15, 12, 12, 12], re: 24, out: 30, keep: 18, unit: 86, gold: 4125, level: 15, xp: 55, color: 0x7b3fa0, leaf: 0x4a9e2f },
  { id: 'roma', name: 'Romã', seasons: 4, h: [11, 11, 11, 11, 11], re: 22, out: 29, keep: 21, unit: 84, gold: 3875, level: 16, xp: 56, color: 0xb3212e, leaf: 0x3f8f35 },
  { id: 'melao', name: 'Melão', seasons: 3, h: [9, 7, 8, 8, 8], re: 16, out: 40, keep: 32, unit: 97, gold: 4600, level: 17, xp: 50, color: 0xe9d27a, leaf: 0x3f8f35 },
  { id: 'cana', name: 'Cana', seasons: 3, h: [9, 7, 8, 8, 8], re: 16, out: 40, keep: 32, unit: 97, gold: 4600, level: 17, xp: 50, color: 0xb5c96a, leaf: 0x4a9e2f },
  { id: 'lichia', name: 'Lichia', seasons: 3, h: [11, 11, 12, 13, 14], re: 27, out: 42, keep: 34, unit: 98, gold: 4750, level: 19, xp: 55, color: 0xe0485a, leaf: 0x3f8f35 },
  { id: 'kiwi', name: 'Kiwi', seasons: 3, h: [9, 7, 8, 8, 8], re: 16, out: 46, keep: 37, unit: 100, gold: 5050, level: 23, xp: 65, color: 0x8a6a3a, leaf: 0x3f8f35 },
  { id: 'abacaxi', name: 'Abacaxi', seasons: 3, h: [11, 12, 11, 11, 11], re: 22, out: 48, keep: 38, unit: 101, gold: 5200, level: 26, xp: 70, color: 0xf2b134, leaf: 0x3f8f35 },
  { id: 'cereja', name: 'Cereja', seasons: 3, h: [9, 7, 8, 8, 8], re: 16, out: 52, keep: 42, unit: 103, gold: 5500, level: 28, xp: 80, color: 0xb0122b, leaf: 0x3f8f35 },
  { id: 'pitaya', name: 'Pitaya', seasons: 4, h: [12, 11, 9, 9, 9], re: 18, out: 46, keep: 37, unit: 138, gold: 6180, level: 31, xp: 60, color: 0xe0337f, leaf: 0x4a9e2f },
  { id: 'manga', name: 'Manga', seasons: 4, h: [10, 8, 9, 9, 9], re: 18, out: 46, keep: 35, unit: 169, gold: 6850, level: 36, xp: 60, color: 0xf2a12e, leaf: 0x3f8f35 },
  { id: 'cacau', name: 'Cacau', seasons: 4, h: [18, 17, 17, 17, 17], re: 51, out: 78, keep: 16, unit: 255, gold: 8500, level: 40, xp: 56, color: 0x8b4a1e, leaf: 0x3f8f35 },
  { id: 'caviar', name: 'Caviar', seasons: 1, h: [16, 14, 13, 14, 13], out: 20, keep: 3, unit: 1700, gold: 15000, level: 50, xp: 120, color: 0x2b2b3a, leaf: 0x3f8f35 },
  // Sementes VIP na tabela: aqui por ouro, para todos.
  { id: 'batata_doce', name: 'Batata-doce', seasons: 1, h: [5, 4, 3, 3, 3], out: 47, keep: 38, unit: 45, gold: 300, vip: true, level: 0, xp: 75, color: 0xc0603a, leaf: 0x4f9e3a },
  { id: 'limao', name: 'Limão', seasons: 3, h: [9, 7, 8, 8, 8], re: 16, out: 50, keep: 40, unit: 95, gold: 4300, vip: true, level: 18, xp: 75, color: 0xf2e23a, leaf: 0x3f8f35 },
  { id: 'amendoim', name: 'Amendoim', seasons: 1, h: [7, 6, 4, 4, 4], out: 57, keep: 34, unit: 125, gold: 2300, vip: true, level: 26, xp: 80, color: 0xc89a5a, leaf: 0x4f9e3a },
  { id: 'noz', name: 'Noz', seasons: 4, h: [18, 20, 17, 19, 18], re: 54, out: 28, keep: 4, unit: 1058, gold: 15500, vip: true, level: 48, xp: 62, color: 0x8b5a2b, leaf: 0x3f8f35 },
  // Só por moeda verde na tabela; aqui sementes de evento, por ouro pela regra de cima (renda ÷ 2,5). Árvore de Natal:
  // Natal. Cabaceira: Carnaval. Preços fixos de 6.000 e 5.000 de ouro dariam prejuízo (renda de 6.000 e 4.500), por
  // isso ficou a regra.
  { id: 'arvore_natal', name: 'Árvore de Natal', seasons: 1, h: [15, 14, 15, 14, 14], out: 12, keep: 1, unit: 500, gold: 0, greens: 6, level: 0, xp: 50, event: 'natal', color: 0x2e8b57, leaf: 0x2e8b57 },
  { id: 'cabaceira', name: 'Cabaceira', seasons: 1, h: [8, 8, 8, 8, 8], out: 45, keep: 35, unit: 100, gold: 0, greens: 6, level: 5, xp: 70, event: 'carnaval', color: 0xd9c27a, leaf: 0x3f8f35 },
  // Coco: 6 verdes e nível 0; com o preço da regra, rende o dobro por hora da manga,
  // por isso pede o nível dela (36). Bromélia: das "terras vermelhas" (o jogo não tem) e, no nível
  // 20 da tabela, renderia por hora 4× a melhor semente comum até ali: pede o nível do cacau (40).
  { id: 'coco', name: 'Coco', seasons: 4, h: [7, 7, 7, 7, 7], re: 14, out: 40, keep: 35, unit: 400, gold: 0, greens: 6, level: 0, minLevel: 18, xp: 100, color: 0x8b5a2b, leaf: 0x3f8f35 },
  { id: 'bromelia', name: 'Bromélia', seasons: 8, h: [6, 6, 6, 7, 8], re: 15, out: 60, keep: 35, unit: 126, gold: 8556, level: 20, minLevel: 20, xp: 16, color: 0xe2453c, leaf: 0x2e8b57 },
]

// Flores (aba Flores): não vendem; cada flor colhida é presente que dá `charm` de popularidade a quem recebe.
// Valores da tabela "Flores": tempo, unidades, ouro ou verdes, XP e popularidade.
// A tabela não traz nível: os níveis são decididos aqui. Popularidade em branco na tabela (estimada):
// nas flores de verdes ela segue 2,5 × verdes − 3 (Peônia 12 → 27 … Flor de Pêssego 26 → 62).
export const ORIGINAL_FLOWERS: OrigSeed[] = [
  // Girassol = "flor de sol" (id 102): 23,5 h, 3 unidades, 3.000 de ouro, 102 XP. Popularidade 1 (estimada).
  { id: 'girassol', name: 'Girassol', seasons: 1, h: 23.5, out: 3, unit: 0, gold: 3000, level: 0, minLevel: 3, xp: 102, flower: true, charm: 1, color: 0xffcc00, leaf: 0x4a9e2f },
  { id: 'lavanda', name: 'Lavanda', seasons: 1, h: 24, out: 1, unit: 0, gold: 0, greens: 8, level: 0, minLevel: 6, xp: 100, flower: true, charm: 17, color: 0x9b7fd1, leaf: 0x4a9e2f },
  { id: 'peonia', name: 'Peônia', seasons: 1, h: 16, out: 1, unit: 0, gold: 0, greens: 12, level: 0, minLevel: 6, xp: 120, flower: true, charm: 27, color: 0xf08bb4, leaf: 0x3f8f35 },
  { id: 'tulipa', name: 'Tulipa', seasons: 1, h: 17, out: 1, unit: 0, gold: 0, greens: 14, level: 0, minLevel: 7, xp: 140, flower: true, charm: 32, color: 0xe8392b, leaf: 0x4a9e2f },
  // Cravo (id 72) com a arte do cravo rosa.
  { id: 'flor_rosa', name: 'Cravo rosa', seasons: 1, h: 19, out: 1, unit: 0, gold: 0, greens: 22, level: 0, minLevel: 7, xp: 220, flower: true, charm: 52, color: 0xff5fa2, leaf: 0x4a9e2f },
  // Rosa Vermelha: 19.999 de ouro → 120 XP e 27 de popularidade.
  { id: 'rosa_vermelha', name: 'Rosa vermelha', seasons: 1, h: 19, out: 1, unit: 0, gold: 19999, greens: 10, level: 0, minLevel: 8, xp: 120, flower: true, charm: 27, color: 0xd7262e, leaf: 0x3f8f35 },
  // Rosa amarela (id 103): 4 verdes, 23,5 h, 3 unidades, 280 XP. Popularidade por flor: (2,5 × 4 − 3) ÷ 3 ≈ 2 (estimada).
  { id: 'rosa_amarela', name: 'Rosa amarela', seasons: 1, h: 23.5, out: 3, unit: 0, gold: 0, greens: 4, level: 0, minLevel: 9, xp: 280, flower: true, charm: 2, color: 0xf7d43a, leaf: 0x3f8f35 },
  { id: 'flor_trompete', name: 'Flor trompete', seasons: 1, h: 18, out: 1, unit: 0, gold: 0, greens: 18, level: 0, minLevel: 10, xp: 180, flower: true, charm: 42, color: 0xf59e2b, leaf: 0x3f8f35 },
  // Hortênsia azul com os números das Rosas Azuis (id 69), a flor azul da aba.
  { id: 'hortensia_azul', name: 'Hortênsia azul', seasons: 1, h: 17, out: 1, unit: 0, gold: 0, greens: 16, level: 0, minLevel: 11, xp: 160, flower: true, charm: 37, color: 0x5b8fe0, leaf: 0x3f8f35 },
  { id: 'lirios', name: 'Lírios', seasons: 1, h: 18, out: 1, unit: 0, gold: 0, greens: 20, level: 0, minLevel: 13, xp: 200, flower: true, charm: 47, color: 0xf7f2e8, leaf: 0x3f8f35 },
  // Cerejeira florida com os números da Flor de Pêssego (id 71), a flor rosa de árvore da aba.
  { id: 'cerejeira_florida', name: 'Cerejeira florida', seasons: 1, h: 20, out: 1, unit: 0, gold: 0, greens: 26, level: 0, minLevel: 14, xp: 260, flower: true, charm: 62, color: 0xf6b8cf, leaf: 0x4a9e2f },
  // As especiais por ouro: Dália dourada com os números do Crisântemo (id 61) e Orquídea real com os do Narciso
  // (id 63), a flor de ouro mais cara da aba.
  { id: 'dalia_dourada', name: 'Dália dourada', seasons: 1, h: 53, out: 1, unit: 0, gold: 11120, level: 0, minLevel: 18, xp: 85, flower: true, charm: 11, color: 0xf2c230, leaf: 0x3f8f35 },
  { id: 'orquidea_real', name: 'Orquídea real', seasons: 1, h: 60, out: 1, unit: 0, gold: 14800, level: 0, minLevel: 20, xp: 96, flower: true, charm: 14, color: 0x8e44ad, leaf: 0x3f8f35 },
]

// Culturas de evento completo (event-content.ts) entram com a mesma régua; a loja só mostra na época (events.ts).
export const SEEDS: Seed[] = [...ORIGINAL_SEEDS, ...ORIGINAL_FLOWERS, ...EVENT_SEED_DEFS].map(fromOriginal)

export const SEED_BY_ID: Record<string, Seed> = Object.fromEntries(SEEDS.map((s) => [s.id, s]))

// Os 6 estágios (0..5), um sprite cada em public/art/crops1 (lote P), mais o murcho.
// Os nomes do balão do lote são estes (GROWTH_NAMES em lines.ts, mesma ordem).
export const STAGE_NAMES = ['semente', 'broto', 'folhas pequenas', 'folhas grandes', 'florescendo', 'maduro'] as const
/** Estágio a que as culturas de várias safras voltam depois da colheita ("folhas grandes"), quando o banco não diz outro. */
export const REGROW_STAGE = 3
/** Os 5 estágios em trechos iguais (cultura sem as horas oficiais de cada estágio). */
export const EVEN_STAGES: readonly number[] = [0, 0.2, 0.4, 0.6, 0.8, 1]
/** Início de cada estágio (0..5) em fração do crescimento. */
export const stageFracs = (seed?: Pick<Seed, 'stageFr'> | null): readonly number[] => seed?.stageFr ?? EVEN_STAGES
/** Estágio a que a cultura volta na safra seguinte: o primeiro cujos estágios restantes somam o tempo de
 *  reamadurecer da tabela (morango 6 + 6 = 12 h → folhas grandes; cacau e noz 17 × 3 → folhas pequenas). */
export function regrowStage(seed: Seed): number {
  const fr = seed.stageFr
  if (!fr || !seed.regrowMinutes) return REGROW_STAGE
  const rest = seed.regrowMinutes / seed.growMinutes
  for (let k = 1; k < fr.length - 1; k++) if (Math.abs(1 - fr[k] - rest) < 1e-6) return k
  return REGROW_STAGE
}
/** Sprite da cultura (256×256, base da planta em (128,192)); sem estágio = maduro. */
export const cropArt = (id: string, stage: number | 'withered' = STAGE_NAMES.length - 1) => `/art/crops1/${id}_${stage}.png`

/** Arquivo do ícone `name` (o `Icon`): "crop:<id>" = cultura madura; "anim:<id>" = quadro parado do bicho ou do
 *  acessório; "deco/", "event/", "animals/" e "items/" = caminho sob public/art; o resto, public/art/ui. */
export function iconUrl(name: string): string {
  if (name.startsWith('crop:')) return cropArt(name.slice(5))
  if (name.startsWith('anim:')) return `/art/animals/${name.slice(5)}_idle_0.png`
  if (/^(deco|event|animals|items)\//.test(name)) return `/art/${name}.png`
  return `/art/ui/${name}.png`
}

// Itens do inventário: colheita usa o id da cultura ("nabo"); semente usa "semente:<id>".
export const seedItem = (seedId: string) => `semente:${seedId}`
// Flor colhida (não vende, não é roubada): presente que dá popularidade a quem recebe.
export const flowerItem = (seedId: string) => `flor:${seedId}`

export type ShopTab = 'sementes' | 'flores' | 'ferramentas' | 'animais' | 'decoracao'
export const SHOP_TABS: { id: ShopTab; name: string }[] = [
  { id: 'sementes', name: 'Sementes' },
  { id: 'flores', name: 'Flores' },
  { id: 'ferramentas', name: 'Ferramentas' },
  { id: 'animais', name: 'Animais' },
  { id: 'decoracao', name: 'Decoração' },
]

export type ShopItem = {
  id: string // id do item no inventário (ou do animal)
  name: string
  tab: ShopTab
  gold: number
  minLevel: number
  desc: string
  seedId?: string
  icon: string // chave de arte (public/art) ou emoji de fallback
  event?: string // só aparece (e só se compra) na época do evento
}

const isConfigEvent = (id: string): id is GameEvent => id in EVENTS
const EVENT_BY = Object.fromEntries(EVENT_DEFS.map((e) => [e.id, e]))
/** Nome do evento do item (Natal, Dia das Bruxas). */
export const eventName = (id: string) => (isConfigEvent(id) ? EVENTS[id].name : EVENT_BY[id]?.name ?? id)
/** O item está à venda pelo calendário? (sementes de evento só na época delas). O servidor e a loja usam events.ts
 *  (shopOpenFor), que soma o atalho de QA e a trava do Bis Limão (a semente sai da loja antes do fim). */
export const onSale = (i: Pick<ShopItem, 'event'>, now: number = Date.now()) =>
  !i.event || (isConfigEvent(i.event) ? inSeason(i.event, now) : !!EVENT_BY[i.event] && inCalendar(EVENT_BY[i.event].calendar, now))

export const SHOP: ShopItem[] = [
  // Ordem da loja: por nível e, no mesmo nível, por preço (as VIP e as de verdes entram no lugar delas).
  ...SEEDS.filter((s) => !s.needsArt).sort((x, y) => x.minLevel - y.minLevel || x.cost - y.cost).map((s): ShopItem => ({
    id: seedItem(s.id), name: s.name, tab: s.flower ? 'flores' : 'sementes', gold: s.cost, minLevel: s.minLevel, seedId: s.id,
    icon: `crop:${s.id}`, ...(s.event ? { event: s.event } : {}),
    desc: s.flower
      ? `${fmtMinutes(s.growMinutes)} · ${s.yieldMax > 1 ? `${s.yieldMax} flores` : 'vira flor'} para dar de presente (+${s.charm ?? 1} de popularidade a quem recebe; +1% na venda por ponto, até +${POPULARITY_CAP}%) · +${s.xp} XP`
      : `${fmtMinutes(s.growMinutes)} · rende ${fmtRange(s.yieldMin, s.yieldMax)} × ${fmtGold(s.sellPrice)} · +${s.xp} XP`
        + (s.seasons ? ` · ${s.seasons} safras (mais ${fmtMinutes(s.regrowMinutes!)} cada)` : '')
        + (s.id === TUTORIAL.seedId ? ` · no nível ${TUTORIAL.maxLevel}, fica pronto em ${TUTORIAL.minutes} min` : '')
        + (s.event ? ` · só na época: ${eventName(s.event)}` : ''),
  })),
  // Adubos: preço × PACE.gold; o corte de tempo × PACE.time (config.ts). 1 por estágio.
  ...Object.values(FERTILIZERS).map((f): ShopItem => ({
    id: f.id, name: f.name, tab: 'ferramentas', gold: origGold(f.origGold), minLevel: f.minLevel, icon: 'tool_fertilizer',
    desc: `Adianta a planta (no original, −${fmtHours(f.origCutH)}) · 1 por estágio`,
  })),
  // Rações dos bichos: cada porção enche metade da barra de alimento.
  ...Object.values(FEEDS).map((f): ShopItem => ({
    id: f.id, name: f.name, tab: 'ferramentas', gold: origGold(f.origGold), minLevel: 1, icon: FEED_ICON[f.id], desc: `Porção para ${f.desc} · alimenta por ${fmtMinutes(f.hours * 60 * PACE.animalTime)}`,
  })),
  { id: 'racao', name: 'Ração (24 h)', tab: 'ferramentas', gold: 30, minLevel: 1, icon: 'dog_food', desc: 'O cachorro só morde ladrão de barriga cheia' },
  // Cachorros de guarda (raças em config.ts): item `cao:<raça>`.
  ...Object.values(DOG_BREEDS).map((b): ShopItem => ({
    id: `cao:${b.id}`, name: b.name, tab: 'animais', gold: b.gold, minLevel: b.minLevel, icon: dogIcon(b.id),
    desc: (b.guard ? 'Fica no lugar do cachorro · ' : '') + `Morde ${Math.round(b.bite * 100)}% dos ladrões e cobra ${Math.round(b.finePct * 100)}% do ouro deles (até ${b.fineMax}) · `
      + (b.days ? `fica ${b.days} dias` : 'fica para sempre') + ' · precisa de ração',
  })),
  // Bichos produtivos à venda (os iniciais já vêm com a fazenda). Sem arte, não aparece. Item `bicho:<tipo>`.
  ...Object.values(LIVESTOCK).filter((l) => l.art && !l.starter).map((l): ShopItem => ({
    id: `bicho:${l.kind}`, name: l.name, tab: 'animais', gold: origGold(l.origGold), minLevel: l.minLevel, icon: `anim:${l.kind}`,
    desc: `Produz ${PRODUCTS[l.product]?.name ?? itemName(l.product)} · come ${FEEDS[l.feed].name}`,
  })),
  // Acessórios dos bichos (lote O): só estética, vestir e tirar na ficha do bicho. Item `acc:<id>`.
  // Itens que só vendem no evento (event-content.ts), ex.: o pacote de doces da tigela.
  ...EVENT_DEFS.flatMap((e) => e.shop.map((it): ShopItem => ({ id: it.id, name: it.name, tab: 'ferramentas', gold: it.gold, minLevel: 1, icon: it.icon, desc: it.desc, event: e.id }))),
  ...ACCESSORIES.map((a): ShopItem => ({
    id: accItem(a.id), name: `${a.name} (${a.animal === 'dog' ? 'Cachorro' : LIVESTOCK[a.animal].name})`, tab: 'animais', gold: origGold(a.origGold), minLevel: 1,
    icon: `acc_${a.id}`, desc: 'Enfeite para o bicho adulto: vista e tire na ficha dele · só estética',
  })),
]

export const SHOP_BY_ID: Record<string, ShopItem> = Object.fromEntries(SHOP.map((i) => [i.id, i]))

/** Moedas e itens de evento (o doce e o pacote de doces do Dia das Bruxas; materiais, presentes, cartões e ovos da
 *  Evolução 13): ficam no depósito, não vendem. */
const EVENT_CURRENCY: Record<string, { name: string; icon: string; emoji: string }> = Object.fromEntries(
  EVENT_DEFS.flatMap((e) => [...(e.items ?? []).map((it) => [it.id, it]), ...(e.currency ? [[e.currency.id, e.currency]] : []), ...e.shop.map((it) => [it.id, it])]))

export function itemName(itemId: string): string {
  if (EVENT_CURRENCY[itemId]) return EVENT_CURRENCY[itemId].name
  if (itemId.startsWith('semente:')) return `Semente de ${SEED_BY_ID[itemId.slice(8)]?.name ?? '?'}`
  if (itemId.startsWith('flor:')) return `Flor de ${SEED_BY_ID[itemId.slice(5)]?.name ?? '?'}`
  if (itemId.startsWith('acc:')) return SHOP_BY_ID[itemId]?.name ?? ACCESSORY_BY_ID[itemId.slice(4)]?.name ?? itemId
  return SEED_BY_ID[itemId]?.name ?? PRODUCTS[itemId]?.name ?? SHOP_BY_ID[itemId]?.name ?? itemId
}

/** Preço de venda de um item do depósito (0 = não vende): colheita ou produto de bicho. */
export function sellPriceOf(itemId: string): number {
  return SEED_BY_ID[itemId]?.sellPrice ?? productPrice(itemId)
}

function fmtHours(h: number): string {
  const m = Math.round(h * 60)
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60}` : `${m / 60} h`
}

export function fmtMinutes(min: number): string {
  return min >= 60 ? `${+(min / 60).toFixed(1)} h` : `${+min.toFixed(1)} min`
}

/** Ouro com até 1 casa decimal, no jeito brasileiro ("1,3"; "1.500"). */
export function fmtGold(n: number): string {
  return GOLD_FMT.format(n)
}
/** "3–5"; um número só quando min === max ("4"). Com fmt = fmtGold: "46,8". */
export function fmtRange(a: number, b: number, fmt: (n: number) => string = String): string {
  return a === b ? fmt(a) : `${fmt(a)}–${fmt(b)}`
}

// Ícone de produto (public/art/ui/produto_<id>.png): lote N, os 11 do lote P e os 9 do lote Q; as outras culturas usam a planta madura.
const PRODUCT_ART = new Set(['maca', 'laranja', 'cereja', 'pessego', 'limao', 'coco', 'banana', 'rosa_vermelha', 'rosa_amarela', 'lavanda', 'hortensia_azul', 'flor_rosa', 'cerejeira_florida',
  'nabo', 'cenoura', 'milho', 'tomate', 'morango', 'girassol', 'batata', 'abobora', 'berinjela', 'melancia', 'uva',
  'abacaxi', 'pitaya', 'bromelia', 'tulipa', 'flor_trompete', 'peonia', 'lirios', 'orquidea_real', 'dalia_dourada',
  // Lote R: as 15 sementes básicas que faltavam.
  'pimenta', 'ervilha', 'roma', 'melao', 'cana', 'lichia', 'kiwi', 'manga', 'cacau', 'caviar', 'batata_doce', 'amendoim', 'noz', 'cabaceira', 'arvore_natal',
  'pinheiro_natal', 'lotus_chiba', 'albizia', 'serpentina', 'rabanete_verao', 'tomate_cereja', 'cacau_pascoa', 'lirio_pascoa', 'coracao_mae',
  'orquidea_branca', 'cravo', 'arvore_coracao', 'pamonha', 'pe_de_moleque', 'milho_caipira', 'semente_papai',
  // Lote S (Dia das Bruxas): ícone recortado da fonte da planta madura.
  'abobora_halloween',
  // Lotes T/U (Folclore e Dia das Crianças); os três ícones de Folclore foram refeitos no lote X.
  'guine', 'espada_sao_jorge', 'comigo_ninguem_pode', 'jujuba', 'pirulito'])
const PRODUCT_EMOJI: Record<string, string> = {
  ovo: '🥚', carne: '🍖', carne_porco: '🍖', leite: '🥛', la: '🧶', ovo_pata: '🥚', pelo: '🐇', leite_cabra: '🥛', pena: '🪶', mel: '🍯',
}
const FEED_EMOJI: Record<string, string> = { racao_aves: '🌾', feno: '🌾', lavagem: '🪣', racao_crescem: '🌾', xarope: '🍯' }

/** Ícone de qualquer item do depósito/sacola: arte (public/art/ui ou a cultura madura) e emoji de reserva. */
export function itemIcon(itemId: string): { name: string; emoji: string } {
  if (itemId.startsWith('semente:')) return { name: `crop:${itemId.slice(8)}`, emoji: '🌱' }
  if (EVENT_CURRENCY[itemId]) return { name: EVENT_CURRENCY[itemId].icon, emoji: EVENT_CURRENCY[itemId].emoji }
  if (itemId.startsWith('flor:')) { const id = itemId.slice(5); return { name: PRODUCT_ART.has(id) ? `produto_${id}` : `crop:${id}`, emoji: '🌻' } }
  if (SEED_BY_ID[itemId]) return { name: PRODUCT_ART.has(itemId) ? `produto_${itemId}` : `crop:${itemId}`, emoji: '🥕' }
  if (PRODUCTS[itemId]) return { name: PRODUCT_ICON[itemId] ?? `prod_${itemId}`, emoji: PRODUCT_EMOJI[itemId] ?? '📦' }
  if (isFeed(itemId)) return { name: FEED_ICON[itemId], emoji: FEED_EMOJI[itemId] ?? '🌾' }
  if (itemId.startsWith('adubo')) return { name: 'tool_fertilizer', emoji: '🧪' }
  if (itemId === 'osso') return { name: 'bone', emoji: '🦴' }
  if (itemId.startsWith('acc:')) { const a = ACCESSORY_BY_ID[itemId.slice(4)]; return { name: a ? `acc_${a.id}` : itemId, emoji: '🎀' } }
  if (itemId === 'racao') return { name: 'dog_food', emoji: '🦴' }
  return { name: itemId, emoji: '📦' }
}
