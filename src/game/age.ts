// Faixa etária do jogador (primeiro acesso). Base das regras de compra e do ECA Digital (Lei 15.211/2025).
export type AgeBand = 'lt13' | '13_15' | '16_17' | '18p'

export const AGE_BANDS: { id: AgeBand; label: string }[] = [
  { id: 'lt13', label: 'Menos de 13 anos' },
  { id: '13_15', label: '13 a 15 anos' },
  { id: '16_17', label: '16 ou 17 anos' },
  { id: '18p', label: '18 anos ou mais' },
]

export const isAgeBand = (s: unknown): s is AgeBand => AGE_BANDS.some((b) => b.id === s)

/** Idade em anos completos na data `now` (data no formato AAAA-MM-DD). null = data inválida ou no futuro. */
export function ageFrom(birthDate: string, now = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  let age = now.getUTCFullYear() - y
  if (now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d)) age--
  return age < 0 || age > 120 ? null : age
}

export function bandFromAge(age: number): AgeBand {
  return age < 13 ? 'lt13' : age < 16 ? '13_15' : age < 18 ? '16_17' : '18p'
}

/** Abaixo de 13 não cria conta (jogo com interação social entre desconhecidos). */
export const canSignUp = (b: AgeBand) => b !== 'lt13'
/** 13 a 15: precisa de autorização do responsável (conta vinculada, ECA Digital). */
export const needsGuardian = (b: AgeBand) => b === '13_15'
/** Comprar moedas com dinheiro: só maiores de 18 (restrição etária). */
export const canPurchase = (b: AgeBand | null | undefined) => b === '18p'
