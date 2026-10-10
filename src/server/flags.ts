type Env = Record<string, string | undefined>

/** Servidor de teste fechado (Fly): APP_ENV=staging lido em tempo de execução. */
export function isStagingServer(env: Env = process.env): boolean {
  return env.APP_ENV === 'staging'
}

/**
 * Login de teste (só apelido, sem senha): ligado em desenvolvimento (desliga com TEST_LOGIN=0).
 * Em produção, só com ALLOW_TEST_LOGIN=1 **e** APP_ENV=staging; nunca no ar para o público.
 */
export function testLoginEnabled(env: Env = process.env): boolean {
  if (env.NODE_ENV === 'production') return env.ALLOW_TEST_LOGIN === '1' && isStagingServer(env)
  return env.TEST_LOGIN !== '0'
}

/** Cobrança não está disponível nesta edição, em nenhum ambiente. */
export function payFakeEnabled(): boolean { return false }

export const testLoginBlocked = (env: Env = process.env) => blockedTestFlags(env).includes('ALLOW_TEST_LOGIN')
export const payFakeBlocked = (env: Env = process.env) => blockedTestFlags(env).includes('PAY_FAKE')

/**
 * Opt-ins de teste ligados num servidor de produção que não é o staging: erro de configuração.
 * Eles ficam desligados (as rotas respondem 403) e o boot avisa no log/Sentry (instrumentation.ts).
 */
export function blockedTestFlags(env: Env = process.env): ('ALLOW_TEST_LOGIN' | 'PAY_FAKE')[] {
  if (env.NODE_ENV !== 'production' || isStagingServer(env)) return []
  return (['ALLOW_TEST_LOGIN', 'PAY_FAKE'] as const).filter((k) => env[k] === '1')
}

/** Endereço público para os links do e-mail. Em produção, defina APP_URL (ex.: https://colheitafeliz.com.br). */
export function baseUrl(req: Request): string {
  return process.env.APP_URL ?? new URL(req.url).origin
}
