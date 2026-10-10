// Banco: Postgres. Dois motores com a mesma interface `query`/`exec`/`transaction`:
// - PGlite (Postgres em WASM, gravado em .data/) no desenvolvimento e nos testes;
// - Postgres de verdade (pacote `pg`) quando há DATABASE_URL (Docker, produção).
// O esquema sobe por migrações versionadas (server/migrate.ts) na primeira conexão.
import { PGlite } from '@electric-sql/pglite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { migrate } from './migrate'
import { errorFields, log } from './observe'

export type Rows<T> = { rows: T[] }
export type Q = { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<Rows<T>> }
/** Dentro de transação: query + exec (vários comandos num texto só, usado pelas migrações). */
export type Tx = Q & { exec(sql: string): Promise<unknown> }
export type Db = Tx & {
  transaction<T>(fn: (q: Tx) => Promise<T>): Promise<T>
  close(): Promise<void>
  /** Só no PGlite: a instância crua, para o backup (server/backup.ts). */
  pglite?: PGlite
}

/** Esquema-base (migração 0001). Tudo idempotente: pode crescer no fim e roda de novo quando o texto muda. */
export const SCHEMA = `
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  handle text unique not null,
  is_bot boolean not null default false,
  level int not null default 1,
  xp int not null default 0,
  gold int not null default 0,
  credits int not null default 0,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create table if not exists sessions (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists plots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  idx int not null,
  seed_id text,
  planted_at timestamptz,
  ready_at timestamptz,
  yield_total int,
  yield_left int,
  withered boolean not null default false,
  unique (owner_id, idx)
);
create table if not exists inventory (
  user_id uuid not null references users(id) on delete cascade,
  item_id text not null,
  qty int not null check (qty >= 0),
  primary key (user_id, item_id)
);
create table if not exists steals (
  id bigserial primary key,
  thief_id uuid not null references users(id) on delete cascade,
  victim_id uuid not null references users(id) on delete cascade,
  harvest_key text not null,
  qty int not null,
  created_at timestamptz not null default now(),
  unique (thief_id, harvest_key)
);
create table if not exists daily_counters (
  user_id uuid not null references users(id) on delete cascade,
  day date not null,
  kind text not null,
  count int not null default 0,
  primary key (user_id, day, kind)
);
create table if not exists events (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  actor_id uuid references users(id) on delete set null,
  kind text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists events_user_idx on events (user_id, id desc);
alter table users add column if not exists popularity int not null default 0;
alter table users add column if not exists invite_code text;
create unique index if not exists users_invite_code on users (invite_code);
create table if not exists push_subs (
  endpoint text primary key,
  user_id uuid not null references users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create table if not exists friendships (
  user_id uuid not null references users(id) on delete cascade,
  friend_id uuid not null references users(id) on delete cascade,
  via text, -- 'invite' ou 'add'
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);
alter table users add column if not exists dog text;
alter table users add column if not exists dog_fed_until timestamptz;
alter table users add column if not exists dog_expires_at timestamptz;
alter table users add column if not exists dog_hungry_warned timestamptz;
alter table users add column if not exists dog_leaving_warned boolean not null default false;
alter table users add column if not exists login_day date;
alter table users add column if not exists login_streak int not null default 0;
alter table plots add column if not exists sow_seq int not null default 0;
alter table plots add column if not exists season int not null default 1;
alter table plots add column if not exists pests int not null default 0;
alter table plots add column if not exists weeds int not null default 0;
alter table plots add column if not exists dry_at timestamptz;
alter table plots add column if not exists dry_ms bigint not null default 0;
alter table plots add column if not exists nat_pest_at timestamptz;
alter table plots add column if not exists nat_weed_at timestamptz;
-- Roubo 'tap': o cachorro mordeu este ladrão nesta safra (o lote fecha para ele).
alter table steals add column if not exists bitten boolean not null default false;

-- Onde o dono deixou cada bicho (arrastar e soltar). Sem linha = área padrão do bicho.
create table if not exists animal_spots (
  owner_id uuid not null references users(id) on delete cascade,
  animal text not null,
  x int not null,
  y int not null,
  primary key (owner_id, animal)
);

-- Horta madura: ripe_seq = última safra (sow_seq) já avisada. A varredura (server/ripe.ts) acha as que faltam,
-- então nada se perde se o servidor reiniciar. Na criação da coluna, o que já estava maduro conta como avisado.
alter table plots add column if not exists ripe_seq int;
update plots set ripe_seq = case when ready_at <= now() then sow_seq else 0 end where ripe_seq is null;
alter table plots alter column ripe_seq set default 0;
-- Adubo: 1 por estágio. fert_stage = estágio já adubado na safra fert_seq.
alter table plots add column if not exists fert_seq int not null default 0;
alter table plots add column if not exists fert_stage int not null default -1;
-- Avisos "a horta de X está madura" mandados aos amigos (base dos limites por dia e por dono).
create table if not exists ripe_alerts (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  owner_id uuid not null references users(id) on delete cascade,
  day date not null,
  plots int not null,
  created_at timestamptz not null default now()
);
create index if not exists ripe_alerts_user_idx on ripe_alerts (user_id, day);

-- Rebanho (bichos de enfeite com cópias): {"cow": 3, "duck": 2, …}. Nulo = o de sempre (pasture.ts, DEFAULT_HERD).
alter table users add column if not exists herd jsonb;

create table if not exists ledger (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  currency text not null,
  delta int not null,
  balance_after int not null,
  reason text not null,
  created_at timestamptz not null default now()
);
-- Conta por e-mail (frente M). E-mail sempre minúsculo; contas de teste antigas ficam sem e-mail até vincular.
alter table users add column if not exists email text;
create unique index if not exists users_email on users (email);
alter table users add column if not exists birth_date date;
alter table users add column if not exists age_band text; -- 'lt13' | '13_15' | '16_17' | '18p'
alter table users add column if not exists guardian_consent_at timestamptz;
alter table users add column if not exists terms_version text;
alter table users add column if not exists terms_accepted_at timestamptz;
-- Sessões: o cookie leva o segredo; o banco guarda só o hash (sha256). Expira e renova (server/session.ts).
alter table sessions add column if not exists expires_at timestamptz not null default now() + interval '30 days';
alter table sessions add column if not exists renewed_at timestamptz not null default now();
alter table sessions add column if not exists user_agent text;
delete from sessions where length(id) <> 43; -- sessões antigas (segredo puro, antes do hash) caem uma vez
-- Códigos de 6 dígitos e links mágicos (uso único, 15 min). Só hashes no banco.
create table if not exists auth_tokens (
  id bigserial primary key,
  email text not null,
  purpose text not null, -- 'login' | 'link' (vincular e-mail) | 'delete' (excluir conta)
  user_id uuid references users(id) on delete cascade,
  code_hash text not null,
  link_hash text not null unique,
  attempts int not null default 0,
  ip text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists auth_tokens_email_idx on auth_tokens (email, created_at desc);
create index if not exists auth_tokens_ip_idx on auth_tokens (ip, created_at desc);
-- E-mail confirmado que ainda não escolheu apelido (primeiro acesso). id = hash do cookie.
create table if not exists auth_signups (
  id text primary key,
  email text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

`

const g = globalThis as unknown as { __fzDb?: Promise<Db> }

async function openPglite(): Promise<Db> {
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), '.data', 'pglite')
  if (dir !== 'memory://') mkdirSync(dir, { recursive: true })
  const db = await PGlite.create(dir === 'memory://' ? undefined : dir)
  return {
    query: (sql, params) => db.query(sql, params as unknown[]),
    exec: (sql) => db.exec(sql),
    transaction: (fn) => db.transaction((t) => fn({ query: (sql, params) => t.query(sql, params as unknown[]), exec: (sql) => t.exec(sql) })),
    close: () => db.close(),
    pglite: db,
  }
}

async function openPg(url: string): Promise<Db> {
  const { default: pg } = await import('pg')
  // Mesmos tipos que o PGlite devolve: bigint/count como number e date como meia-noite UTC.
  pg.types.setTypeParser(20, (v) => Number(v))
  pg.types.setTypeParser(1082, (v) => new Date(v + 'T00:00:00Z'))
  const pool = new pg.Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    options: '-c timezone=UTC',
    ssl: process.env.DATABASE_SSL === '1' ? { rejectUnauthorized: process.env.DATABASE_SSL_INSECURE !== '1' } : undefined,
  })
  pool.on('error', (e) => log('error', 'pg pool', errorFields(e)))
  const query: Q['query'] = async (sql, params) => ({ rows: (await pool.query(sql, params as unknown[])).rows })
  return {
    query,
    exec: (sql) => pool.query(sql),
    async transaction(fn) {
      const c = await pool.connect()
      try {
        await c.query('begin')
        const out = await fn({
          query: async (sql, params) => ({ rows: (await c.query(sql, params as unknown[])).rows }),
          exec: (sql) => c.query(sql),
        })
        await c.query('commit')
        return out
      } catch (e) {
        await c.query('rollback').catch(() => {})
        throw e
      } finally {
        c.release()
      }
    },
    close: () => pool.end(),
  }
}

async function open(): Promise<Db> {
  const url = process.env.DATABASE_URL
  const db = url ? await openPg(url) : await openPglite()
  await migrate(db, SCHEMA)
  return db
}

export function getDb(): Promise<Db> {
  g.__fzDb ??= open().catch((e) => {
    g.__fzDb = undefined
    throw e
  })
  return g.__fzDb
}

/** Fecha a conexão (scripts de linha de comando: migrate, seed, carga). */
export async function closeDb() {
  const p = g.__fzDb
  g.__fzDb = undefined
  if (p) await (await p).close()
}

export async function tx<T>(fn: (q: Q) => Promise<T>): Promise<T> {
  const db = await getDb()
  return db.transaction(fn)
}

export const ms = (d: Date | null | undefined) => (d ? d.getTime() : null)
