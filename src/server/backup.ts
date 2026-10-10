// Backup lógico do PGlite de produção.
// Só o processo do jogo pode abrir o banco (PGlite = Postgres dentro do processo), então o dump sai daqui de dentro:
// `fly ssh console` manda SIGUSR2 para o node, e o app grava em /tmp/cf-backup (fora do volume) o tar.gz da pasta do
// banco e as contagens por tabela. O script scripts/db-backup-prod.sh baixa os dois por sftp e apaga da máquina.
// Consistência: o tar é feito com o banco travado (nenhuma query ou transação roda durante a cópia), depois de um
// CHECKPOINT. A pausa (contar as linhas e empacotar a pasta, sem compactar) leva segundos e fica em `pauseMs`.
import type { PGlite } from '@electric-sql/pglite'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { gzip } from 'node:zlib'
import type { Q } from './db'

const gzipAsync = promisify(gzip)

export type TableCounts = Record<string, number>
export type BackupMeta = { file: string; bytes: number; pauseMs: number; createdAt: string; version: string; counts: TableCounts }

/** Linhas por tabela do esquema public (sem dados pessoais: só nomes de tabela e números). */
export async function tableCounts(q: Q): Promise<TableCounts> {
  const { rows } = await q.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public' order by tablename")
  const out: TableCounts = {}
  for (const { tablename } of rows) {
    out[tablename] = Number((await q.query<{ n: number }>(`select count(*)::int as n from "${tablename.replace(/"/g, '""')}"`)).rows[0].n)
  }
  return out
}

/** Tar.gz da pasta do banco, com o banco travado. Abre de volta com `PGlite.create({ loadDataDir })` ou
 * `tar xzf <arquivo> -C <pasta vazia>` (o tar não tem pasta-raiz) e `PGLITE_DIR=<pasta>`. */
export async function dumpPglite(pg: PGlite): Promise<{ tar: Uint8Array; counts: TableCounts; pauseMs: number }> {
  await pg.query('checkpoint')
  // transaction() segura a fila de queries e transações; runExclusive() garante que nada roda enquanto o tar é feito.
  const raw = await pg.transaction(async (t) => {
    const t0 = performance.now()
    const counts = await tableCounts(t)
    const blob = await pg.runExclusive(() => pg.dumpDataDir('none'))
    const pauseMs = Math.round(performance.now() - t0)
    return { blob, counts, pauseMs }
  })
  // A compactação fica fora da trava: o jogo já voltou a responder.
  return { tar: new Uint8Array(await gzipAsync(new Uint8Array(await raw.blob.arrayBuffer()))), counts: raw.counts, pauseMs: raw.pauseMs }
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13) // AAAAMMDD-HHMM (UTC)

/** Grava o dump e o .json de contagens em `dir`. O .json só aparece no fim: é o sinal de "pronto" para o script. */
export async function writeBackup(pg: PGlite, dir: string, now = new Date()): Promise<BackupMeta> {
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const { tar, counts, pauseMs } = await dumpPglite(pg)
  const file = `colheita-prod-${stamp(now)}.tar.gz`
  await writeFile(path.join(dir, file), tar, { mode: 0o600 })
  const meta: BackupMeta = { file, bytes: tar.byteLength, pauseMs, createdAt: now.toISOString(), version: process.env.APP_VERSION ?? 'dev', counts }
  const tmp = path.join(dir, `${file}.json.tmp`)
  await writeFile(tmp, JSON.stringify(meta, null, 2), { mode: 0o600 })
  await rename(tmp, path.join(dir, `${file}.json`))
  return meta
}

export const BACKUP_DIR = '/tmp/cf-backup'

/** `<dir>/ready` com o PID do node: o script só manda SIGUSR2 para esse PID (sem o arquivo, o servidor não sabe fazer backup). */
export async function markBackupReady(dir: string, pid: number) {
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await writeFile(path.join(dir, 'ready'), String(pid), { mode: 0o600 })
}

/** Abre o dump num PGlite em memória (não toca em disco nem roda migração) e compara as contagens com as do .json. */
export async function verifyBackup(tar: Uint8Array, expected: TableCounts): Promise<{ ok: boolean; counts: TableCounts; diff: string[] }> {
  const { PGlite } = await import('@electric-sql/pglite')
  const pg = await PGlite.create({ loadDataDir: new Blob([tar as Uint8Array<ArrayBuffer>]) })
  try {
    const counts = await tableCounts(pg)
    const names = [...new Set([...Object.keys(expected), ...Object.keys(counts)])].sort()
    const diff = names.filter((n) => expected[n] !== counts[n]).map((n) => `${n}: esperado ${expected[n] ?? '—'}, restaurado ${counts[n] ?? '—'}`)
    return { ok: diff.length === 0, counts, diff }
  } finally {
    await pg.close()
  }
}
