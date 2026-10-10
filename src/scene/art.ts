// Sprites originais em public/art/ (ver public/art/MANIFEST.md). Arquivo ausente → a cena
// cai no placeholder desenhado em código, então dá para integrar a arte aos poucos.
import { Assets, type Texture } from 'pixi.js'
import { cropArt, SEEDS } from '@/game/catalog'
import { ACCESSORIES, accSprite } from '@/game/livestock'
import { ORNAMENTS, PATHS } from '@/game/decor'
import { RIPE_STAGE } from '@/game/rules'

// Ancoragem combinada com a arte: tiles 256×160 com o losango de cima em y 0..128;
// culturas 256×256 com a base da planta em (128,192), que assenta no centro (128,64) do montinho.
export const TILE_ANCHOR = { x: 0.5, y: 64 / 160 }
export const CROP_ANCHOR = { x: 0.5, y: 192 / 256 }
export const ART_TILE_W = 256

const paths: Record<string, string> = {
  ground_tile: '/art/scene/ground_tile.jpg', // gramado espelhado 2×2: repete sem emenda
  soil_empty: '/art/tiles/soil_empty.png',
  soil_planted: '/art/tiles/soil_planted.png',
  soil_dry: '/art/tiles/soil_dry.png',
  // Terra em montinhos (public/art/MANIFEST.md); ausentes → tiles antigos (soil.ts).
  soil_plot_holes: '/art/tiles/soil_plot_holes.png',
  soil_plot_shadow: '/art/tiles/soil_plot_shadow.png',
  house: '/art/scene/house.png',
  doghouse: '/art/scene/doghouse.png',
  dog: '/art/scene/dog.png',
  cow: '/art/scene/cow.png',
  fence_ne: '/art/scene/fence_ne.png',
  tree: '/art/scene/tree.png',
  // Cercado e adereços (lote J).
  pen_fence_ne: '/art/scene/pen_fence_ne.png',
  pen_fence_nw: '/art/scene/pen_fence_nw.png',
  pen_fence_gate: '/art/scene/pen_fence_gate.png',
  nest: '/art/scene/nest.png',
  milk_bucket: '/art/scene/milk_bucket.png',
  wool_basket: '/art/scene/wool_basket.png',
  // Variantes cheias (lote Q, A1): o produto pronto no adereço (layout.ts propTexture).
  nest_full: '/art/scene/nest_full.png',
  milk_bucket_full: '/art/scene/milk_bucket_full.png',
  wool_basket_full: '/art/scene/wool_basket_full.png',
  // Lote W (A5/A6): balão laranja do lote em três tamanhos e o baú do tesouro. Sem o arquivo, a cena desenha por código.
  balao_lote_pequeno: '/art/ui/balao_lote_pequeno.png',
  balao_lote_medio: '/art/ui/balao_lote_medio.png',
  balao_lote: '/art/ui/balao_lote.png',
  bau_fechado: '/art/ui/bau_fechado.png',
  bau_aberto: '/art/ui/bau_aberto.png',
}
for (const v of ['plowed', 'moist', 'dry', 'cover']) {
  paths[`soil_plot_${v}`] = `/art/tiles/soil_plot_${v}.png`
  for (const n of ['02', '03', '04']) paths[`soil_plot_${v}_${n}`] = `/art/tiles/soil_plot_${v}_${n}.png` // os que não existem são pulados (/api/art)
}
for (const s of ['ne', 'nw', 'se', 'sw']) paths[`soil_plot_rim_${s}`] = `/art/tiles/soil_plot_rim_${s}.png`
for (const c of ['s', 'e', 'w']) paths[`soil_plot_rim_corner_${c}`] = `/art/tiles/soil_plot_rim_corner_${c}.png`
for (let n = 1; n <= 3; n++) {
  paths[`pest_${n}`] = `/art/overlays/pest_${n}.png`
  paths[`weed_${n}`] = `/art/overlays/weed_${n}.png`
}
paths.dry = '/art/overlays/dry.png'
// Culturas (public/art/MANIFEST.md): uma planta por lote, estágios 0..5 + murcho.
for (const s of SEEDS) {
  for (let i = 0; i <= RIPE_STAGE; i++) paths[`${s.id}_${i}`] = cropArt(s.id, i)
  paths[`${s.id}_withered`] = cropArt(s.id, 'withered')
}

// Bichos animados (public/art/animals): <id>_walk_0..3, <id>_idle_0..1 e dog_sleep_0..1.
export const ANIMALS = ['cow', 'dog', 'chicken', 'sheep', 'pig', 'donkey', 'peacock', 'duck', 'rabbit', 'goat'] as const
for (const id of ANIMALS) {
  for (let i = 0; i < 4; i++) paths[`${id}_walk_${i}`] = `/art/animals/${id}_walk_${i}.png`
  for (let i = 0; i < 2; i++) paths[`${id}_idle_${i}`] = `/art/animals/${id}_idle_${i}.png`
}
for (let i = 0; i < 2; i++) paths[`dog_sleep_${i}`] = `/art/animals/dog_sleep_${i}.png`
// Colmeia (lote Q, A2): só parada, 3 quadros com as abelhas voando em volta.
for (let i = 0; i < 3; i++) paths[`bee_idle_${i}`] = `/art/animals/bee_idle_${i}.png`
// Idades (lote O): <bicho>_baby_* e <bicho>_teen_*; acessórios como camada: <bicho>_acc_<nome>_* (mesma grade do adulto).
for (const id of ANIMALS) {
  if (id === 'dog') continue
  for (const age of ['baby', 'teen']) {
    for (let i = 0; i < 4; i++) paths[`${id}_${age}_walk_${i}`] = `/art/animals/${id}_${age}_walk_${i}.png`
    for (let i = 0; i < 2; i++) paths[`${id}_${age}_idle_${i}`] = `/art/animals/${id}_${age}_idle_${i}.png`
  }
}
for (const acc of ACCESSORIES) {
  const key = accSprite(acc)
  for (let i = 0; i < 4; i++) paths[`${key}_walk_${i}`] = `/art/animals/${key}_walk_${i}.png`
  for (let i = 0; i < 2; i++) paths[`${key}_idle_${i}`] = `/art/animals/${key}_idle_${i}.png`
}
// Raças (variações de cor do nosso cachorro; o Pastor usa os quadros originais "dog_*").
for (const b of ['vira_lata', 'salsicha']) {
  for (let i = 0; i < 4; i++) paths[`dog_${b}_walk_${i}`] = `/art/animals/dog_${b}_walk_${i}.png`
  for (let i = 0; i < 2; i++) paths[`dog_${b}_idle_${i}`] = `/art/animals/dog_${b}_idle_${i}.png`
  for (let i = 0; i < 2; i++) paths[`dog_${b}_sleep_${i}`] = `/art/animals/dog_${b}_sleep_${i}.png`
}
// Guardas no lugar do cachorro (lote W, A9; andar/dormir no lote X).
// A cabra-guarda usa os quadros da cabra do lote J. Chave "dog_<raça>_*".
export const GUARD_ART: Record<string, { idle: string[]; walk: string[]; attack: string; foot: number }> = {
  guarda_cabra: { idle: ['goat_idle_0', 'goat_idle_1'], walk: ['goat_walk_0', 'goat_walk_1', 'goat_walk_2', 'goat_walk_3'], attack: 'guarda_cabra_ataque', foot: 146 / 160 },
  guarda_cavalo: { idle: ['guarda_cavalo_idle'], walk: [0, 1, 2, 3].map((n) => `guarda_cavalo_walk_${n}`), attack: 'guarda_cavalo_ataque', foot: 183 / 192 },
  guarda_avestruz: { idle: ['guarda_avestruz_idle'], walk: [0, 1, 2, 3].map((n) => `guarda_avestruz_walk_${n}`), attack: 'guarda_avestruz_ataque', foot: 183 / 192 },
}
for (const [id, g] of Object.entries(GUARD_ART)) {
  g.idle.forEach((f, i) => { paths[`dog_${id}_idle_${i}`] = `/art/animals/${f}.png` })
  g.walk.forEach((f, i) => { paths[`dog_${id}_walk_${i}`] = `/art/animals/${f}.png` })
  if (id !== 'guarda_cabra') for (let i = 0; i < 2; i++) paths[`dog_${id}_sleep_${i}`] = `/art/animals/${id}_sleep_${i}.png`
  paths[`dog_${id}_attack`] = `/art/animals/${g.attack}.png`
}

// Decoração (lote M, public/art/deco/soltos): enfeites soltos "deco_<id>" e caminhos "deco_<material>_<forma>".
for (const o of ORNAMENTS) paths[`deco_${o.id}`] = `/art/deco/soltos/${o.id}.png`
for (const k of PATHS) for (const f of ['reta', 'curva', 't', 'cruz']) paths[`deco_${k.id}_${f}`] = `/art/deco/soltos/${k.id}_${f}.png`

export type ArtBook = Partial<Record<string, Texture>>

// Carregamento em duas etapas (celular em 4G: eram ~600 arquivos, ~12 MB, antes de a fazenda aparecer).
// Fica para depois o que quase nunca está na tela na entrada: as culturas (só as dos lotes entram já), filhotes,
// jovens e acessórios dos bichos (só os que estão na fazenda entram já). O resto chega em segundo plano.
const cropKeySet = new Set<string>()
for (const s of SEEDS) for (const k of cropKeys(s.id)) cropKeySet.add(k)
const deferred = (key: string) => cropKeySet.has(key) || /_(baby|teen)_|_acc_/.test(key)

/** Chaves de uma cultura: estágios 0..RIPE_STAGE e murcha. */
export function cropKeys(seedId: string): string[] {
  const out = [`${seedId}_withered`]
  for (let i = 0; i <= RIPE_STAGE; i++) out.push(`${seedId}_${i}`)
  return out
}
/** Chaves de um desenho animado de bicho (`cow_baby`, `cow_acc_laco`…): andar e parado. */
export const animKeys = (base: string) => [0, 1, 2, 3].map((i) => `${base}_walk_${i}`).concat([0, 1].map((i) => `${base}_idle_${i}`))

let index: Promise<Set<string> | null> | null = null
// Só baixa o que existe (índice do servidor); se o índice falhar, tenta tudo.
const artIndex = () => (index ??= fetch('/api/art').then((r) => r.json() as Promise<string[]>).then((l) => new Set(l)).catch(() => null))

/** Põe no livro as texturas dessas chaves (as que existem e ainda não vieram), no máximo `parallel` downloads por vez. */
export async function loadKeys(book: ArtBook, keys: string[], parallel = Infinity): Promise<void> {
  const have = await artIndex()
  const todo = keys.filter((k) => !book[k] && paths[k] && (!have || have.has(paths[k])))
  let next = 0
  const worker = async () => {
    while (next < todo.length) {
      const key = todo[next++]
      try {
        book[key] = await Assets.load<Texture>(paths[key])
      } catch {
        // sem sprite: usa placeholder
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(parallel, todo.length) }, worker))
}

/** O que a fazenda precisa para aparecer (cenário, terra, bichos adultos, cachorro, enfeites). */
export async function loadArt(): Promise<ArtBook> {
  const book: ArtBook = {}
  await loadKeys(book, Object.keys(paths).filter((k) => !deferred(k)))
  return book
}

/** Chaves deixadas para depois por `loadArt` (baixe com poucos downloads por vez para não atrasar as ações). */
export const deferredKeys = () => Object.keys(paths).filter(deferred)

/** Quadros de um bicho, na ordem; vazio se a arte ainda não chegou. */
export function frames(book: ArtBook, id: string, kind: 'walk' | 'idle' | 'sleep'): Texture[] {
  const out: Texture[] = []
  for (let i = 0; i < 4; i++) {
    const t = book[`${id}_${kind}_${i}`]
    if (t) out.push(t)
  }
  return out
}

// ---------- séries da decoração (lote M): carregadas só quando a fazenda usa a série ----------

/** Arquivos de cada série em public/art/deco/<série>/ (manifesto lote-m-decoracao.md). */
const SERIES_FILES = ['casa', 'casinha', 'enfeite', 'cerca_ne', 'cerca_nw', 'cerca_canto', 'cerca_portao',
  'fundo_ceu', 'fundo_nuvem', 'fundo_morros_distantes', 'fundo_morros_proximos', 'fundo_arco_iris'] as const
export type SeriesArt = Partial<Record<(typeof SERIES_FILES)[number], Texture>>
const seriesCache = new Map<string, Promise<SeriesArt>>()

export function loadSeriesArt(series: string): Promise<SeriesArt> {
  let p = seriesCache.get(series)
  if (!p) {
    p = (async () => {
      const have = await artIndex()
      const out: SeriesArt = {}
      await Promise.all(SERIES_FILES.map(async (f) => {
        const url = `/art/deco/${series}/${f}.png`
        if (have && !have.has(url)) return
        try { out[f] = await Assets.load<Texture>(url) } catch { /* sem a peça: fica a de antes */ }
      }))
      return out
    })()
    seriesCache.set(series, p)
  }
  return p
}
