import type { Instrumentation } from 'next'

// Roda uma vez quando o servidor sobe: liga a varredura da horta madura (server/ripe.ts),
// que manda na hora os avisos que ficaram pendentes enquanto o servidor estava parado.
// Também abre o banco já no boot, o que aplica as migrações pendentes (server/migrate.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { log, errorFields } = await import('./server/observe')
    const { getDb } = await import('./server/db')
    await getDb().then(
      () => log('info', 'banco pronto', { driver: process.env.DATABASE_URL ? 'postgres' : 'pglite' }),
      (e) => log('error', 'banco indisponível no boot', errorFields(e)),
    )
    // Login por apelido ou pagamento falso ligados num servidor de produção que não é o staging:
    // eles ficam desligados (403), e o erro vai para o log e o Sentry sem derrubar o boot.
    const { blockedTestFlags } = await import('./server/flags')
    const blocked = blockedTestFlags()
    if (blocked.length) {
      const { captureError } = await import('./server/observe')
      captureError(new Error(`CONFIGURAÇÃO INSEGURA: ${blocked.map((k) => `${k}=1`).join(' e ')} em produção sem APP_ENV=staging. `
        + 'Login de teste e pagamento falso ficam bloqueados (403). Remova as variáveis.'),
        { kind: 'config', blocked, appEnv: process.env.APP_ENV ?? '' })
    }
    const { startRipeWatch } = await import('./server/ripe')
    startRipeWatch()
    // Métricas: apaga eventos com mais de 180 dias agora e uma vez por dia.
    const { startMetricsPrune } = await import('./server/metrics')
    startMetricsPrune()
    // Backup do PGlite: `kill -USR2 <pid do node>` grava o dump em /tmp/cf-backup.
    // Só quem entra na máquina (fly ssh) manda sinal: não há rota nem segredo novo.
    if (!process.env.DATABASE_URL) {
      let busy = false
      process.on('SIGUSR2', () => {
        if (busy) return
        busy = true
        void (async () => {
          const { BACKUP_DIR, writeBackup } = await import('./server/backup')
          const db = await getDb()
          const meta = await writeBackup(db.pglite!, BACKUP_DIR)
          log('info', 'backup do banco', { file: meta.file, bytes: meta.bytes, pauseMs: meta.pauseMs, tables: Object.keys(meta.counts).length })
        })().catch((e) => log('error', 'backup do banco falhou', errorFields(e))).finally(() => { busy = false })
      })
      // Marcador "pode mandar o sinal": sem handler, o SIGUSR2 derrubaria o node. O script confere antes de mandar.
      const { BACKUP_DIR, markBackupReady } = await import('./server/backup')
      await markBackupReady(BACKUP_DIR, process.pid).catch((e) => log('error', 'backup: marcador', errorFields(e)))
    }
  }
}

// Erros não tratados em páginas e rotas: log estruturado + Sentry (se SENTRY_DSN).
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { captureError } = await import('./server/observe')
  captureError(err, { path: request.path, method: request.method, route: context.routePath, kind: context.routeType })
}
