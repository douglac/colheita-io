// LGPD: baixar os próprios dados (JSON) e excluir a conta.
// As tabelas ligadas ao jogador são descobertas pelas chaves estrangeiras para users(id): tabela nova
// entra sozinha na exportação e na exclusão, sem ninguém lembrar de mexer aqui.
import { getDb, tx, type Q } from './db'
import { forgetInMetrics } from './metrics'

type UserFk = { tbl: string; col: string; del: string; notnull: boolean }

async function userFks(q: Q): Promise<UserFk[]> {
  const { rows } = await q.query<UserFk>(
    `select c.conrelid::regclass::text as tbl, a.attname::text as col, c.confdeltype::text as del, a.attnotnull as notnull
     from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
     where c.contype = 'f' and c.confrelid = 'users'::regclass order by 1, 2`)
  return rows
}

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`
/** Segredos e chaves técnicas não vão para o arquivo (nem são "dados pessoais" úteis ao titular). */
const SECRET_COL = /hash|secret|token|^p256dh$|^auth$/
// metric_events.ref é o id interno de outro jogador (alvo do roubo, quem convidou): não sai no arquivo.
const HIDE: Record<string, string[]> = { sessions: ['id'], users: ['id'], metric_events: ['ref'] }

export async function exportUserData(userId: string) {
  const db = await getDb()
  const me = (await db.query<Record<string, unknown>>('select * from users where id = $1', [userId])).rows[0]
  if (!me) return null
  const fks = await userFks(db)
  const byTable = new Map<string, string[]>()
  for (const f of fks) byTable.set(f.tbl, [...(byTable.get(f.tbl) ?? []), f.col])

  const tables: Record<string, Record<string, unknown>[]> = {}
  const others = new Set<string>()
  for (const [tbl, cols] of byTable) {
    const where = cols.map((c) => `${ident(c)} = $1`).join(' or ')
    const { rows } = await db.query<Record<string, unknown>>(`select * from ${ident(tbl)} where ${where}`, [userId])
    if (!rows.length) continue
    for (const r of rows) for (const c of cols) if (r[c] && r[c] !== userId) others.add(String(r[c]))
    tables[tbl] = rows.map((r) => clean(tbl, r, cols, userId))
  }
  // Outros jogadores aparecem pelo apelido público, nunca pelo id interno nem pelo e-mail.
  const handles = new Map<string, string>()
  if (others.size) {
    const { rows } = await db.query<{ id: string; handle: string }>('select id, handle from users where id = any($1::uuid[])', [[...others]])
    for (const r of rows) handles.set(r.id, `@${r.handle}`)
  }
  for (const [tbl, rows] of Object.entries(tables)) {
    const cols = byTable.get(tbl)!
    for (const r of rows) for (const c of cols) if (typeof r[c] === 'string' && r[c] !== 'você') r[c] = handles.get(r[c] as string) ?? '(conta excluída)'
  }
  return {
    geradoEm: new Date().toISOString(),
    sobre: 'Seus dados no Colheita Feliz (LGPD, art. 18). "você" marca você mesmo; outros jogadores aparecem pelo apelido.',
    conta: clean('users', me, [], userId),
    tabelas: tables,
  }
}

function clean(tbl: string, row: Record<string, unknown>, userCols: string[], userId: string) {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (SECRET_COL.test(k) || HIDE[tbl]?.includes(k)) continue
    out[k] = userCols.includes(k) && v === userId ? 'você' : v
  }
  return out
}

/**
 * Exclui a conta e tudo o que é dela. Amizades (dos dois lados), convites aceitos, roubos, presentes e avisos
 * somem junto; nos murais dos amigos, o que essa pessoa fez fica como "Alguém" (autor apagado). Quem foi
 * convidado continua com a própria fazenda e o bônus que ganhou.
 */
export async function deleteAccount(userId: string): Promise<boolean> {
  return tx(async (q) => {
    const me = (await q.query<{ email: string | null }>('select email from users where id = $1 and not is_bot for update', [userId])).rows[0]
    if (!me) return false
    for (const f of await userFks(q)) {
      // 'c' cascade e 'n' set null o banco resolve sozinho; sem ação definida, resolvemos aqui.
      if (f.del === 'c' || f.del === 'n' || f.del === 'd') continue
      if (f.notnull) await q.query(`delete from ${ident(f.tbl)} where ${ident(f.col)} = $1`, [userId])
      else await q.query(`update ${ident(f.tbl)} set ${ident(f.col)} = null where ${ident(f.col)} = $1`, [userId])
    }
    // Métricas: os eventos dela ficam sem dono (on delete set null) e somem as menções a ela como alvo ou convidante.
    await forgetInMetrics(q, userId)
    await q.query('delete from users where id = $1', [userId])
    if (me.email) {
      await q.query('delete from auth_tokens where email = $1', [me.email])
      await q.query('delete from auth_signups where email = $1', [me.email])
    }
    return true
  })
}

