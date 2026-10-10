// Catálogo da decoração. Duas partes:
// A) Séries: 5 peças por série, cada uma troca a peça do lugar fixo dela.
// B) Enfeites soltos, organizados: ficam na grade das zonas de decoração (decor-grid.ts).
// Preços saem de config.ts (DECOR × PACE, ornamentPrice); nada de número de preço repetido aqui.
import { DECOR, ornamentPrice, PACE } from './config'

export const SLOTS = ['fundo', 'casa', 'casinha', 'enfeite', 'cerca'] as const
export type Slot = (typeof SLOTS)[number]
export const SLOT_NAMES: Record<Slot, string> = { fundo: 'Paisagem', casa: 'Casa', casinha: 'Casinha do cachorro', enfeite: 'Enfeite', cerca: 'Cerca' }

export type Series = {
  id: string; name: string; minLevel: number
  pieces: Record<Slot, string> // nome de cada peça
  color: number // cor de destaque do placeholder
  event?: string // série de evento (event-content.ts): só à venda na época; quem comprou usa o ano todo
}

/** Série padrão de todo fazendeiro (já vem equipada e não se compra). */
export const DEFAULT_SERIES = 'sitio'

export const SERIES: Series[] = [
  {
    id: 'sitio', name: 'Sítio', minLevel: 1, color: 0x8fd14f,
    pieces: { fundo: 'Céu e morros verdes', casa: 'Casa de tábuas', casinha: 'Casinha de madeira', enfeite: 'Carroça florida', cerca: 'Cerca de madeira' },
  },
  {
    id: 'arco_iris', name: 'Arco-íris', minLevel: 5, color: 0xff7ac8,
    pieces: { fundo: 'Céu de arco-íris', casa: 'Casa pastel', casinha: 'Casinha pastel', enfeite: 'Fonte arco-íris', cerca: 'Cerca pastel' },
  },
  {
    id: 'inverno', name: 'Inverno', minLevel: 9, color: 0xbfe6ff,
    pieces: { fundo: 'Montanhas nevadas', casa: 'Chalé nevado', casinha: 'Casinha nevada', enfeite: 'Boneco de neve', cerca: 'Cerca nevada' },
  },
  // Dia das Bruxas (lote S, public/art/deco/bruxinha): só na loja durante o evento.
  {
    id: 'bruxinha', name: 'Bruxinha', minLevel: 3, color: 0x8e5bd6, event: 'halloween',
    pieces: { fundo: 'Crepúsculo lilás', casa: 'Casa da bruxinha', casinha: 'Casinha da bruxinha', enfeite: 'Abóbora encantada', cerca: 'Cerca estrelada' },
  },
  // Evolução 13 (arte dos lotes T e U): séries dos eventos. minLevel 3, como a Bruxinha; a do Natal é dada (E10).
  {
    id: 'natal', name: 'Natal', minLevel: 1, color: 0xd23a3a, event: 'natal',
    pieces: { fundo: 'Cenário de Natal', casa: 'Casa de Natal', casinha: 'Canil de Natal', enfeite: 'Jardim de Natal', cerca: 'Cerca de Natal' },
  },
  {
    id: 'belo_ano_novo', name: 'Belo Ano Novo', minLevel: 3, color: 0x2b3f8f, event: 'ano_novo',
    pieces: { fundo: 'Cenário do Belo Ano Novo', casa: 'Casa enfeitada', casinha: 'Casinha de serpentina', enfeite: 'Relógio da virada', cerca: 'Cerca de luzinhas' },
  },
  {
    id: 'folia', name: 'Folia', minLevel: 3, color: 0xff5fa2, event: 'carnaval',
    pieces: { fundo: 'Praia de Carnaval', casa: 'Bangalô de Carnaval', casinha: 'Canil de Carnaval', enfeite: 'Jardim Trio Elétrico', cerca: 'Cerca de fitas' },
  },
  {
    id: 'pascoa', name: 'Páscoa', minLevel: 3, color: 0xb98be0, event: 'pascoa',
    pieces: { fundo: 'Cenário de Páscoa', casa: 'Casa de Páscoa', casinha: 'Canil de Páscoa', enfeite: 'Jardim de Páscoa', cerca: 'Cerca de Páscoa' },
  },
  {
    id: 'maes', name: 'Dia das Mães', minLevel: 3, color: 0xff6f91, event: 'maes',
    pieces: { fundo: 'Jardim florido', casa: 'Casa do Dia das Mães', casinha: 'Canil do Dia das Mães', enfeite: 'Canteiro de cravos', cerca: 'Cerca de corações' },
  },
  {
    id: 'namorados', name: 'Dia dos Namorados', minLevel: 3, color: 0xff3f6f, event: 'namorados',
    pieces: { fundo: 'Fundo do Dia dos Namorados', casa: 'Casa de Dia dos Namorados', casinha: 'Canil de Dia dos Namorados', enfeite: 'Jardim Romântico', cerca: 'Cerca de Dia dos Namorados' },
  },
  {
    id: 'arraia', name: 'Arraiá', minLevel: 3, color: 0xf2a33a, event: 'junina', // a fogueira vem do "Fogo Junino"
    pieces: { fundo: 'Céu de bandeirinhas', casa: 'Casa da roça', casinha: 'Casinha de palha', enfeite: 'Fogueira', cerca: 'Cerca de bambu' },
  },
  {
    id: 'pais', name: 'Série de Pais', minLevel: 3, color: 0x3f6fbf, event: 'pais',
    pieces: { fundo: 'Quintal do papai', casa: 'Casa do papai', casinha: 'Canil do papai', enfeite: 'Bancada de jardim', cerca: 'Cerca do papai' },
  },
  {
    id: 'desfile', name: 'Desfile', minLevel: 3, color: 0x3fa34f, event: 'independencia',
    pieces: { fundo: 'Pôr do sol com fogos', casa: 'Casa com bandeiras', casinha: 'Torre lilás', enfeite: 'Coreto', cerca: 'Cerca de correntes' },
  },
  {
    id: 'criancas', name: 'Dia das Crianças', minLevel: 3, color: 0xffb13f, event: 'criancas',
    pieces: { fundo: 'Parquinho', casa: 'Casa na árvore', casinha: 'Casinha colorida', enfeite: 'Gangorra', cerca: 'Cerca de lápis' },
  },
]
export const SERIES_BY_ID: Record<string, Series> = Object.fromEntries(SERIES.map((s) => [s.id, s]))

export type Slots = Record<Slot, string>
export const DEFAULT_SLOTS: Slots = Object.fromEntries(SLOTS.map((s) => [s, DEFAULT_SERIES])) as Slots

/** Id da peça: "<slot>:<série>" (ex.: "casa:inverno"). */
export const pieceId = (slot: Slot, series: string) => `${slot}:${series}`
export function parsePiece(id: string): { slot: Slot; series: Series } | null {
  const [slot, series] = id.split(':')
  if (!(SLOTS as readonly string[]).includes(slot) || !SERIES_BY_ID[series]) return null
  return { slot: slot as Slot, series: SERIES_BY_ID[series] }
}

/** Preço de cada peça: o preço-base × PACE.gold (arredondado a 10). A série padrão é de graça. */
export function piecePrice(series: Series, slot: Slot): number {
  if (series.id === DEFAULT_SERIES) return 0
  return Math.round((DECOR.pieceGoldOriginal[slot] * PACE.gold) / 10) * 10
}

/** Conjunto: as peças que ainda faltam (com DECOR.setDiscount, hoje 0). */
export function setPrice(series: Series, owned: (slot: Slot) => boolean = () => false): { gold: number; full: number; missing: Slot[] } {
  const missing = SLOTS.filter((s) => !owned(s))
  const full = missing.reduce((sum, s) => sum + piecePrice(series, s), 0)
  const gold = missing.length > 1 ? Math.round((full * (1 - DECOR.setDiscount)) / 10) * 10 : full
  return { gold, full, missing }
}

export const decorXp = (gold: number) => Math.floor(gold / DECOR.goldPerXp)

// ---------- B) enfeites soltos e caminhos ----------

export type Ornament = {
  id: string; name: string; minLevel: number
  w: number; h: number // pegada em células da grade (u × v)
  gold: number
  color: number // placeholder
  tall: number // altura do placeholder (px do mundo)
  wide: number // largura do desenho no mundo (px da arte × 132/256): a "sombra" onde o bicho ficaria escondido
}

/**
 * Enfeites soltos: ids, pegadas (u × v células) e alturas do lote M (public/art/MANIFEST.md,
 * arte em public/art/deco/soltos). `tall` = altura do desenho no mundo (escala dos lotes, 132/256), para o toque;
 * `wide` = largura do desenho no mundo (bichos não passeiam atrás dele: ficariam escondidos).
 */
const ORNAMENT_DEFS: Omit<Ornament, 'gold'>[] = [
  { id: 'canteiro_flores', name: 'Canteiro de flores', minLevel: 1, w: 1, h: 2, color: 0xff6fa8, tall: 80, wide: 116 },
  { id: 'barris', name: 'Barris de carvalho', minLevel: 1, w: 1, h: 1, color: 0x9c6331, tall: 80, wide: 83 },
  { id: 'placa_madeira', name: 'Placa de madeira', minLevel: 2, w: 1, h: 1, color: 0xc8a165, tall: 113, wide: 83 },
  { id: 'caixa_correio', name: 'Caixa de correio', minLevel: 2, w: 1, h: 1, color: 0xd63c3c, tall: 89, wide: 83 },
  { id: 'lampiao', name: 'Lampião', minLevel: 3, w: 1, h: 1, color: 0x3b3b3b, tall: 113, wide: 83 },
  { id: 'banco', name: 'Banco de madeira', minLevel: 3, w: 1, h: 2, color: 0xa86b3d, tall: 80, wide: 116 },
  { id: 'carrinho_mao', name: 'Carrinho de mão', minLevel: 4, w: 1, h: 2, color: 0xd63c3c, tall: 89, wide: 116 },
  { id: 'espantalho', name: 'Espantalho', minLevel: 4, w: 1, h: 1, color: 0xe8b04a, tall: 113, wide: 99 },
  { id: 'monte_feno', name: 'Monte de feno', minLevel: 5, w: 1, h: 2, color: 0xd9a400, tall: 89, wide: 116 },
  { id: 'cata_vento', name: 'Cata-vento', minLevel: 5, w: 1, h: 1, color: 0x2f6fd6, tall: 122, wide: 83 },
  { id: 'pinheiro', name: 'Pinheiro', minLevel: 6, w: 1, h: 1, color: 0x2e7d32, tall: 130, wide: 99 },
  { id: 'arvore_frutifera', name: 'Macieira', minLevel: 7, w: 1, h: 1, color: 0x4f9e3a, tall: 130, wide: 116 },
  { id: 'arco_flores', name: 'Arco de flores', minLevel: 8, w: 1, h: 2, color: 0xff7ac8, tall: 122, wide: 116 },
  { id: 'poco_manivela', name: 'Poço de manivela', minLevel: 9, w: 1, h: 2, color: 0x8b8b8b, tall: 113, wide: 116 },
  { id: 'lago_patinhos', name: 'Lago dos patinhos', minLevel: 11, w: 2, h: 2, color: 0x4fb3e8, tall: 113, wide: 149 },
  { id: 'moinho_pequeno', name: 'Moinho de vento', minLevel: 13, w: 2, h: 2, color: 0xf0dcb8, tall: 146, wide: 149 },
]
export const ORNAMENTS: Ornament[] = ORNAMENT_DEFS.map((o) => ({ ...o, gold: ornamentPrice(o.minLevel, o.w * o.h) }))
export const ORNAMENT_BY_ID: Record<string, Ornament> = Object.fromEntries(ORNAMENTS.map((o) => [o.id, o]))

export type PathKind = { id: string; name: string; minLevel: number; gold: number; color: number; edge: number }
/** Caminhos: pintados célula a célula; vendidos em pacotes de DECOR.pathPack células. */
export const PATHS: PathKind[] = [
  { id: 'caminho_terra', name: 'Caminho de terra', minLevel: 1, gold: ornamentPrice(1, 1), color: 0xc89a62, edge: 0xa77a45 },
  { id: 'caminho_pedra', name: 'Caminho de pedra', minLevel: 4, gold: ornamentPrice(4, 1), color: 0xbfc4c0, edge: 0x8d948f },
]
export const PATH_BY_ID: Record<string, PathKind> = Object.fromEntries(PATHS.map((p) => [p.id, p]))
export const isPath = (id: string) => id in PATH_BY_ID

/** Itens soltos que vão para a grade: enfeite ou caminho. */
export const isLoose = (id: string) => id in ORNAMENT_BY_ID || isPath(id)

export function decorName(id: string): string {
  const piece = parsePiece(id)
  if (piece) return `${piece.series.pieces[piece.slot]} (${piece.series.name})`
  return ORNAMENT_BY_ID[id]?.name ?? PATH_BY_ID[id]?.name ?? id
}
