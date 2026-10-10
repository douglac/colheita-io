// npm run seed — dados de desenvolvimento (NUNCA em produção):
// - os vizinhos-bot do jogo (dona_cida, seu_ze);
// - "fazenda máxima" do jogador dev_max: nível 40, 24 lotes, todas as culturas, cachorro e muito ouro;
// - 6 vizinhos (vizinho_1..6) amigos do dev_max, com hortas em vários estágios (metade madura, para roubar).
// Usa as mesmas funções do jogo (loginOrCreate/runAction), então respeita as regras e o ledger.
// Pode rodar de novo: quem já existe só é "reabastecido".
import { SEEDS } from '../src/game/catalog'
import { MAX_PLOTS } from '../src/game/config'
import { closeDb, getDb } from '../src/server/db'
import { loginOrCreate, runAction } from '../src/server/game'

if (process.env.NODE_ENV === 'production' && process.env.SEED_FORCE !== '1') {
  console.error('seed recusado em produção (SEED_FORCE=1 para forçar num banco de testes)')
  process.exit(1)
}

const db = await getDb()
const sql = (q: string, p: unknown[] = []) => db.query(q, p)

async function farm(handle: string, level: number, plots: number, ripeShare: number) {
  const id = await loginOrCreate(handle)
  await sql("update users set level = $2, xp = 25 * $2 * ($2 - 1), gold = 999999, created_at = least(created_at, now() - interval '2 days') where id = $1", [id, level])
  for (let i = 0; i < plots; i++) await sql('insert into plots (owner_id, idx) values ($1, $2) on conflict do nothing', [id, i])
  const crops = SEEDS.filter((s) => !s.flower && s.minLevel <= level)
  for (let i = 0; i < plots; i++) {
    const seed = crops[i % crops.length]
    const free = (await sql('select seed_id from plots where owner_id = $1 and idx = $2', [id, i])).rows[0] as { seed_id: string | null }
    if (free.seed_id) continue
    await runAction(id, { type: 'buy', itemId: `semente:${seed.id}`, qty: 1 })
    await runAction(id, { type: 'plant', idx: i, seedId: seed.id })
  }
  // Parte da horta já madura (para colher/roubar na hora); o resto no meio do caminho.
  const ripe = Math.round(plots * ripeShare)
  await sql(`update plots set planted_at = now() - (ready_at - planted_at) - interval '1 minute', ready_at = now() - interval '1 minute',
               dry_at = null, nat_pest_at = null, nat_weed_at = null, pests = 0, weeds = 0
             where owner_id = $1 and seed_id is not null and idx < $2`, [id, ripe])
  return id
}

const max = await farm('dev_max', 40, MAX_PLOTS, 0.5)
await runAction(max, { type: 'buy', itemId: 'cao:pastor', qty: 1 }).catch(() => {}) // já tem: segue
for (const s of SEEDS) await sql(
  `insert into inventory (user_id, item_id, qty) values ($1, $2, 20) on conflict (user_id, item_id) do update set qty = greatest(inventory.qty, 20)`,
  [max, `semente:${s.id}`])
await sql(`insert into inventory (user_id, item_id, qty) values ($1, 'adubo', 50), ($1, 'adubo_forte', 20), ($1, 'racao', 10)
           on conflict (user_id, item_id) do update set qty = greatest(inventory.qty, excluded.qty)`, [max])

for (let n = 1; n <= 6; n++) {
  const h = `vizinho_${n}`
  await farm(h, 5 + n * 3, 6 + n * 2, 0.5)
  await runAction(max, { type: 'add_friend', handle: h }).catch(() => {}) // já amigos: segue
}

const counts = (await sql(`select (select count(*)::int from users) users, (select count(*)::int from plots) plots,
  (select count(*)::int from friendships) friendships`)).rows[0]
console.log('seed ok:', counts, '· entre como dev_max (login de teste) para ver a fazenda máxima')
await closeDb()
