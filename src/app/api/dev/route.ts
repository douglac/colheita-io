import { existsSync } from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { SEEDS, SHOP, flowerItem } from '@/game/catalog'
import { ACCESSORIES, foodFullMs, kindOfSlot, LIVESTOCK } from '@/game/livestock'
import { origAnimalMs } from '@/game/config'
import { copyOf, herdIds, isAnimalId, type Herd, type Spots } from '@/game/pasture'
import { SERIES_BY_ID, SLOTS } from '@/game/decor'
import { showcaseLayout } from '@/game/decor-showcase'
import { growMs, RIPE_STAGE } from '@/game/rules'
import { getDb, type Q } from '@/server/db'
import { loginOrCreate } from '@/server/game'
import { kickRipe } from '@/server/ripe'
import { EVENT_BY_ID, eventWindow } from '@/game/events'
import { saveOverride } from '@/server/events'
import { currentUser } from '@/server/session'

// Fazenda no máximo ({maxFarm: true}): cada lote numa situação (ciclo de 12), todas as culturas.
type Look = 'ripe' | 'withered' | 'empty' | 0 | 1 | 2 | 3 | 4
const LOOKS: Look[] = ['ripe', 'ripe', 4, 3, 'ripe', 'withered', 2, 1, 'ripe', 0, 'empty', 'ripe']
const CARE_AT: Record<number, 'pests' | 'weeds' | 'dry'> = { 2: 'pests', 3: 'weeds', 7: 'dry', 14: 'pests', 15: 'dry', 19: 'weeds' }
// 25 bichos e a colmeia (lote Q): os 5 de antes e os 5 do lote J (se a arte do lote J ainda não estiver no disco, só cópias dos antigos).
const HERD_FULL: Herd = { cow: 3, sheep: 3, pig: 3, chicken: 3, donkey: 3, peacock: 3, duck: 4, rabbit: 3, goat: 3, bee: 1 }
// Só culturas com arte (as `needsArt` não estão na loja e cairiam no desenho provisório).
const PLANTABLE = SEEDS.filter((s) => !s.needsArt)
const HERD_OLD: Herd = { cow: 6, sheep: 6, pig: 5, chicken: 8 }

/** Planta direto no banco o lote `idx` do dono com a cultura e a situação pedidas (sem custo, sem aviso). */
async function fillPlot(db: Q, ownerId: string, idx: number, seedIdx: number, look: Look, care?: 'pests' | 'weeds' | 'dry') {
  if (look === 'empty') {
    await db.query(`update plots set seed_id = null, planted_at = null, ready_at = null, yield_total = null, yield_left = null,
      withered = false, pests = 0, weeds = 0, dry_at = null, nat_pest_at = null, nat_weed_at = null where owner_id = $1 and idx = $2`, [ownerId, idx])
    return
  }
  const seed = PLANTABLE[seedIdx % PLANTABLE.length]
  const grow = growMs(seed), now = Date.now()
  const frac = look === 'ripe' || look === 'withered' ? 1.01 : (look + 0.5) / RIPE_STAGE
  const planted = now - grow * frac
  const y = Math.round((seed.yieldMin + seed.yieldMax) / 2)
  await db.query(
    `update plots set seed_id = $3, planted_at = $4, ready_at = $5, yield_total = $6, yield_left = $7, withered = $8,
       sow_seq = sow_seq + 1, ripe_seq = sow_seq + 1, season = 1, pests = $9, weeds = $10, dry_at = $11, dry_ms = 0,
       nat_pest_at = null, nat_weed_at = null
     where owner_id = $1 and idx = $2`,
    [ownerId, idx, seed.id, new Date(planted), new Date(planted + grow), y, look === 'withered' ? 0 : y, look === 'withered',
      care === 'pests' ? 2 : 0, care === 'weeds' ? 2 : 0, care === 'dry' ? new Date(now - 60_000) : null])
}

async function setPlotCount(db: Q, ownerId: string, n: number) {
  await db.query('delete from plots where owner_id = $1 and idx >= $2', [ownerId, n])
  for (let i = 0; i < n; i++) await db.query('insert into plots (owner_id, idx) values ($1, $2) on conflict do nothing', [ownerId, i])
}

/** Atalho de QA: a fazenda mais cheia possível (desempenho e expansão). */
async function maxFarm(db: Q, userId: string, plots: number) {
  await db.query('update users set level = 60, xp = 25 * 60 * 59, gold = 9999999, dog = $2, dog_fed_until = now() + interval \'72 hours\', dog_expires_at = null, dog_hungry_warned = null, herd = $3 where id = $1',
    [userId, 'pastor', JSON.stringify(existsSync(path.join(process.cwd(), 'public/art/animals/donkey_idle_0.png')) ? HERD_FULL : HERD_OLD)])
  await db.query('delete from animal_spots where owner_id = $1', [userId]) // todos nas áreas padrão
  // Todos os estágios: 1ª cópia adulta (com todos os acessórios dela), 2ª jovem, 3ª+ filhote. O cachorro veste os dele.
  const { rows: [{ herd }] } = await db.query<{ herd: Herd }>('select herd from users where id = $1', [userId])
  await db.query('delete from animals where owner_id = $1', [userId])
  await db.query('delete from wear where owner_id = $1', [userId])
  for (const slot of herdIds(herd)) {
    const l = LIVESTOCK[kindOfSlot(slot)!], ms = l.stagesH.map(origAnimalMs), n = copyOf(slot)
    const teen = ms.slice(0, Math.ceil(l.stagesH.length / 2)).reduce((a, b) => a + b, 0) + 1 // 1º estágio "jovem" (lookOf)
    const fed = n === 1 ? ms.reduce((a, b) => a + b, 0) : n === 2 ? teen : 0
    await db.query(`insert into animals (owner_id, slot, kind, fed_until, fed_ms, settled_at, cycle_from) values ($1, $2, $3, now() + $4 * interval '1 millisecond', $5, now(), $5)`,
      [userId, slot, l.kind, foodFullMs(), fed])
  }
  // Um enfeite por lugar do corpo (como na ação wear): o primeiro de cada lugar.
  const worn = ACCESSORIES.filter((a, i) => ACCESSORIES.findIndex((o) => o.animal === a.animal && o.spot === a.spot) === i)
  for (const a of worn) await db.query('insert into wear (owner_id, animal, acc) values ($1, $2, $3)', [userId, a.animal === 'dog' ? 'dog' : a.animal, a.id])
  await setPlotCount(db, userId, plots)
  for (let i = 0; i < plots; i++) await fillPlot(db, userId, i, i, LOOKS[i % LOOKS.length], CARE_AT[i])
  // Inventário: tudo da loja (menos cachorro, que não é item), colheitas e flores.
  const items: [string, number][] = SHOP.filter((it) => !it.id.startsWith('cao:')).map((it) => [it.id, 99])
  for (const s of SEEDS) items.push(s.flower ? [flowerItem(s.id), 5] : [s.id, 30])
  for (const [itemId, qty] of items) {
    await db.query(`insert into inventory (user_id, item_id, qty) values ($1, $2, $3)
      on conflict (user_id, item_id) do update set qty = excluded.qty`, [userId, itemId, qty])
  }
  // Vizinhos amigos com a roça cheia e madura, para visitar.
  for (const handle of ['viz_max_ana', 'viz_max_beto']) {
    const id = await loginOrCreate(handle)
    await db.query('update users set level = 30, gold = 5000 where id = $1', [id])
    await setPlotCount(db, id, 18)
    for (let i = 0; i < 18; i++) await fillPlot(db, id, i, i + 3, 'ripe')
    await db.query(`insert into friendships (user_id, friend_id, via) values ($1, $2, 'add'), ($2, $1, 'add') on conflict do nothing`, [userId, id])
  }
}

// Atalhos de QA (SÓ em desenvolvimento): subir nível/ouro, dar itens e levar os lotes do jogador
// a um estágio, para conferir arte e regras sem esperar horas. Em produção responde 404.
export async function POST(req: Request) {
  if (process.env.NODE_ENV !== 'development') return new NextResponse(null, { status: 404 })
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Faça login' }, { status: 401 })
  const body = (await req.json()) as {
    level?: number; gold?: number; items?: Record<string, number>
    stage?: 0 | 1 | 2 | 3 | 4 | 5 | 'withered' // todos os lotes plantados vão para esse estágio (5 = maduro)
    oldAccount?: boolean // conta criada há 1 dia (passa da quarentena de roubo)
    dogFedHours?: number // ração do cachorro acaba daqui a N horas (negativo = já dormiu)
    plots?: number // deixa a fazenda com exatamente N lotes (6..24)
    herd?: Herd // rebanho (cópias por espécie), ex.: {cow: 3, duck: 2}
    stagePlots?: number[] // só estes lotes (idx) recebem o "stage"; sem isto, todos os plantados
    dry?: boolean // depois do "stage": os lotes (os mesmos do filtro) ficam com a terra seca agora
    maxFarm?: boolean // fazenda no máximo: nível 60, ouro farto, `plots` (padrão 24) lotes variados, tudo da loja, 28 bichos (adulto, jovem e filhote de cada espécie, adultos com todos os acessórios), vizinhos maduros
    owner?: string // aplica os atalhos de bicho na fazenda deste apelido (para testar o roubo)
    animalsReady?: boolean // os bichos (adultos) ficam com o lote pronto
    animalsFood?: number // barra de alimento dos bichos (0..100)
    dogBones?: number // ossos já dados ao cachorro
    wear?: string[] // veste exatamente estes acessórios (ids de ACCESSORIES), mesmo dois no mesmo lugar do corpo (QA da camada)
    decor?: string // decoração de vitrine (frente J): equipa a série dada ('sitio', 'arco_iris', 'inverno') e põe 40 enfeites + caminho
    decorCount?: number // quantos enfeites na vitrine (padrão 40; até 24 eles ficam com folga de 2 células)
    // Evento sazonal (Evolução 09), vale para todos os jogadores deste servidor:
    // 'halloween' força o evento agora; 'off' desliga todos; 'auto' volta ao calendário (Brasília).
    event?: string
    eventEndsInMin?: number // com event: o evento forçado acaba daqui a N min (padrão: a duração do calendário)
    bowl?: number // doces na minha tigela do evento valendo (0 = vazia)
    bowlPrize?: boolean // minha tigela fica com o prêmio esperando (como se os amigos tivessem esvaziado)
    eventReset?: boolean // zera hoje: visitantes espantados, tigelas pegas, o progresso e as recompensas das missões do evento, e (Evolução 13) árvore, ajudas, presentes, meias e oficina
  }
  const db = await getDb()
  if (body.event) {
    const now = Date.now()
    if (body.event === 'auto') await saveOverride(db, null)
    else if (body.event === 'off') await saveOverride(db, { mode: 'off' })
    else {
      const def = EVENT_BY_ID[body.event]
      if (!def) return NextResponse.json({ error: `Evento desconhecido: ${body.event}` }, { status: 400 })
      const w = eventWindow(def, now)
      const length = body.eventEndsInMin != null ? body.eventEndsInMin * 60_000 : w.endsAt - w.startsAt
      await saveOverride(db, { mode: 'on', eventId: def.id, startsAt: now - 60_000, endsAt: now + length })
    }
  }
  if (body.eventReset) {
    await db.query("delete from daily_counters where user_id = $1 and kind like 'ev:%'", [user.id])
    await db.query('delete from event_takes where taker_id = $1 or owner_id = $1', [user.id])
    await db.query('delete from event_progress where user_id = $1', [user.id])
    // Evolução 13: árvore, objetos de ajuda, presentes, meias e oficina deste jogador (como dono ou como quem ajudou).
    await db.query('delete from event_objects where owner_id = $1', [user.id])
    await db.query('delete from event_helps where owner_id = $1 or helper_id = $1', [user.id])
    await db.query('delete from event_gifts where owner_id = $1 or giver_id = $1', [user.id])
    await db.query('delete from event_checkins where user_id = $1', [user.id])
    await db.query('delete from event_crafts where user_id = $1', [user.id])
  }
  if (body.bowl != null || body.bowlPrize != null) {
    for (const def of Object.values(EVENT_BY_ID)) {
      if (!def.bowl) continue
      await db.query(`insert into event_bowls (owner_id, event_id, candies, prize_ready) values ($1, $2, $3, $4)
        on conflict (owner_id, event_id) do update set candies = excluded.candies, prize_ready = excluded.prize_ready`,
        [user.id, def.id, Math.max(0, Math.min(def.bowl.capacity, body.bowl ?? 0)), !!body.bowlPrize])
    }
  }
  if (body.decor) {
    // Vitrine da decoração: tudo da série equipado, enfeites e caminho da vitrine (as mesmas regras do servidor).
    const series = SERIES_BY_ID[body.decor] ? body.decor : 'inverno'
    await db.query('delete from decor_placed where owner_id = $1', [user.id])
    await db.query('delete from decor_slots where user_id = $1', [user.id])
    for (const slot of SLOTS) {
      if (series !== 'sitio') {
        await db.query(`insert into decor_owned (user_id, item_id, qty) values ($1, $2, 1) on conflict (user_id, item_id) do update set qty = 1`, [user.id, `${slot}:${series}`])
        await db.query('insert into decor_slots (user_id, slot, series) values ($1, $2, $3)', [user.id, slot, series])
      }
    }
    const spots: Spots = {}
    for (const r of (await db.query<{ animal: string; x: number; y: number }>('select animal, x, y from animal_spots where owner_id = $1', [user.id])).rows) {
      if (isAnimalId(r.animal)) spots[r.animal] = { x: r.x, y: r.y }
    }
    const layout = showcaseLayout(Math.max(1, Math.min(40, Math.floor(body.decorCount ?? 40))), spots)
    const count: Record<string, number> = {}
    for (const p of layout) {
      count[p.itemId] = (count[p.itemId] ?? 0) + 1
      await db.query('insert into decor_placed (owner_id, item_id, u, v) values ($1, $2, $3, $4)', [user.id, p.itemId, p.u, p.v])
    }
    for (const [itemId, n] of Object.entries(count)) {
      await db.query(`insert into decor_owned (user_id, item_id, qty) values ($1, $2, $3) on conflict (user_id, item_id) do update set qty = greatest(decor_owned.qty, excluded.qty)`, [user.id, itemId, n])
    }
    await db.query('update users set level = greatest(level, 80), xp = greatest(xp, 25 * 80 * 79) where id = $1', [user.id])
    return NextResponse.json({ ok: true, decor: series, placed: layout.length })
  }
  if (body.maxFarm) {
    await maxFarm(db, user.id, Math.max(6, Math.min(24, Math.floor(body.plots ?? 24))))
    kickRipe(Date.now())
    return NextResponse.json({ ok: true, maxFarm: true })
  }
  // Filtro opcional por lote (para pôr culturas em estágios diferentes ao mesmo tempo).
  const only = body.stagePlots?.length ? ` and idx = any($${body.stage === 'withered' ? 2 : 4}::int[])` : ''
  const onlyArg = body.stagePlots?.length ? [body.stagePlots] : []
  if (body.level != null) await db.query('update users set level = $2, xp = 25 * $2 * ($2 - 1) where id = $1', [user.id, body.level])
  if (body.gold != null) await db.query('update users set gold = $2 where id = $1', [user.id, body.gold])
  for (const [itemId, qty] of Object.entries(body.items ?? {})) {
    await db.query(
      `insert into inventory (user_id, item_id, qty) values ($1, $2, $3)
       on conflict (user_id, item_id) do update set qty = excluded.qty`, [user.id, itemId, qty])
  }
  if (body.plots != null) {
    const n = Math.max(6, Math.min(24, Math.floor(body.plots)))
    await db.query('delete from plots where owner_id = $1 and idx >= $2', [user.id, n])
    for (let i = 0; i < n; i++) await db.query('insert into plots (owner_id, idx) values ($1, $2) on conflict do nothing', [user.id, i])
  }
  if (body.herd) await db.query('update users set herd = $2 where id = $1', [user.id, JSON.stringify(body.herd)])
  if (body.oldAccount) await db.query("update users set created_at = now() - interval '1 day' where id = $1", [user.id])
  if (body.dogFedHours != null) {
    await db.query("update users set dog_fed_until = now() + $2 * interval '1 hour', dog_hungry_warned = null where id = $1", [user.id, body.dogFedHours])
  }
  if (body.stage === 'withered') {
    await db.query('update plots set withered = true, yield_left = 0 where owner_id = $1 and seed_id is not null' + only, [user.id, ...onlyArg])
  } else if (body.stage != null) {
    // Reposiciona a linha do tempo: estágio n (0–4) no meio do intervalo; 5 = acabou de amadurecer.
    const now = Date.now()
    const frac = body.stage >= RIPE_STAGE ? 1.01 : (body.stage + 0.5) / RIPE_STAGE
    await db.query(
      `update plots set withered = false,
         planted_at = to_timestamp(($2 - (extract(epoch from ready_at - planted_at) * 1000) * $3) / 1000),
         ready_at = to_timestamp(($2 - (extract(epoch from ready_at - planted_at) * 1000) * $3 + extract(epoch from ready_at - planted_at) * 1000) / 1000),
         pests = 0, weeds = 0, dry_at = null, nat_pest_at = null, nat_weed_at = null
       where owner_id = $1 and seed_id is not null and planted_at is not null${only}`, [user.id, now, frac, ...onlyArg])
  }
  if (body.dry) {
    const dryOnly = body.stagePlots?.length ? ' and idx = any($2::int[])' : ''
    await db.query(`update plots set dry_at = now() - interval '1 minute' where owner_id = $1 and seed_id is not null${dryOnly}`, [user.id, ...onlyArg])
  }
  const target = body.owner ? (await db.query<{ id: string }>('select id from users where handle = $1', [body.owner])).rows[0]?.id ?? user.id : user.id
  if (body.animalsReady) {
    const { LIVESTOCK, cycleMs, growTotalMs } = await import('@/game/livestock')
    for (const l of Object.values(LIVESTOCK)) {
      await db.query('update animals set fed_ms = greatest(fed_ms, $3::bigint) + $2, cycle_from = greatest(fed_ms, $3::bigint), settled_at = now(), taken = 0 where owner_id = $1 and kind = $4',
        [target, cycleMs(l), growTotalMs(l), l.kind])
    }
  }
  if (body.animalsFood != null) {
    const { foodFullMs } = await import('@/game/livestock')
    await db.query("update animals set settled_at = now(), fed_until = now() + $2 * interval '1 millisecond' where owner_id = $1", [target, Math.round((foodFullMs() * body.animalsFood) / 100)])
  }
  if (body.dogBones != null) await db.query('update users set dog_bones = $2 where id = $1', [target, body.dogBones])
  if (body.wear) {
    await db.query('delete from wear where owner_id = $1', [target])
    for (const a of ACCESSORIES.filter((a) => body.wear!.includes(a.id))) {
      await db.query('insert into wear (owner_id, animal, acc) values ($1, $2, $3) on conflict do nothing', [target, a.animal, a.id])
    }
  }
  kickRipe(Date.now()) // estágio mexido: confere já a horta madura (avisos)
  return NextResponse.json({ ok: true })
}
