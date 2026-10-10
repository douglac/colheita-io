// Limite de ritmo em memória (balde de fichas). Um processo só no MVP; com várias instâncias,
// trocar por Redis/Postgres. Segura robô, clique automático e criação de conta em massa.
type Bucket = { tokens: number; at: number }
const g = globalThis as unknown as { __cfRate?: Map<string, Bucket> }
const buckets: Map<string, Bucket> = (g.__cfRate ??= new Map())

/** true = pode; false = passou do limite. `burst` fichas no máximo, repõe `perSec` por segundo. */
export function allow(key: string, burst: number, perSec: number, now = Date.now()): boolean {
  const b = buckets.get(key) ?? { tokens: burst, at: now }
  b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 1000) * perSec)
  b.at = now
  if (buckets.size > 50_000) buckets.clear() // proteção de memória simples
  if (b.tokens < 1) { buckets.set(key, b); return false }
  b.tokens -= 1
  buckets.set(key, b)
  return true
}

/**
 * IP de quem chamou. O x-forwarded-for é uma lista "cliente, proxy1, proxy2" e a parte da esquerda
 * pode ser forjada pelo próprio cliente; vale a entrada posta pelo NOSSO proxy, contando da direita.
 * - CLIENT_IP_HEADER: cabeçalho confiável do provedor (fly-client-ip, cf-connecting-ip, x-real-ip…), se houver;
 * - TRUST_PROXY_HOPS: quantos proxies nossos ficam na frente do app (padrão 1: o balanceador da hospedagem).
 */
export function clientIp(req: Request): string {
  const trusted = process.env.CLIENT_IP_HEADER
  if (trusted) {
    const v = req.headers.get(trusted)?.trim()
    if (v) return v
  }
  const xff = req.headers.get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean) ?? []
  const hops = Math.max(1, Number(process.env.TRUST_PROXY_HOPS ?? 1))
  return xff[Math.max(0, xff.length - hops)] || req.headers.get('x-real-ip') || 'local'
}

/** Resposta padrão de "devagar" (429) com Retry-After. */
export function tooMany(error = 'Muitas tentativas. Espere um pouco.') {
  return Response.json({ error }, { status: 429, headers: { 'retry-after': '5' } })
}
