// Adaptador opcional de eventos. Esta edição não coleta eventos analíticos.
import type { Q } from './db'

export type MetricKind =
  | 'signup' | 'session' | 'plant' | 'harvest' | 'steal' | 'help' | 'sabotage' | 'bitten'
  | 'share_click' | 'invite_open' | 'invite_accepted' | 'push_optin' | 'purchase_view'
/** Só contagem por dia. */
export type DailyKind = 'lp_view' | 'login_code_sent'

/** Um evento para gravar depois que a ação terminou (dentro da transação do jogo uma falha abortaria tudo). */
export type MetricNote = { kind: MetricKind; ref?: string | null; meta?: Record<string, unknown> }

/** De onde veio a conta nova. */
export const SIGNUP_ORIGINS = ['convite', 'compartilhar', 'vitrine', 'direto'] as const
export type SignupOrigin = (typeof SIGNUP_ORIGINS)[number]

/** Onde a pessoa tocou em compartilhar/convidar. */
export const SHARE_PLACES = ['levelup', 'missao', 'bonus', 'convite', 'amigos', 'mordida', 'roubado', 'gancho', 'evento'] as const
export type SharePlace = (typeof SHARE_PLACES)[number]
export const isSharePlace = (v: unknown): v is SharePlace => SHARE_PLACES.includes(v as SharePlace)

export async function track(...args: [string | null, MetricKind, (string | null)?, Record<string, unknown>?]): Promise<void> { void args }
export async function trackAll(...args: [string | null, MetricNote[]]): Promise<void> { void args }
export async function countDaily(...args: [DailyKind]): Promise<void> { void args }
export async function trackOpen(...args: [string]): Promise<void> { void args }
export async function trackInviteOpen(...args: [string, string | null, number | null]): Promise<void> { void args }
export async function forgetInMetrics(...args: [Q, string]): Promise<void> { void args }
export function startMetricsPrune(): void {}

/** Evita tratar prévias automáticas como navegação humana. */
export function isAutomated(h: Headers): boolean {
  if (h.get('next-router-prefetch') || h.get('purpose') === 'prefetch' || h.get('sec-purpose')?.includes('prefetch')) return true
  return /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|curl|wget|python|headless/i.test(h.get('user-agent') ?? '')
}
