// Migrações versionadas. Cada uma tem um id em ordem ("0002_indices") e SQL idempotente
// (create … if not exists, add column if not exists). A tabela schema_migrations guarda id + checksum:
// - migração nova → roda;
// - migração já aplicada com o mesmo texto → pula;
// - texto mudou (ex.: o esquema-base 0001 ganhou uma coluna no fim) → roda de novo, o que é seguro por ser idempotente.
// Um advisory lock impede duas instâncias migrando ao mesmo tempo. Roda na 1ª conexão (getDb) e em `npm run migrate`.
import { createHash } from 'node:crypto'
import type { Db } from './db'

export type Migration = { id: string; sql: string }

/** Depois do esquema-base. Para mudar o banco: acrescente uma migração no fim (nunca reordene). */
export const MIGRATIONS: Migration[] = [
  // Classificação do movimento de moedas do jogo.
  { id: '0001_ledger_kind', sql: 'alter table ledger add column if not exists kind text;' },
  {
    id: '0002_indices_consultas_quentes',
    sql: `
-- Varredura da horta madura (server/ripe.ts): só lotes plantados e vivos, por hora de amadurecer.
create index if not exists plots_ripe_due_idx on plots (ready_at) where seed_id is not null and not withered;
-- Vizinhos sugeridos: os fazendeiros que jogaram por último.
create index if not exists users_last_seen_idx on users (last_seen_at desc);
create index if not exists users_bots_idx on users (id) where is_bot;
-- Amizade nos dois sentidos (a chave primária cobre user_id; isto cobre friend_id e o "on delete cascade").
create index if not exists friendships_friend_idx on friendships (friend_id);
-- Roubos sofridos (histórico da vítima) e apagar conta sem varrer a tabela.
create index if not exists steals_victim_idx on steals (victim_id, created_at desc);
-- Avisos de horta madura por dono (limite por dono).
create index if not exists ripe_alerts_owner_idx on ripe_alerts (user_id, owner_id, created_at desc);
create index if not exists push_subs_user_idx on push_subs (user_id);
create index if not exists sessions_user_idx on sessions (user_id);
create index if not exists ledger_user_idx on ledger (user_id, id desc);
create index if not exists events_actor_idx on events (actor_id) where actor_id is not null;
`,
  },
  // Frente F (regras do jogo): nível do cachorro por ossos, bichos produtivos e acessórios.
  {
    id: '0003_frente_f_bichos',
    sql: `
-- Nível do cachorro: ossos já dados (o nível sai daí; fica com o jogador se trocar de raça).
alter table users add column if not exists dog_bones int not null default 0;
-- Bichos produtivos (src/game/livestock.ts). O tempo do bicho só anda alimentado: fed_ms acumula até
-- settled_at e fed_until diz até quando a ração dura. cycle_from = fed_ms em que o lote atual começou.
-- taken = unidades do lote pronto que os amigos já levaram (o tamanho do lote sai de id + batch_seq).
create table if not exists animals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  slot text not null,
  kind text not null,
  fed_until timestamptz,
  fed_ms bigint not null default 0,
  settled_at timestamptz not null default now(),
  cycle_from bigint not null default 0,
  batch_seq int not null default 0,
  taken int not null default 0,
  created_at timestamptz not null default now(),
  unique (owner_id, slot)
);

-- Acessórios vestidos (lote O de arte): animal = lugar do bicho ('cow', 'chicken2'…) ou 'dog'. Vestido sai do
-- inventário; tirado volta. Só estética.
create table if not exists wear (
  owner_id uuid not null references users(id) on delete cascade,
  animal text not null,
  acc text not null,
  primary key (owner_id, animal, acc)
);
`,
  },
  // Frente J (decoração): peças das séries, peça equipada em cada lugar fixo e enfeites/caminhos na grade.
  {
    id: '0004_frente_j_decoracao',
    sql: `
-- Decoração (frente J). Peças de série ("casa:inverno"), enfeites soltos e pacotes de caminho que o jogador tem.
create table if not exists decor_owned (
  user_id uuid not null references users(id) on delete cascade,
  item_id text not null,
  qty int not null check (qty >= 0),
  primary key (user_id, item_id)
);
-- Peça equipada em cada lugar fixo (fundo, casa, casinha, enfeite, cerca). Sem linha = série padrão (sitio).
create table if not exists decor_slots (
  user_id uuid not null references users(id) on delete cascade,
  slot text not null,
  series text not null,
  primary key (user_id, slot)
);
-- Enfeites soltos e células de caminho na grade (game/decor-grid.ts): célula de cima da pegada.
create table if not exists decor_placed (
  id bigserial primary key,
  owner_id uuid not null references users(id) on delete cascade,
  item_id text not null,
  u int not null,
  v int not null,
  created_at timestamptz not null default now()
);
create index if not exists decor_placed_owner_idx on decor_placed (owner_id);
`,
  },
  // Evolução 04 (lote Q, A9): rosto escolhido pelo jogador ('01'–'08', public/art/ui/avatar_NN.png). Nulo = sai do apelido.
  {
    id: '0005_avatar_usuario',
    sql: `
alter table users add column if not exists avatar text check (avatar is null or avatar ~ '^0[1-8]$');
`,
  },
  // Evolução 07: level-up compartilhado ("Quem ver vai ganhar 100EXP"). Uma linha por link já aproveitado:
  // o mesmo jogador não ganha duas vezes pelo mesmo nível de quem compartilhou.
  {
    id: '0006_level_up_compartilhado',
    sql: `
create table if not exists share_claims (
  viewer_id uuid not null references users(id) on delete cascade,
  sharer_id uuid not null references users(id) on delete cascade,
  level int not null,
  xp int not null,
  created_at timestamptz not null default now(),
  primary key (viewer_id, sharer_id, level)
);
create index if not exists share_claims_viewer_idx on share_claims (viewer_id, created_at desc);
create index if not exists share_claims_sharer_idx on share_claims (sharer_id, created_at desc);
`,
  },
  // Evolução 09 (eventos sazonais): atalho de QA do evento, tigela de doces, quem pegou e o progresso das missões.
  {
    id: '0007_eventos_sazonais',
    sql: `
-- Chaves do jogo que valem para todos (hoje só o atalho de QA "event_override", gravado por /api/dev).
create table if not exists game_flags (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
-- Tigela de doces de cada fazenda, por evento: a 1ª vem cheia, os amigos pegam e, vazia, guarda o prêmio do dono.
create table if not exists event_bowls (
  owner_id uuid not null references users(id) on delete cascade,
  event_id text not null,
  candies int not null default 0 check (candies >= 0),
  filled_at timestamptz,
  prize_ready boolean not null default false,
  primary key (owner_id, event_id)
);
-- Quem pegou doce de qual tigela em cada dia (1 por amigo por tigela por dia: a "visita").
create table if not exists event_takes (
  id bigserial primary key,
  event_id text not null,
  owner_id uuid not null references users(id) on delete cascade,
  taker_id uuid not null references users(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  unique (event_id, owner_id, taker_id, day)
);
create index if not exists event_takes_taker_idx on event_takes (taker_id);
-- Progresso das missões do evento (contadores do evento inteiro, não do dia) e as recompensas resgatadas ("claim:N").
create table if not exists event_progress (
  user_id uuid not null references users(id) on delete cascade,
  event_id text not null,
  kind text not null,
  count int not null default 0,
  primary key (user_id, event_id, kind)
);
`,
  },
  // Evolução 13 (motor de eventos): objetos com ajuda de amigos, construção, presentes pendurados,
  // calendário de presença e oficina. `season` = ano do evento (a árvore de 2026 não vale em 2027).
  {
    id: '0008_eventos_motor',
    sql: `
-- Objetos do evento na fazenda de cada um: construção (nível), boneco de neve/baú/ovo gigante (ciclo e prazo),
-- oficina (aberturas). Uma linha por dono, evento, ano e objeto.
create table if not exists event_objects (
  owner_id uuid not null references users(id) on delete cascade,
  event_id text not null,
  season int not null,
  object text not null,
  level int not null default 0,
  cycle int not null default 0,
  started_at timestamptz,
  claimed boolean not null default false,
  primary key (owner_id, event_id, season, object)
);
-- Ajudas dos amigos: material da construção (1 por amigo por dia) e ajuda ao boneco/baú/ovo (1 por amigo por ciclo).
create table if not exists event_helps (
  id bigserial primary key,
  event_id text not null,
  season int not null,
  owner_id uuid not null references users(id) on delete cascade,
  helper_id uuid not null references users(id) on delete cascade,
  object text not null,
  turn text not null,
  item text,
  created_at timestamptz not null default now(),
  unique (event_id, season, owner_id, helper_id, object, turn)
);
create index if not exists event_helps_owner_idx on event_helps (owner_id, event_id, season, object);
-- Presentes pendurados na árvore (trancados até a data) e abertos pelo dono.
create table if not exists event_gifts (
  id bigserial primary key,
  event_id text not null,
  season int not null,
  owner_id uuid not null references users(id) on delete cascade,
  giver_id uuid references users(id) on delete set null,
  kind text not null,
  day date not null,
  created_at timestamptz not null default now(),
  opened_at timestamptz
);
create unique index if not exists event_gifts_daily_idx on event_gifts (event_id, season, owner_id, giver_id, day);
create index if not exists event_gifts_owner_idx on event_gifts (owner_id, event_id, season);
-- Calendário de presença: uma assinatura por dia do evento (as recuperadas com ouro ficam marcadas).
create table if not exists event_checkins (
  user_id uuid not null references users(id) on delete cascade,
  event_id text not null,
  season int not null,
  day int not null,
  paid boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id, season, day)
);
-- Oficina: o que está no forno e quando fica pronto.
create table if not exists event_crafts (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  event_id text not null,
  season int not null,
  recipe text not null,
  ready_at timestamptz not null,
  collected_at timestamptz
);
create index if not exists event_crafts_user_idx on event_crafts (user_id, event_id, season);
`,
  },
  // Vitrine da página inicial (ranking público só com as iniciais): o jogador pode sair em /conta. Ligada por padrão.
  {
    id: '0009_vitrine_publica',
    sql: `
alter table users add column if not exists public_ranking boolean not null default true;
`,
  },
]

const sum = (sql: string) => createHash('sha256').update(sql).digest('hex').slice(0, 16)

export type MigrateReport = { applied: string[]; skipped: string[] }

export async function migrate(db: Db, base: string, extra: Migration[] = MIGRATIONS): Promise<MigrateReport> {
  const all = [{ id: '0001_base', sql: base }, ...extra]
  const report: MigrateReport = { applied: [], skipped: [] }
  await db.transaction(async (q) => {
    // Trava só durante esta transação: a 2ª instância espera e depois vê tudo aplicado.
    await q.query("select pg_advisory_xact_lock(hashtext('colheita_feliz_migrate'))")
    await q.query(`create table if not exists schema_migrations (
      id text primary key, checksum text not null, applied_at timestamptz not null default now())`)
    const done = new Map((await q.query<{ id: string; checksum: string }>('select id, checksum from schema_migrations')).rows
      .map((r) => [r.id, r.checksum]))
    for (const m of all) {
      const c = sum(m.sql)
      if (done.get(m.id) === c) { report.skipped.push(m.id); continue }
      await q.exec(m.sql)
      await q.query(
        `insert into schema_migrations (id, checksum) values ($1, $2)
         on conflict (id) do update set checksum = excluded.checksum, applied_at = now()`, [m.id, c])
      report.applied.push(m.id)
    }
  })
  return report
}
