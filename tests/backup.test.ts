// Backup do PGlite (server/backup.ts): dump com o banco travado, restauração e contagens.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, describe, expect, it } from 'vitest'
import { markBackupReady, tableCounts, verifyBackup, writeBackup, type BackupMeta } from '../src/server/backup'

const tmp = mkdtempSync(path.join(tmpdir(), 'cf-backup-test-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

const pg = await PGlite.create(path.join(tmp, 'pglite'))
await pg.exec(`
  create table users (id serial primary key, email text not null);
  create table farms (id serial primary key, user_id int references users(id));
  create table "estranha""tabela" (x int);
  insert into users (email) select 'u' || g || '@exemplo.test' from generate_series(1, 25) g;
  insert into farms (user_id) select id from users where id <= 20;
`)

// Cada dump compacta a pasta inteira do banco: segundos numa máquina folgada, dezenas com o Mac carregado.
describe('backup do PGlite', { timeout: 60_000 }, () => {
  it('conta as linhas de cada tabela, inclusive com aspas no nome', async () => {
    expect(await tableCounts(pg)).toEqual({ 'estranha"tabela': 0, farms: 20, users: 25 })
  })

  it('grava o dump e o .json por último, com nome datado e sem dados pessoais no .json', async () => {
    const out = path.join(tmp, 'out')
    const meta = await writeBackup(pg, out, new Date('2026-10-09T22:45:00Z'))
    expect(meta.file).toBe('colheita-prod-20261009-2245.tar.gz')
    expect(readdirSync(out).sort()).toEqual([meta.file, `${meta.file}.json`])
    const json = readFileSync(path.join(out, `${meta.file}.json`), 'utf8')
    expect(JSON.parse(json) as BackupMeta).toMatchObject({ bytes: meta.bytes, counts: { users: 25, farms: 20 } })
    expect(json).not.toContain('@')
  })

  it('escritas no meio do dump entram inteiras antes ou depois dele, nunca pela metade', async () => {
    const out = path.join(tmp, 'concorrente')
    const dump = writeBackup(pg, out)
    const writes = Array.from({ length: 10 }, (_, i) =>
      pg.transaction(async (t) => {
        const { rows } = await t.query<{ id: number }>('insert into users (email) values ($1) returning id', [`depois${i}@exemplo.test`])
        await t.query('insert into farms (user_id) values ($1)', [rows[0].id])
      }),
    )
    try {
      const meta = await dump
      await Promise.all(writes)
      expect(meta.counts.users - 25).toBe(meta.counts.farms - 20)
      const tar = new Uint8Array(readFileSync(path.join(out, meta.file)))
      expect((await verifyBackup(tar, meta.counts)).ok).toBe(true)
    } finally {
      await Promise.allSettled(writes)
      await pg.exec("delete from farms where id > 20; delete from users where email like 'depois%'")
    }
  })

  it('restaura: o .tar.gz abre em memória e pelo tar numa pasta, com as mesmas contagens', async () => {
    const out = path.join(tmp, 'restaura')
    const meta = await writeBackup(pg, out)
    const tar = new Uint8Array(readFileSync(path.join(out, meta.file)))
    expect(await verifyBackup(tar, meta.counts)).toMatchObject({ ok: true, diff: [] })
    // Caminho do docs (restaurar no disco): o tar não tem pasta-raiz, então extrai direto na pasta que vira o PGLITE_DIR.
    const dir = path.join(tmp, 'extraido')
    mkdirSync(dir)
    execFileSync('tar', ['xzf', path.join(out, meta.file), '-C', dir])
    expect(readdirSync(dir)).toContain('PG_VERSION')
    const back = await PGlite.create(dir)
    expect(await tableCounts(back)).toEqual(meta.counts)
    await back.close()
  })

  it('acusa a diferença quando as contagens não batem', async () => {
    const out = path.join(tmp, 'diferente')
    const meta = await writeBackup(pg, out)
    const tar = new Uint8Array(readFileSync(path.join(out, meta.file)))
    const r = await verifyBackup(tar, { ...meta.counts, users: 26, sumiu: 1 })
    expect(r.ok).toBe(false)
    expect(r.diff).toEqual(['sumiu: esperado 1, restaurado —', 'users: esperado 26, restaurado 25'])
  })

  it('marcador de pronto guarda o PID do node', async () => {
    await markBackupReady(path.join(tmp, 'm'), 4242)
    expect(readFileSync(path.join(tmp, 'm', 'ready'), 'utf8')).toBe('4242')
  })
})
