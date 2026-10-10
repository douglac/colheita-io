// npm run migrate — aplica as migrações pendentes (server/migrate.ts) no banco do ambiente:
// DATABASE_URL (Postgres) ou, sem ela, o PGlite de .data/pglite. O app também migra sozinho ao subir.
import { closeDb, getDb, SCHEMA } from '../src/server/db'
import { migrate } from '../src/server/migrate'

const db = await getDb() // a 1ª conexão já migra; a chamada abaixo só confirma e mostra o estado
const r = await migrate(db, SCHEMA)
const rows = (await db.query<{ id: string; applied_at: Date }>('select id, applied_at from schema_migrations order by id')).rows
console.log(`banco: ${process.env.DATABASE_URL ? 'postgres' : 'pglite'}`)
for (const m of rows) console.log(`  ${m.id}  ${m.applied_at.toISOString()}${r.applied.includes(m.id) ? '  (aplicada agora)' : ''}`)
await closeDb()
