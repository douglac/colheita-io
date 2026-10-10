// Bichos produtivos. Regras puras: sem I/O, tudo recebe `now`.
//
// - Barra de alimento x/100 que cai com o tempo; cada porção de ração própria enche 50.
// - Estágios de crescimento ("22H58M para Estágio 3"): só contam enquanto o bicho está alimentado.
// - Adulto, produz um lote a cada ciclo ("produzido 23, restam 23"); o dono colhe tudo de uma vez e o
//   amigo pega 1 por toque, até o piso do dono (as mesmas regras do roubo de horta).
// - Com fome, o tempo do bicho para: não cresce nem produz. Não morre de fome.
// - Bicho de corte (`meat`, como o burro): cresce por estágios até
//   maduro, mostra "plantado N, ainda restam M", é colhido com a mão (a carne sobe com ×N) e sai da fazenda.
//   Amigo pega 1 por toque com o mesmo piso. Sem animação de morte.
//
// Números em unidades da tabela (horas, ouro) e convertidos pelo PACE (config.ts).
import { origAnimalMs, origUnit } from './config'

export type FeedId = 'racao_aves' | 'feno' | 'lavagem' | 'racao_crescem' | 'xarope'
export type LivestockKind = 'chicken' | 'cow' | 'sheep' | 'pig' | 'duck' | 'rabbit' | 'goat' | 'peacock' | 'donkey' | 'bee'

export type Livestock = {
  kind: LivestockKind
  name: string
  feed: FeedId
  stagesH: number[] // horas (alimentado) de cada estágio até o adulto; adulto = estágio stagesH.length + 1
  cycleH: number // horas (alimentado) de cada lote de produção
  yieldMin: number; yieldMax: number
  keep?: number // fração do lote que fica com o dono depois do roubo (`min_output` ÷ `output`); sem ela, 60%
  product: string // item no depósito
  origGold: number // preço de compra na tabela (ou estimado)
  minLevel: number
  art: boolean // sem arte não aparece na loja (pato, coelho, cabra, pavão e burro: lote J; colmeia: lote Q)
  starter?: boolean // já vem com a fazenda (os bichos que sempre passearam por ela), adulto
  meat?: boolean // bicho de corte: um lote só quando maduro; colhido, sai da fazenda
}

// Produtos: nome e preço de venda (ouro da tabela "Produtos"). Pelo de coelho = "Coelho" (388) e leite de cabra = leite
// (220), estimados.
export const PRODUCTS: Record<string, { name: string; origPrice: number }> = {
  ovo: { name: 'Ovo', origPrice: 160 },
  leite: { name: 'Balde de leite', origPrice: 220 },
  la: { name: 'Lã', origPrice: 390 },
  ovo_pata: { name: 'Ovo de pata', origPrice: 379 },
  pelo: { name: 'Pelo de coelho', origPrice: 388 },
  leite_cabra: { name: 'Leite de cabra', origPrice: 220 },
  pena: { name: 'Pena de pavão', origPrice: 420 },
  mel: { name: 'Pote de mel', origPrice: 320 },
  carne: { name: 'Carne', origPrice: 1299 }, // burro: 160 × 1.299 = 207.840
  carne_porco: { name: 'Carne de porco', origPrice: 1800 }, // porco: 100 × 1.800
}
export const productPrice = (id: string) => (PRODUCTS[id] ? origUnit(PRODUCTS[id].origPrice) : 0)

// Rações (a comida sai da sacola; a errada dá "Essa comida não é adequada para Cabra!").
// Preço e duração: "Alimento para galinha" 40 ("Ele alimenta a galinha durante 8 horas"),
// "Alimento para gado" 60 (8 h), "Alimento para porco" 60 (12 h) e "Comida para animais do tipo que produzem" 120
// (8 h), esta para as abelhas, e "Comida para animais do tipo que crescem" 80 (12 h), para o burro (o coelho
// produz pelo e come feno).
// Cada porção enche a barra pelo tempo dela (8 h = 1/3 da barra de 24 h). Ícones: sacos do lote W (A7), `feedIcon`.
export const FEEDS: Record<FeedId, { id: FeedId; name: string; origGold: number; hours: number; desc: string }> = {
  racao_aves: { id: 'racao_aves', name: 'Ração de aves', origGold: 40, hours: 8, desc: 'Galinha, pato e pavão' },
  feno: { id: 'feno', name: 'Feno', origGold: 60, hours: 8, desc: 'Vaca, ovelha, cabra e coelho' },
  lavagem: { id: 'lavagem', name: 'Lavagem', origGold: 60, hours: 12, desc: 'Porco' },
  racao_crescem: { id: 'racao_crescem', name: 'Ração dos que crescem', origGold: 80, hours: 12, desc: 'Burro' },
  xarope: { id: 'xarope', name: 'Xarope de flores', origGold: 120, hours: 8, desc: 'Abelhas' },
}
export const isFeed = (id: string): id is FeedId => id in FEEDS
/** Saco de ração do lote W (public/art/items, A7): galinha, gado, porco, "que crescem" e "que produzem". */
export const FEED_ICON: Record<FeedId, string> = {
  racao_aves: 'items/racao_galinha', feno: 'items/racao_gado', lavagem: 'items/racao_porco', racao_crescem: 'items/racao_crescem', xarope: 'items/racao_produzem',
}
/** Ícone de produto com arte (lote W, A7; o ovo é o do lote Q); os outros ficam no emoji. */
export const PRODUCT_ICON: Record<string, string> = {
  ovo: 'produto_ovo_comum', ovo_pata: 'items/ovo_pata', mel: 'items/mel', pena: 'items/pena_pavao',
}

export const FOOD = {
  fullH: 24, // barra cheia dura 24 h da tabela (× PACE.animalTime)
  portion: 50, // porção sem tempo próprio (ex.: ração antiga): metade da barra
  fullAt: 90, // daqui para cima: "Já estou alimentado!"
  xp: 2, // por porção
}
/** Quanto da barra (0..100) uma porção desta ração enche. */
export const feedPortion = (feed?: FeedId) => (feed ? (100 * FEEDS[feed].hours) / FOOD.fullH : FOOD.portion)

// Bichos com os valores de balanceamento do jogo: preço (ouro ou, sem ouro, 1.000 por moeda verde, a mediana de
// galinha, vaca, ovelha, porco e burro, que tinham os dois preços), 3 coletas por dia (ciclo de 8 h),
// piso do dono (`min_output` ÷ `output`) e os estágios dos bichos de corte. Nenhum bicho pede nível (a loja só
// mostra nível em semente). Lote por coleta: cerca de metade do `output` da tabela (galinha 50 → 23–26, vaca 54 → 27).
export const LIVESTOCK: Record<LivestockKind, Livestock> = {
  // Galinha 8.000 ou 9 verdes; "22H58M para Estágio 3"; "produzido 23"; piso 40/50.
  chicken: { kind: 'chicken', name: 'Galinha', feed: 'racao_aves', stagesH: [24, 24], cycleH: 8, yieldMin: 20, yieldMax: 26, keep: 40 / 50, product: 'ovo', origGold: 8000, minLevel: 1, art: true, starter: true },
  // Vaca 50.000; leite 3× por dia; "produzido 27"; piso 43/54.
  cow: { kind: 'cow', name: 'Vaca', feed: 'feno', stagesH: [36, 36], cycleH: 8, yieldMin: 24, yieldMax: 30, keep: 43 / 54, product: 'leite', origGold: 50000, minLevel: 1, art: true, starter: true },
  // Ovelha 180.000; output 24, piso 14.
  sheep: { kind: 'sheep', name: 'Ovelha', feed: 'feno', stagesH: [36, 36], cycleH: 8, yieldMin: 11, yieldMax: 13, keep: 14 / 24, product: 'la', origGold: 180000, minLevel: 1, art: true, starter: true },
  // Porco: bicho de corte ("O Porco é um animal que você venderá quando crescer"), 100.000, estágios 24/48/48/48 h
  // (7 dias), 100 × 1.800. Piso = rendimento (100 de 100): ninguém pega do porco nem do burro.
  pig: { kind: 'pig', name: 'Porco', feed: 'lavagem', stagesH: [24, 48, 48, 48], cycleH: 0, yieldMin: 100, yieldMax: 100, keep: 1, product: 'carne_porco', origGold: 100000, minLevel: 1, art: true, starter: true, meat: true },
  // Pato: 69 verdes → 69.000; "38H16M para Estágio 2"; output 31, piso 18.
  duck: { kind: 'duck', name: 'Pato', feed: 'racao_aves', stagesH: [40, 40], cycleH: 8, yieldMin: 15, yieldMax: 16, keep: 18 / 31, product: 'ovo_pata', origGold: 69000, minLevel: 1, art: true },
  // Coelho: 59 verdes → 59.000. Produz pelo (arte do lote J).
  rabbit: { kind: 'rabbit', name: 'Coelho', feed: 'feno', stagesH: [24, 24], cycleH: 8, yieldMin: 14, yieldMax: 20, product: 'pelo', origGold: 59000, minLevel: 1, art: true },
  // Cabra ("Essa comida não é adequada para Cabra!"). Produz leite: preço, lote e ciclo da vaca, um pouco menores.
  goat: { kind: 'goat', name: 'Cabra', feed: 'feno', stagesH: [30, 30], cycleH: 8, yieldMin: 18, yieldMax: 24, product: 'leite_cabra', origGold: 40000, minLevel: 1, art: true },
  // Pavão: 99 verdes → 99.000; output 20, piso 12.
  peacock: { kind: 'peacock', name: 'Pavão', feed: 'racao_aves', stagesH: [48, 48], cycleH: 8, yieldMin: 10, yieldMax: 10, keep: 12 / 20, product: 'pena', origGold: 99000, minLevel: 1, art: true },
  // Burro, de corte: 100.000, estágios 72/48/72/48 h (10 dias), 160 × 1.299
  // ("Tempo de amadurecimento: 10 Dias"); colhido vira carne ×160 e sai. Piso 160/160.
  donkey: { kind: 'donkey', name: 'Burro', feed: 'racao_crescem', stagesH: [72, 48, 72, 48], cycleH: 0, yieldMin: 160, yieldMax: 160, keep: 1, product: 'carne', origGold: 100000, minLevel: 1, art: true, meat: true },
  // Colmeia: 28 verdes → 28.000; output 24, piso 14; "Resultado depois de 5H29M" cabe no ciclo de 8 h.
  // Lote 12 (metade do output 24).
  bee: { kind: 'bee', name: 'Abelhas', feed: 'xarope', stagesH: [], cycleH: 8, yieldMin: 11, yieldMax: 13, keep: 14 / 24, product: 'mel', origGold: 28000, minLevel: 1, art: true },
}

/** Lugar do bicho na fazenda (as duas galinhas iniciais são 'chicken' e 'chicken2'). */
export const STARTER_SLOTS = ['chicken', 'chicken2', 'cow', 'sheep', 'pig'] as const
export const kindOfSlot = (slot: string): LivestockKind | null => {
  const k = slot.replace(/\d+$/, '')
  return k in LIVESTOCK ? (k as LivestockKind) : null
}

export const growTotalMs = (l: Livestock) => l.stagesH.reduce((a, h) => a + origAnimalMs(h), 0)
export const cycleMs = (l: Livestock) => origAnimalMs(l.cycleH)
export const foodFullMs = () => origAnimalMs(FOOD.fullH)

export type AnimalRow = {
  id: string; slot: string; kind: string
  fed_until: number | null
  fed_ms: number // tempo alimentado acumulado até settled_at
  settled_at: number
  cycle_from: number // tempo alimentado em que o lote atual começou a ser produzido
  batch_seq: number
  taken: number // unidades já levadas por amigos do lote pronto
}

export type AnimalView = {
  slot: string; kind: LivestockKind; name: string
  food: number // 0..100
  stage: number; stages: number // estágio atual (1..stages); stages = adulto
  nextStageMs: number | null // tempo alimentado que falta para o próximo estágio
  cycleLeftMs: number | null // adulto produzindo: tempo alimentado que falta para o lote
  ready: boolean
  produced?: number; left?: number // lote pronto: "produzido N, restam M"
  hungry: boolean
  meat: boolean // bicho de corte: o lote é ele mesmo ("plantado N, ainda restam M")
  look: Look // desenho da idade (lote O de arte): filhote, jovem ou adulto
  canSteal?: boolean // só em visita
}

/** Tempo alimentado acumulado até `now`. */
export function fedProgress(a: AnimalRow, now: number): number {
  return a.fed_ms + Math.max(0, Math.min(now, a.fed_until ?? 0) - a.settled_at)
}

export function foodAt(a: AnimalRow, now: number): number {
  return Math.max(0, Math.min(100, Math.ceil((100 * ((a.fed_until ?? 0) - now)) / foodFullMs())))
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Tamanho do lote: fixo por bicho e por lote (sorteio determinístico, não precisa guardar). */
export function batchSize(a: Pick<AnimalRow, 'id' | 'batch_seq'>, l: Livestock): number {
  return l.yieldMin + (hash(`${a.id}#${a.batch_seq}`) % (l.yieldMax - l.yieldMin + 1))
}

export function viewAnimal(a: AnimalRow, now: number): AnimalView | null {
  const kind = kindOfSlot(a.slot)
  if (!kind) return null
  const l = LIVESTOCK[kind]
  const p = fedProgress(a, now)
  const food = foodAt(a, now)
  const stages = l.stagesH.length + 1
  const v: AnimalView = { slot: a.slot, kind, name: l.name, food, stage: stages, stages, nextStageMs: null, cycleLeftMs: null, ready: false, hungry: food <= 0, meat: !!l.meat, look: 'adult' }
  let acc = 0
  for (let i = 0; i < l.stagesH.length; i++) {
    acc += origAnimalMs(l.stagesH[i])
    if (p < acc) { v.stage = i + 1; v.nextStageMs = acc - p; v.look = lookOf(v.stage, stages); return v }
  }
  const from = Math.max(a.cycle_from, acc)
  const left = from + cycleMs(l) - p
  if (left > 0) { v.cycleLeftMs = left; return v }
  v.ready = true
  v.produced = batchSize(a, l)
  v.left = Math.max(0, v.produced - a.taken)
  return v
}

/** Estado "acertado" agora (antes de mudar a ração ou começar um lote novo). */
export function settle(a: AnimalRow, now: number): { fed_ms: number; settled_at: number } {
  return { fed_ms: fedProgress(a, now), settled_at: now }
}

/** Nova data de fim da ração depois de uma porção (a barra nunca passa de 100). */
export function feedUntil(a: AnimalRow, now: number, portion: number = FOOD.portion): number {
  const from = Math.max(now, a.fed_until ?? 0)
  return Math.min(now + foodFullMs(), from + (foodFullMs() * portion) / 100)
}

/** Mensagem para comida errada. */
export const wrongFood = (l: Livestock) => `Essa comida não é adequada para ${l.name}!`
/** Balão do bicho sem produção ("Porco: não há nada para pegar aqui."). */
export const nothingHere = (l: Livestock) => `${l.name}: não há nada para pegar aqui.`

export type Look = 'baby' | 'teen' | 'adult'
/** Estágio numerado → desenho: a 1ª metade dos estágios de crescimento é filhote, a 2ª é jovem,
 *  o último é adulto (galinha 1·2·3 = filhote·jovem·adulto; burro e porco 1-2·3-4·5). */
export function lookOf(stage: number, stages: number): Look {
  if (stage >= stages) return 'adult'
  return stage <= Math.ceil((stages - 1) / 2) ? 'baby' : 'teen'
}

// ---------- acessórios (lote O de arte) ----------
// Camada por cima do adulto, só estética, no espírito da decoração (compra com ouro, sem efeito na produção).
/** `spot`: onde o enfeite fica no corpo. Um por lugar: vestir outro no mesmo lugar troca (o de antes volta ao depósito). */
export type AccessorySpot = 'cabeca' | 'pescoco' | 'costas'
export type Accessory = { id: string; animal: LivestockKind | 'dog'; name: string; origGold: number; spot: AccessorySpot }
export const ACCESSORIES: Accessory[] = [
  { id: 'donkey_sela', animal: 'donkey', name: 'Sela', origGold: 6000, spot: 'costas' },
  { id: 'donkey_chapeu', animal: 'donkey', name: 'Chapéu de palha', origGold: 4000, spot: 'cabeca' },
  { id: 'donkey_flores', animal: 'donkey', name: 'Coroa de flores', origGold: 3000, spot: 'cabeca' },
  { id: 'donkey_sino', animal: 'donkey', name: 'Sino', origGold: 3000, spot: 'pescoco' },
  { id: 'cow_sino', animal: 'cow', name: 'Sino', origGold: 3000, spot: 'pescoco' },
  { id: 'cow_laco', animal: 'cow', name: 'Laço', origGold: 2000, spot: 'cabeca' },
  { id: 'dog_coleira_spike', animal: 'dog', name: 'Coleira de spike', origGold: 5000, spot: 'pescoco' },
  { id: 'dog_lenco', animal: 'dog', name: 'Lenço', origGold: 3000, spot: 'pescoco' },
  { id: 'sheep_laco', animal: 'sheep', name: 'Laço', origGold: 2000, spot: 'cabeca' },
  { id: 'chicken_chapeu', animal: 'chicken', name: 'Chapéu', origGold: 2000, spot: 'cabeca' },
]
export const ACCESSORY_BY_ID: Record<string, Accessory> = Object.fromEntries(ACCESSORIES.map((a) => [a.id, a]))
/** Item no inventário: `acc:<id>`. Sprite: animals/<bicho>_acc_<nome>_{walk,idle}_N.png (mesma âncora do adulto). */
export const accItem = (id: string) => `acc:${id}`
export const accSprite = (a: Accessory) => `${a.animal}_acc_${a.id.slice(a.animal.length + 1)}`

/** Formato "22H58M" do jogo. */
export function fmtHM(ms: number): string {
  const m = Math.max(0, Math.ceil(ms / 60_000))
  return `${Math.floor(m / 60)}H${String(m % 60).padStart(2, '0')}M`
}
