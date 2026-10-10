// Ficha de compra da semente (loja e sacola), calculada do catálogo: nenhum número repetido aqui.
// Tempos com GROWTH_SPEED, como o resto do jogo.
import type { Seed } from './catalog'
import { growMs, regrowMs } from './rules'

export type SeedSheet = {
  seasons: number
  growMs: number // até a 1ª colheita
  regrowMs: number | null // cada safra seguinte (perenes)
  totalMs: number // do plantio à última colheita
  yieldMin: number; yieldMax: number // por safra
  sellPrice: number // por unidade (0 = flor, não vende)
  incomeMin: number; incomeMax: number // renda bruta de todas as safras, sem bônus nem perdas
  income: number // "renda: N" do cartão da loja: unidades médias × venda × safras
  profit: number // renda média − preço da semente
  xp: number; xpTotal: number
  minLevel: number
}

export function seedSheet(s: Seed): SeedSheet {
  const seasons = s.seasons ?? 1
  const regrow = seasons > 1 ? regrowMs(s) : null
  // Em décimos de ouro (o preço tem 1 casa): 36 × 1,3 dá 46,8, não 46,800000000000004.
  const tenths = Math.round(s.sellPrice * 10)
  const minT = seasons * s.yieldMin * tenths, maxT = seasons * s.yieldMax * tenths
  const incomeMin = minT / 10, incomeMax = maxT / 10
  return {
    seasons, growMs: growMs(s), regrowMs: regrow, totalMs: growMs(s) + (seasons - 1) * (regrow ?? 0),
    yieldMin: s.yieldMin, yieldMax: s.yieldMax, sellPrice: s.sellPrice, incomeMin, incomeMax,
    income: Math.round((minT + maxT) / 20),
    profit: Math.round((minT + maxT) / 20) - s.cost,
    xp: s.xp, xpTotal: seasons * s.xp, minLevel: s.minLevel,
  }
}

/** "45 s", "5 min", "1 h 30 min", "16 h", "1 dia 2 h". */
export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.round(s / 60)
  if (m < 60) return s % 60 && m < 10 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${m} min`
  const h = Math.floor(m / 60), rm = m % 60
  if (h < 24) return rm ? `${h} h ${rm} min` : `${h} h`
  const d = Math.floor(h / 24), rh = h % 24
  return `${d} dia${d > 1 ? 's' : ''}${rh ? ` ${rh} h` : ''}`
}
