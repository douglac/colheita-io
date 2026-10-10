'use client'
import { useState } from 'react'
import { fmtGold, fmtMinutes, fmtRange, itemIcon, itemName, SEED_BY_ID, SEEDS, sellPriceOf, SHOP, SHOP_BY_ID, SHOP_TABS, type ShopItem, type ShopTab } from '@/game/catalog'
import { DOG_BREEDS, dogIcon, EVENTS, GAME_NAME as GAME_NAME_SHORT, GIFT_SEEDS, INVITE, LOGIN_BONUS, POPULARITY_CAP, SHARE_XP } from '@/game/config'
import { salePrice } from '@/game/rules'
import { shopOpenFor } from '@/game/events'
import { ACCESSORIES, accItem, FEEDS, fmtHM, LIVESTOCK, type AnimalView } from '@/game/livestock'
import { fmtDuration, seedSheet } from '@/game/sheet'
import { noteShare } from '@/game/share'
import type { FarmPayload, SaleView } from '@/server/game'
import { DecorShop, MyDecorPanel } from './DecorShop'
import { HScroll } from './HScroll'
import { Dialog } from './ui/Dialog'
import { Avatar } from './Avatar'
import { Icon } from './ui/Icon'
import { ArtSeal, Badge, Card, DialogHeader, PrimaryButton, StatChip, Stepper } from './ui/kit'

/** Faz a ação no servidor; devolve a resposta quando deu certo e null quando não. */
export type Act = (body: Record<string, unknown>) => Promise<{ sale?: SaleView } | null>
type Me = FarmPayload['me']

const shopIcon = (i: ShopItem, size = 64) => <Icon name={i.icon} size={size}
  emoji={i.seedId ? '🌱' : i.id === 'racao' ? '🦴' : i.id.startsWith('cao:') ? '🐶' : i.id.startsWith('bicho:') ? '🐾' : itemIcon(i.id).emoji} />
const Coin = ({ size = 18 }: { size?: number }) => <Icon name="coin" emoji="🪙" size={size} />

const FOOD_PRICE = SHOP_BY_ID.racao.gold

// ---------- Loja: abas, grade de itens e ficha do item escolhido ----------

// Aba sem nenhum item fica escondida (no teste ela seria um beco sem saída). A Decoração tem catálogo próprio (game/decor.ts).
const TABS = SHOP_TABS.filter((t) => t.id === 'decoracao' || SHOP.some((i) => i.tab === t.id))

export function ShopDialog({ me, decor, event, now, busy, act, at, tab: startTab, onClose }: {
  me: Me; decor: FarmPayload['myDecor']; event: FarmPayload['event']; now: number; busy: boolean; act: Act; at?: string; tab?: ShopTab; onClose: () => void
}) {
  // `at`: abre já com esse item escolhido (atalho do "Você não tem semente de X. Quer comprar?").
  const start = at ? SHOP_BY_ID[at] : undefined
  // `tab`: abre nessa aba (o "Comprar" do modo decoração abre em Decoração › Enfeites).
  const [tab, setTab] = useState<ShopTab>(start?.tab ?? startTab ?? 'sementes')
  const [pick, setPick] = useState<ShopItem | null>(start && me.level >= start.minLevel ? start : null)
  const [qty, setQty] = useState(1)
  // Itens de evento só na época; a semente do evento sai antes do fim (game/events.ts, trava do Bis Limão).
  const items = SHOP.filter((i) => i.tab === tab && (!i.event || (i.event in EVENTS ? shopOpenFor(i, null, now)
    : event?.id === i.event && (!i.seedId || now < event.seedsUntil))))
    .sort((a, b) => Number(!!b.event) - Number(!!a.event)) // os do evento na frente
  const ownedDog = (i: ShopItem) => i.id === `cao:${me.dog?.kind}`

  return (
    <Dialog title="Loja" icon={<Icon name="shop" emoji="🏪" size={40} />} tabs={TABS} tab={tab} className="shop-dialog"
      onTab={(t) => { setTab(t); setPick(null) }} onClose={onClose} wide
      footer={<span className="wallet"><span className="t-label">Seu ouro</span> <Coin size={22} /> <b className="t-num">{fmtGold(me.gold)}</b></span>}>
      {tab === 'decoracao' && <DecorShop me={me} decor={decor} event={event?.id ?? null} busy={busy} act={act} sub={startTab === 'decoracao' ? 'enfeites' : undefined} />}
      {tab !== 'decoracao' && <div className={`shop ${pick ? 'picked' : ''}`}>
        <div className="grid shop-grid">
          {items.map((i) => {
            const locked = me.level < i.minLevel
            const owned = ownedDog(i)
            return (
              <button key={i.id} className={`cell ${pick?.id === i.id ? 'on' : ''}`} disabled={locked || owned} aria-pressed={pick?.id === i.id}
                title={locked ? `Libera no nível ${i.minLevel}` : undefined} onClick={() => { setPick(i); setQty(1) }}>
                {shopIcon(i)}
                <b className="cell-name">{i.name}</b>
                <span className="price"><Coin size={16} /> {fmtGold(i.gold)}</span>
                {i.seedId && !SEED_BY_ID[i.seedId]?.flower && <small className="renda">renda: {fmtGold(seedSheet(SEED_BY_ID[i.seedId]).income)}</small>}
                {locked && <span className="lock"><Badge tone="wood">🔒 Nível {i.minLevel}</Badge></span>}
                {i.event && !locked && <span className="lock"><Badge tone="wood">🎃 Evento</Badge></span>}
                {owned && <span className="lock"><Badge tone="green">Já tem</Badge></span>}
              </button>
            )
          })}
        </div>
        {pick ? (
          <ItemSheet item={pick} me={me} qty={qty} setQty={setQty} busy={busy} onClose={() => setPick(null)}
            onBuy={async () => { if (await act({ type: 'buy', itemId: pick.id, qty: pick.id.startsWith('cao:') ? 1 : qty })) setPick(null) }} />
        ) : (
          <aside className="item-sheet empty" aria-hidden>
            <span className="empty-ic">👆</span>
            <p>Escolha um item para ver a ficha: tempo, colheita, lucro e XP.</p>
          </aside>
        )}
      </div>}
    </Dialog>
  )
}

/** Ficha do item: cabeçalho com ícone grande e nível, números em mini-cartões e a compra embaixo (bottom sheet no celular). */
function ItemSheet({ item, me, qty, setQty, busy, onBuy, onClose }: {
  item: ShopItem; me: Me; qty: number; setQty: (n: number) => void; busy: boolean; onBuy: () => void; onClose: () => void
}) {
  const [hint, setHint] = useState<string | null>(null)
  const single = item.id.startsWith('cao:') || item.id.startsWith('bicho:') // bicho não repete
  const max = Math.max(1, Math.min(99, Math.floor(me.gold / item.gold)))
  const n = single ? 1 : qty
  const total = item.gold * n
  const short = me.gold < total
  const seed = item.seedId ? SEED_BY_ID[item.seedId] : undefined
  const dog = single ? DOG_BREEDS[item.id.slice(4)] : undefined
  const sub = seed ? (seed.flower ? 'Flor · vira presente' : `Semente · ${seedSheet(seed).seasons > 1 ? `${seedSheet(seed).seasons} safras` : '1 safra'}`)
    : dog ? (dog.guard ? 'Guarda no lugar do cachorro' : 'Cachorro de guarda') : item.desc

  return (
    <>
      <button type="button" className="sheet-scrim" aria-label="Fechar ficha" onClick={onClose} />
      <aside className="item-sheet" aria-label={`Ficha: ${item.name}`}>
        <DialogHeader big icon={shopIcon(item, 60)} title={item.name}
          badge={<Badge tone={me.level >= item.minLevel ? 'green' : 'red'}>Nível {item.minLevel}</Badge>}
          subtitle={sub} onClose={onClose} closeLabel="Fechar ficha" />
        {seed ? <SeedFacts seedId={seed.id} onHint={setHint} />
          : dog ? <DogFacts breed={dog.id} onHint={setHint} />
          : null}
        {(seed || dog) && <p className="stat-hint" aria-live="polite">{hint ?? 'Toque num número para ver o detalhe.'}</p>}
        {seed?.flower && (
          <p className="small center">🌸 Quem recebe ganha <b>+{seed.charm ?? 1} de popularidade</b>. Cada ponto dá +1% na venda, <b>até +{POPULARITY_CAP}%</b>.</p>
        )}
        <div className="buy-bar">
          {!single && <Stepper value={qty} max={max} onChange={setQty} />}
          {!single && <span className="buy-unit t-label">{n} × <Coin size={14} /> {fmtGold(item.gold)}</span>}
          <PrimaryButton disabled={busy || short} onClick={onBuy} title={short ? 'Ouro insuficiente' : undefined}
            aria-label={`Comprar ${n > 1 ? `${n} de ` : ''}${item.name} por ${fmtGold(total)} de ouro`}>
            {short ? `Faltam ${fmtGold(total - me.gold)} de ouro` : 'Comprar'} {!short && <span className="buy-total"><Coin /> {fmtGold(total)}</span>}
          </PrimaryButton>
        </div>
      </aside>
    </>
  )
}

/** Ficha da semente: tudo calculado do catálogo; texto curto no cartão, detalhe no hint. */
export function SeedFacts({ seedId, onHint }: { seedId: string; onHint?: (h: string | null) => void }) {
  const seed = SEED_BY_ID[seedId]
  const f = seedSheet(seed)
  const yieldTxt = fmtRange(f.yieldMin, f.yieldMax)
  return (
    <div className="stats">
      <StatChip onHint={onHint} icon="⏱" label="Amadurece" value={fmtDuration(f.growMs)} hint="Do plantio até a primeira colheita." />
      {f.regrowMs != null ? (
        <StatChip onHint={onHint} icon="🔁" label={`${f.seasons} safras`} value={`+${fmtDuration(f.regrowMs)}`}
          hint={`Depois da 1ª colheita a planta volta das folhas e dá de novo a cada ${fmtDuration(f.regrowMs)}.`} />
      ) : (
        <StatChip onHint={onHint} icon="🔁" label="Safras" value="1" hint="Colhe uma vez e o lote fica livre para plantar de novo." />
      )}
      {seed.flower ? (
        <StatChip onHint={onHint} tone="gold" icon="🌸" label="Colheita" value={f.yieldMax > 1 ? `${f.yieldMax} flores` : '1 flor'} hint={`Não vende: é presente. Quem recebe ganha +${seed.charm ?? 1} de popularidade por flor (cada ponto dá +1% na venda, até +${POPULARITY_CAP}%).`} />
      ) : (
        <>
          <StatChip onHint={onHint} icon="🧺" label="Por safra" value={`${yieldTxt} un.`} hint={`Rende de ${yieldTxt} unidades por safra (menos o que os amigos pegarem).`} />
          <StatChip onHint={onHint} icon={<Coin size={22} />} label="Venda" value={`${fmtGold(f.sellPrice)}/un.`} hint={`Cada unidade vale ${fmtGold(f.sellPrice)} de ouro no Depósito, mais o bônus de popularidade.`} />
          <StatChip onHint={onHint} icon="💰" label="Renda" value={fmtGold(f.income)}
            hint={`renda: ${fmtGold(f.income)} de ouro${f.incomeMin !== f.incomeMax ? ` em média (${fmtRange(f.incomeMin, f.incomeMax, fmtGold)})` : ''}${f.seasons > 1 ? ` somando as ${f.seasons} safras` : ''}, antes do bônus de popularidade.`} />
          <StatChip onHint={onHint} tone="green" icon="📈" label="Lucro" value={`~${fmtGold(f.profit)}`}
            hint={`Renda de ${fmtRange(f.incomeMin, f.incomeMax, fmtGold)} de ouro${f.seasons > 1 ? ` nas ${f.seasons} safras` : ''}, menos ${fmtGold(seed.cost)} da semente.`} />
        </>
      )}
      <StatChip onHint={onHint} tone="gold" icon="⭐" label="XP" value={`+${f.xp}`}
        hint={`+${f.xp} de experiência por colheita${f.seasons > 1 ? ` (${f.xpTotal} no total)` : ''}.`} />
    </div>
  )
}

function DogFacts({ breed, onHint }: { breed: string; onHint: (h: string | null) => void }) {
  const b = DOG_BREEDS[breed]
  return (
    <div className="stats">
      <StatChip onHint={onHint} tone="red" icon="🦷" label="Morde" value={`${Math.round(b.bite * 100)}%`} hint={`Chance de morder quem tenta pegar da sua horta (só de barriga cheia).`} />
      <StatChip onHint={onHint} icon={<Coin size={22} />} label="Multa" value={`${Math.round(b.finePct * 100)}%`} hint={`O ladrão mordido paga ${Math.round(b.finePct * 100)}% do ouro dele, até ${b.fineMax}.`} />
      <StatChip onHint={onHint} icon="📅" label="Fica" value={b.days ? `${b.days} dias` : 'Sempre'} hint={b.days ? `Vai embora depois de ${b.days} dias.` : 'Não vai embora nunca.'} />
      <StatChip onHint={onHint} icon="🦴" label="Ração" value="24 h" hint={`Chega de pote cheio. Cada ração (${FOOD_PRICE} de ouro) dura 24 h; sem ração ele dorme.`} />
    </div>
  )
}

// ---------- Depósito: colheita para vender (com total esperado) e itens ----------

export function BarnDialog({ me, inventory, decor, isOwn, busy, act, onDecorEdit, at, onClose }: {
  me: Me; inventory: FarmPayload['inventory']; decor: FarmPayload['myDecor']; isOwn: boolean; busy: boolean; act: Act
  onDecorEdit: (itemId?: string) => void; at?: 'decoracao'; onClose: () => void
}) {
  const [tab, setTab] = useState<'colheita' | 'itens' | 'decoracao'>(at ?? 'colheita')
  // Colheita e produtos dos bichos (ovo, leite, lã…) vendem; o resto é item.
  const crops = inventory.filter((i) => sellPriceOf(i.itemId) > 0)
  const items = inventory.filter((i) => !SEED_BY_ID[i.itemId] && !(sellPriceOf(i.itemId) > 0))
  const price = (i: { itemId: string; qty: number }) => salePrice(sellPriceOf(i.itemId), i.qty, me.popularity)
  const total = crops.reduce((s, i) => s + price(i), 0)
  const bonus = Math.min(POPULARITY_CAP, me.popularity)
  const count = crops.reduce((s, i) => s + i.qty, 0)
  const base = crops.reduce((s, i) => s + salePrice(sellPriceOf(i.itemId), i.qty, 0), 0)
  // "Vender tudo" pede confirmação e mostra o resultado com o bônus à parte.
  const [confirm, setConfirm] = useState(false)
  const [sale, setSale] = useState<SaleView | null>(null)
  const coin = (n: number, size = 18) => <><Icon name="coin" emoji="🪙" size={size} /> {fmtGold(n)}</>

  return (
    <Dialog title="Depósito" icon={<Icon name="barn" emoji="🧺" size={36} />} onClose={onClose} wide
      tabs={[{ id: 'colheita', name: 'Colheita' }, { id: 'itens', name: 'Sementes e itens' }, { id: 'decoracao', name: 'Minha decoração' }]} tab={tab} onTab={setTab}
      footer={tab === 'colheita' && !sale && !confirm ? (
        <>
          <span className="wallet">
            <span className="t-label">Total esperado</span> <Coin size={22} /> <b className="t-num">{fmtGold(total)}</b>
            {bonus ? <Badge tone="gold" title="Bônus de popularidade na venda">+{bonus}%</Badge> : null}
          </span>
          <PrimaryButton disabled={busy || !crops.length} onClick={() => setConfirm(true)}>Vender tudo</PrimaryButton>
        </>
      ) : undefined}>
      {tab === 'colheita' && sale && (
        <div className="sale-result" role="status">
          <p className="center big">Vendido!</p>
          <ul className="sale-lines">
            {sale.lines.map((l) => (
              <li key={l.itemId}><Icon {...itemIcon(l.itemId)} size={28} /><span>{l.qty} × {itemName(l.itemId)}</span><b>{coin(l.gold, 16)}</b></li>
            ))}
          </ul>
          <dl className="sale-sum">
            <dt>Itens vendidos</dt><dd>{sale.count}</dd>
            <dt>Ouro da venda</dt><dd>{coin(sale.base)}</dd>
            <dt>Bônus de popularidade{sale.pct ? ` (+${sale.pct}%)` : ''}</dt><dd>{sale.bonus ? <>+{coin(sale.bonus)}</> : '—'}</dd>
            <dt className="total">Total recebido</dt><dd className="total">{coin(sale.gold, 22)}</dd>
          </dl>
          {sale.bonus > 0 && <p className="small center">{sale.bonus} moedas como um prêmio por sua popularidade!</p>}
          {!sale.pct && <p className="muted small center">Flores dos amigos dão popularidade: cada ponto rende +1% na venda (até {POPULARITY_CAP}%).</p>}
          <div className="center"><PrimaryButton onClick={() => setSale(null)}>OK</PrimaryButton></div>
        </div>
      )}
      {tab === 'colheita' && !sale && confirm && (
        <Card tone="gold" className="sale-confirm" role="alertdialog" aria-label="Confirmar venda">
          <p className="center t-title">Vender tudo?</p>
          <p className="center">{count} {count === 1 ? 'item' : 'itens'} por {coin(base)}{bonus ? <> + {coin(total - base)} de bônus de popularidade (+{bonus}%)</> : null}.</p>
          <p className="center"><span className="t-label">Total</span> <b className="t-num big-num">{coin(total, 26)}</b></p>
          <div className="center row">
            <PrimaryButton disabled={busy || !crops.length}
              onClick={async () => { const r = await act({ type: 'sell_all' }); setConfirm(false); if (r?.sale) setSale(r.sale) }}>Vender</PrimaryButton>
            <button className="btn" onClick={() => setConfirm(false)}>Cancelar</button>
          </div>
        </Card>
      )}
      {tab === 'colheita' && !sale && !confirm && (
        <>
          {!crops.length && <Empty icon="🧺" text="Depósito vazio. Que tal plantar?" />}
          <div className="grid sell-grid">
            {crops.map((i) => (
              <div key={i.itemId} className="cell static">
                <Icon {...itemIcon(i.itemId)} size={64} />
                <em className="qty">{i.qty}</em>
                <b className="cell-name">{itemName(i.itemId)}</b>
                <span className="t-label"><Coin size={14} /> {fmtGold(sellPriceOf(i.itemId))} cada</span>
                <button className="btn small cell-btn" disabled={busy} aria-label={`Vender ${i.qty} ${itemName(i.itemId)} por ${fmtGold(price(i))} de ouro`}
                  onClick={() => act({ type: 'sell', itemId: i.itemId })}>Vender <Coin size={16} /> {fmtGold(price(i))}</button>
              </div>
            ))}
          </div>
        </>
      )}
      {tab === 'decoracao' && <MyDecorPanel decor={decor} isOwn={isOwn} busy={busy} act={act} onEdit={onDecorEdit} />}
      {tab === 'itens' && (
        <>
          {!items.length && <Empty icon="📦" text="Nenhum item. Sementes e adubo vêm da loja." />}
          <div className="grid">
            {items.map((i) => (
              <div key={i.itemId} className="cell static">
                <Icon {...itemIcon(i.itemId)} size={64} />
                <em className="qty">{i.qty}</em>
                <b className="cell-name">{itemName(i.itemId)}</b>
                {i.itemId.startsWith('flor:') && (
                  <button className="btn small cell-btn" disabled={busy} title="Dê a um amigo na tela Amigos, ou fique com ela"
                    onClick={() => act({ type: 'give_flower', to: me.handle, seedId: i.itemId.slice(5) })}>Ficar com ela (+{SEED_BY_ID[i.itemId.slice(5)]?.charm ?? 1})</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Dialog>
  )
}

// ---------- Missões do dia ----------

export function MissionsDialog({ missions, busy, act, onShare, onClose }: {
  missions: FarmPayload['missions']; busy: boolean; act: Act; onShare: (text: string) => void; onClose: () => void
}) {
  return (
    <Dialog title="Missões do dia" icon={<Icon name="mission" emoji="📋" size={36} />} onClose={onClose}>
      <ul className="missions">
        {missions.map((m) => {
          const ready = !m.claimed && m.progress >= m.target
          return (
            <li key={m.slot} className={`${m.claimed ? 'done' : ''} ${ready ? 'ready' : ''}`}>
              <div>
                <b>{m.text}</b>
                <span className="m-progress">
                  <span className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={m.target} aria-valuenow={m.progress} aria-label={m.text}>
                    <i style={{ width: `${Math.min(100, (m.progress / m.target) * 100)}%` }} />
                  </span>
                  <span className="t-label">{m.progress}/{m.target}</span>
                </span>
                <span className="m-reward">
                  <span className="t-label">Prêmio</span>
                  <Badge tone="plain"><Coin size={14} /> {m.gold}</Badge>
                  <Badge tone="plain">⭐ {m.xp} XP</Badge>
                </span>
              </div>
              {m.claimed ? <span className="ok" role="img" aria-label="Recebida">✓</span> : ready && (
                <span className="claim">
                  <PrimaryButton disabled={busy} onClick={() => act({ type: 'claim', slot: m.slot })}>Receber</PrimaryButton>
                  <button className="btn small" disabled={busy}
                    onClick={async () => { if (await act({ type: 'claim', slot: m.slot })) onShare(`Missão cumprida no ${GAME_NAME_SHORT}: “${m.text}”, +${m.gold} de ouro! 🌽`) }}>
                    Receber e compartilhar
                  </button>
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <p className="muted small">Novas missões à meia-noite (horário de Brasília).</p>
    </Dialog>
  )
}

/** Estado vazio: ícone grande e uma frase (em vez de uma linha cinza solta). */
export function Empty({ icon, text }: { icon: string; text: string }) {
  return <div className="empty"><span className="empty-ic" aria-hidden>{icon}</span><p>{text}</p></div>
}

// ---------- Avisos curtos ----------

/** Level-up: "Parabéns, você subiu de nível para N." e o convite a compartilhar
 *  ("Quem ver vai ganhar 100EXP"). O que foi liberado na loja é um extra. */
export function LevelUpDialog({ level, onClose, onShare }: { level: number; onClose: () => void; onShare?: () => void }) {
  const unlocked = SEEDS.filter((s) => s.minLevel === level && !s.event)
  const shop = SHOP.filter((i) => !i.seedId && !i.event && i.minLevel === level)
  return (
    <Dialog title={`Nível atual: ${level}`} icon={<Icon name="level_badge" emoji="⭐" size={40} />} onClose={onClose} className="level-up">
      <div className="center"><ArtSeal src="/art/ui/levelup_selo.png" className="lv-seal" label={`Nível ${level}`}>{level}</ArtSeal></div>
      <p className="center big">Parabéns, você subiu de nível para <b className="lv-num">{level}</b>.</p>
      {(unlocked.length > 0 || shop.length > 0) && (
        <>
          <p className="center">Liberado na loja:</p>
          <div className="grid compact">
            {unlocked.map((s) => <div key={s.id} className="cell static"><Icon name={`crop:${s.id}`} emoji="🌱" size={56} /><b>{s.name}</b><small>{fmtMinutes(s.growMinutes)}</small></div>)}
            {shop.map((i) => <div key={i.id} className="cell static">{shopIcon(i)}<b>{i.name}</b></div>)}
          </div>
        </>
      )}
      {onShare && <p className="center">Compartilhe o seu feito com seus amigos. Quem vir vai ganhar <b>{SHARE_XP.xp} EXP</b>.</p>}
      <div className="center row">
        {onShare && <button className="btn green share-mega" onClick={() => { onShare(); onClose() }}><Icon name="levelup_megafone" emoji="📣" size={30} /> Compartilhar</button>}
        <button className="btn" onClick={onClose}>Fechar</button>
      </div>
    </Dialog>
  )
}

export function DailyBonusDialog({ bonus, onShare, onClose }: {
  bonus: { streak: number; gold: number; seedId: string; bones?: number; event?: string }; onShare: (text: string) => void; onClose: () => void
}) {
  const day = Math.min(bonus.streak, LOGIN_BONUS.length)
  const seed = SEED_BY_ID[bonus.seedId]
  return (
    <Dialog title="Bônus do dia" icon={<Icon name="gift_daily" emoji="🎁" size={36} />} onClose={onClose}>
      <ol className="streak">
        {LOGIN_BONUS.map((g, i) => (
          <li key={i} className={i + 1 < day ? 'past' : i + 1 === day ? 'today' : ''}>
            <small>Dia {i + 1}</small>
            <Icon name="coin" emoji="🪙" size={28} />
            <b>{g}</b>
          </li>
        ))}
      </ol>
      <Card tone="gold" className="bonus-prize">
        <span className="t-label">Hoje você ganhou</span>
        <span className="bonus-items">
          <span className="bonus-item"><Coin size={40} /><b className="t-num">{bonus.gold} de ouro</b></span>
          {seed && <span className="bonus-item"><Icon name={`crop:${seed.id}`} emoji="🌱" size={44} /><span className="bonus-seed"><b className="t-num">1 semente de {seed.name}</b>{bonus.event && <small className="muted">do evento {bonus.event}</small>}</span></span>}
          {bonus.bones ? <span className="bonus-item"><span aria-hidden style={{ fontSize: 34 }}>🦴</span><b className="t-num">{bonus.bones} osso para o cachorro</b></span> : null}
        </span>
        <small className="muted">A semente grátis muda todo dia{bonus.event ? ' e, durante o evento, é do evento' : ''}. Volte amanhã para ganhar mais!</small>
      </Card>
      <div className="center row">
        <PrimaryButton onClick={onClose}>Pegar</PrimaryButton>
        <button className="btn" onClick={() => { onShare(`Bônus do dia no ${GAME_NAME_SHORT}${bonus.streak > 1 ? ` (${bonus.streak} dias seguidos)` : ''}: ganhei ${bonus.gold} de ouro${seed ? ` e uma semente de ${seed.name}` : ''} 🎁`); onClose() }}>
          Pegar e compartilhar
        </button>
      </div>
    </Dialog>
  )
}

export function ExpandDialog({ me, land, busy, act, onClose }: { me: Me; land: FarmPayload['land']; busy: boolean; act: Act; onClose: () => void }) {
  const next = land.next
  return (
    <Dialog title="Terreno à venda" icon={<Icon name="land_sign" emoji="🪧" size={36} />} onClose={onClose}>
      {!next ? <p className="center">Sua fazenda já está no tamanho máximo ({land.max} lotes).</p> : (
        <>
          <p className="center">Lote {land.count + 1} de {land.max}. Mais terra, mais colheita (e mais coisa para os amigos pegarem!).</p>
          <div className="stats two">
            <StatChip icon={<Coin size={22} />} label="Preço" value={next.gold} />
            <StatChip icon="⭐" label="Nível mínimo" value={next.minLevel} tone={me.level >= next.minLevel ? 'green' : 'red'} />
          </div>
          <div className="center" style={{ marginTop: 12 }}>
            <button className="btn green primary" disabled={busy || me.level < next.minLevel || me.gold < next.gold}
              onClick={async () => { if (await act({ type: 'expand' })) onClose() }}>
              {me.level < next.minLevel ? `Precisa do nível ${next.minLevel}` : me.gold < next.gold ? 'Ouro insuficiente' : 'Comprar terreno'}
            </button>
          </div>
        </>
      )}
    </Dialog>
  )
}

const fmtLeft = (ms: number) => {
  if (ms <= 0) return 'acabou'
  const h = Math.floor(ms / 3600_000), m = Math.floor((ms % 3600_000) / 60_000)
  return h >= 48 ? `${Math.floor(h / 24)} dias` : h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
}

export function DogDialog({ me, owner, isOwn, food, bones = 0, now, busy, act, onShop, onClose, wear = [], inventory = [] }: {
  me: Me; owner: FarmPayload['owner']; isOwn: boolean; food: number; bones?: number; now: number; busy: boolean; act: Act; onShop: () => void; onClose: () => void
  wear?: string[]; inventory?: FarmPayload['inventory']
}) {
  const dog = isOwn ? me.dog : owner.dog
  const fedLeft = (dog?.fedUntil ?? 0) - now
  return (
    <Dialog title={!dog ? (isOwn ? 'Seu cachorro' : `Cachorro de ${owner.handle}`) : isOwn ? `Seu ${dog.name}` : `${dog.name} de ${owner.handle}`}
      icon={<Icon name={dog ? dogIcon(dog.kind) : 'dog_food'} emoji="🐶" size={40} />} onClose={onClose}>
      {!dog ? (
        <>
          <Empty icon="🐾" text={isOwn ? 'Você ainda não tem cachorro: tem Vira-lata, Salsicha e Pastor na aba Animais da loja.' : 'Essa fazenda não tem cachorro. Pode pegar à vontade… 😏'} />
          {isOwn && <div className="center"><PrimaryButton onClick={onShop}>Ver cachorros na loja</PrimaryButton></div>}
        </>
      ) : (
        <>
          <Card tone={dog.awake ? (isOwn ? 'green' : 'red') : 'gold'} className={`dog-state ${dog.awake ? 'awake' : ''}`}>
            <span className="dog-state-ic" aria-hidden>{dog.awake ? '🐕' : '💤'}</span>
            <span><b>{dog.awake ? 'Acordado e de olho' : 'Dormindo'}</b><small>{dog.awake ? 'Morde quem tentar pegar da horta.' : 'Sem ração ele dorme e não morde.'}</small></span>
          </Card>
          <div className="stats dog-facts">
            <StatChip icon="🦷" label="Chance de morder" value={`${Math.round(dog.bite * 100)}%`} hint={isOwn ? undefined : 'De costas para o lote, quase não morde'} />
            <StatChip icon={<Coin size={22} />} label="Multa do ladrão" value={`${Math.round(dog.finePct * 100)}% · até ${dog.fineMax}`} hint="Parte do ouro de quem for mordido" />
            <StatChip icon="🦴" label="Ração" value={fmtLeft(fedLeft)} tone={fedLeft < 6 * 3600_000 ? 'red' : 'plain'} />
            <StatChip icon="📅" label="Prazo" value={dog.expiresAt ? fmtLeft(dog.expiresAt - now) : 'Para sempre'} hint={dog.expiresAt ? 'Depois disso ele vai embora' : undefined} />
            <StatChip icon="⭐" label="Nível" value={String(dog.level)} hint="Sobe com ossos: mais mordida e multa maior" />
          </div>
          {/* Nível por ossos. Ossos só se ganham jogando. */}
          {dog.next ? (
            <div className="bones" aria-label={`Faltam ${dog.next.missing} ossos para o nível ${dog.next.level}`}>
              <div className="bar"><i style={{ width: `${(100 * dog.next.have) / dog.next.need}%` }} /></div>
              <small>🦴 Faltam {dog.next.missing} ossos para o nível {dog.next.level}{isOwn ? ' · ganhe no bônus diário, nas missões e ajudando amigos' : ''}</small>
            </div>
          ) : <p className="center small">🦴 Nível máximo</p>}
          {!isOwn && <p className="center small muted">Dica: quando ele vira de costas para o lote, é a hora de pegar.</p>}
          {isOwn && <Wardrobe animal="dog" kind="dog" wear={wear} inventory={inventory} busy={busy} act={act} />}
          {isOwn && (
            <div className="center row">
              {/* Sem ração no depósito, o botão compra e dá num toque. */}
              {food > 0 ? (
                <PrimaryButton disabled={busy} onClick={() => act({ type: 'feed_dog' })}>Dar ração ({food})</PrimaryButton>
              ) : (
                <PrimaryButton disabled={busy || me.gold < FOOD_PRICE} title={me.gold < FOOD_PRICE ? 'Ouro insuficiente' : undefined}
                  onClick={() => act({ type: 'feed_dog', buy: true })}>Alimentar · <Coin size={16} /> {FOOD_PRICE}</PrimaryButton>
              )}
              {bones > 0 && dog.next && <button className="btn green" disabled={busy} onClick={() => act({ type: 'give_bone' })}>Dar ossos ({bones})</button>}
              <button className="btn" onClick={onShop}>Loja (ração e raças)</button>
            </div>
          )}
        </>
      )}
    </Dialog>
  )
}

// ---------- Amigos da Fazenda: ranking (Experiência / Dinheiro / Popularidade), busca, convite e presente ----------

type RankTab = 'xp' | 'ouro' | 'pop'
type Ranked = { xp: number; gold: number; popularity: number; level: number }
const RANK: Record<RankTab, { cmp: (a: Ranked, b: Ranked) => number; label: (n: Ranked) => string }> = {
  xp: { cmp: (a, b) => b.xp - a.xp || b.gold - a.gold, label: (n) => `${n.xp} XP` },
  ouro: { cmp: (a, b) => b.gold - a.gold || b.xp - a.xp, label: (n) => `🪙 ${fmtGold(n.gold)}` },
  pop: { cmp: (a, b) => b.popularity - a.popularity || b.xp - a.xp, label: (n) => `♥ ${n.popularity}` },
}
const RANK_TABS: { id: RankTab; name: string }[] = [{ id: 'xp', name: 'Experiência' }, { id: 'ouro', name: 'Dinheiro' }, { id: 'pop', name: 'Popularidade' }]

export function FriendsDialog({ me, neighbors, inventory, busy, act, onGift, onClose }: {
  me: Me; neighbors: FarmPayload['neighbors']; inventory: FarmPayload['inventory']; busy: boolean; act: Act
  onGift: (handle: string) => void; onClose: () => void
}) {
  const flowers = inventory.filter((i) => i.itemId.startsWith('flor:'))
  const [tab, setTab] = useState<RankTab>('xp')
  const [find, setFind] = useState('')
  const [add, setAdd] = useState('')
  const [copied, setCopied] = useState(false)
  const friends = neighbors.filter((n) => n.friend)
  const others = neighbors.filter((n) => !n.friend)
  const self = { handle: me.handle, avatar: me.avatar, level: me.level, xp: me.xp, gold: me.gold, popularity: me.popularity, isBot: false, friend: true, online: true, ripe: 0, needsHelp: 0, giftSent: true }
  // Posição calculada na lista inteira; a busca só filtra o que aparece.
  const ranked = [...friends, self].sort(RANK[tab].cmp).map((n, i) => ({ ...n, pos: i + 1 }))
  const q = find.trim().toLowerCase()
  const shown = q ? ranked.filter((n) => n.handle.includes(q)) : ranked
  const link = typeof window !== 'undefined' && me.inviteCode ? `${window.location.origin}/c/${me.inviteCode}` : ''
  const shareText = `Bora jogar ${GAME_NAME_SHORT} comigo? Planta, colhe e (com jeitinho) pega da minha horta 😄 ${link}`

  return (
    <Dialog title="Amigos" icon={<Icon name="friends" emoji="👥" size={36} />} onClose={onClose} wide
      tabs={RANK_TABS} tab={tab} onTab={setTab}>
      <Card tone="green" className="invite">
        <Icon name="invite" emoji="💌" size={44} />
        <div className="invite-text">
          <b>Chame os amigos: cada um que entrar pelo seu link dá +{INVITE.gold} de ouro para os dois.</b>
          <small>O primeiro amigo convidado ainda traz um Vira-lata para guardar sua horta.</small>
        </div>
        <div className="row">
          <a className="btn green small" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer" onClick={() => noteShare('amigos')}>WhatsApp</a>
          <button className="btn small" disabled={!link} onClick={async () => { noteShare('amigos'); await navigator.clipboard.writeText(link); setCopied(true) }}>
            {copied ? 'Copiado!' : 'Copiar link'}
          </button>
        </div>
      </Card>

      <div className="friend-find">
        <input type="search" placeholder="Buscar amigo pelo nome" aria-label="Buscar amigo pelo nome" value={find}
          onChange={(e) => setFind(e.target.value)} maxLength={20} />
      </div>
      {shown.length === 0 && <Empty icon="🔎" text={`Nenhum amigo com “${find}”.`} />}
      <ol className="ranking">
        {shown.map((n) => (
          <li key={n.handle} className={n.handle === me.handle ? 'me' : ''}>
            {n.pos <= 3
              ? <ArtSeal src={`/art/ui/rank_${n.pos}.png`} className={`pos p${n.pos}`} label={`${n.pos}º lugar`}>{n.pos}</ArtSeal>
              : <span className="pos">{n.pos}</span>}
            <span className="nb-av small"><Avatar id={n.avatar} handle={n.handle} />{n.online && <b className="online" title="Online agora" />}</span>
            <span className="rk-name">
              <b>{n.handle}</b>
              <small>{RANK[tab].label(n)} · Nv {n.level}{n.isBot ? ' · vizinha' : ''}</small>
            </span>
            <span className="rk-flags">
              {n.ripe > 0 && <span title="Tem coisa madura" aria-label={`${n.ripe} lotes maduros`}>✋ {n.ripe}</span>}
              {n.needsHelp > 0 && <span title="Precisa de ajuda (praga, erva ou seca)" aria-label={`${n.needsHelp} lotes precisando de ajuda`}>🆘 {n.needsHelp}</span>}
            </span>
            {n.handle !== me.handle && (
              <span className="row">
                <a className="btn small" href={`/fazenda/${n.handle}`}>Visitar</a>
                <button className="btn small icon-btn" disabled={busy || n.giftSent} title={n.giftSent ? 'Já mandou presente hoje' : 'Presente grátis do dia'}
                  aria-label={n.giftSent ? `Já mandou presente para ${n.handle} hoje` : `Mandar presente para ${n.handle}`} onClick={() => onGift(n.handle)}>🎁</button>
                {flowers.length > 0 && (
                  <button className="btn small icon-btn" disabled={busy} title={`Dar uma flor: +${SEED_BY_ID[flowers[0].itemId.slice(5)]?.charm ?? 1} de popularidade (+1% na venda por ponto, até +${POPULARITY_CAP}%)`} aria-label={`Dar uma flor para ${n.handle} (você tem ${flowers[0].qty})`}
                    onClick={() => act({ type: 'give_flower', to: n.handle, seedId: flowers[0].itemId.slice(5) })}>🌻 {flowers[0].qty}</button>
                )}
              </span>
            )}
          </li>
        ))}
      </ol>

      <form className="add-friend" onSubmit={async (e) => { e.preventDefault(); if (await act({ type: 'add_friend', handle: add })) setAdd('') }}>
        <input placeholder="apelido do amigo" aria-label="Apelido do amigo para adicionar" value={add} onChange={(e) => setAdd(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} maxLength={20} />
        <button className="btn small" disabled={busy || add.length < 3}>Adicionar</button>
      </form>
      {others.length > 0 && (
        <p className="muted small">Também jogando: {others.slice(0, 8).map((o) => (
          <button key={o.handle} className="linkish" onClick={() => setAdd(o.handle)}>{o.handle}</button>
        ))}</p>
      )}
    </Dialog>
  )
}

// ---------- Presentes: abas Enviar e Recebidos ----------

type GiftTab = 'enviar' | 'recebidos'
const GIFT_TABS: { id: GiftTab; name: string }[] = [{ id: 'enviar', name: 'Enviar' }, { id: 'recebidos', name: 'Recebidos' }]

const fmtWhen = (at: number, now: number) => {
  const min = Math.floor((now - at) / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  return h < 24 ? `há ${h} h` : h < 48 ? 'ontem' : `há ${Math.floor(h / 24)} dias`
}

export function GiftsDialog({ me, neighbors, gifts, now, busy, act, to, onClose }: {
  me: Me; neighbors: FarmPayload['neighbors']; gifts: FarmPayload['gifts']; now: number; busy: boolean; act: Act
  to?: string // amigo já escolhido (veio do 🎁 na janela Amigos)
  onClose: () => void
}) {
  const unthanked = gifts.filter((g) => !g.thanked && g.from).length
  const [tab, setTab] = useState<GiftTab>(!to && unthanked ? 'recebidos' : 'enviar')
  const giftSeeds = GIFT_SEEDS.map((id) => SEED_BY_ID[id]).filter((s) => s.minLevel <= me.level)
  const [seedId, setSeedId] = useState(giftSeeds[0]?.id)
  const friends = neighbors.filter((n) => n.friend)
  // O amigo que veio da janela Amigos aparece primeiro.
  const list = to ? [...friends.filter((n) => n.handle === to), ...friends.filter((n) => n.handle !== to)] : friends
  const tabs = GIFT_TABS.map((t) => (t.id === 'recebidos' && unthanked ? { ...t, name: `Recebidos (${unthanked})` } : t))

  return (
    <Dialog title="Presentes" icon={<Icon name="gift_daily" emoji="🎁" size={36} />} onClose={onClose} wide tabs={tabs} tab={tab} onTab={setTab}>
      {tab === 'enviar' && (
        <>
          <p className="muted center">Uma semente grátis por amigo, todo dia. Escolha a semente e mande:</p>
          <HScroll className="gift-seeds" role="radiogroup" label="Semente do presente">
            {giftSeeds.map((s) => (
              <button key={s.id} role="radio" aria-checked={s.id === seedId} className={`cell ${s.id === seedId ? 'on' : ''}`} onClick={() => setSeedId(s.id)}>
                <Icon name={`crop:${s.id}`} emoji="🌱" size={44} />
                <b>{s.name}</b>
              </button>
            ))}
          </HScroll>
          {friends.length === 0 && <Empty icon="👥" text="Nenhum amigo ainda. Chame alguém pela janela Amigos!" />}
          <ul className="gift-list">
            {list.map((n) => (
              <li key={n.handle} className={n.handle === to ? 'on' : ''}>
                <span className="nb-av small"><Avatar id={n.avatar} handle={n.handle} />{n.online && <b className="online" title="Online agora" />}</span>
                <span className="rk-name"><b title={n.handle}>{n.handle}</b><small>Nv {n.level}{n.isBot ? ' · vizinha' : ''}</small></span>
                {n.giftSent ? <span className="ok small">Enviado hoje ✓</span> : (
                  <button className="btn green small" disabled={busy || !seedId} onClick={() => act({ type: 'gift', to: n.handle, seedId })}>
                    Enviar {seedId ? SEED_BY_ID[seedId].name : ''}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {tab === 'recebidos' && (
        <>
          {gifts.length === 0 && <Empty icon="🎁" text="Nenhum presente nos últimos 7 dias. Mande um primeiro: quem recebe costuma retribuir!" />}
          <ul className="gift-list">
            {gifts.map((g) => {
              const seed = SEED_BY_ID[g.seedId]
              return (
                <li key={g.id}>
                  <Icon name={`crop:${g.seedId}`} emoji="🌱" size={36} />
                  <span className="rk-name">
                    <b>{g.from ?? 'Alguém'} te mandou 1 semente de {seed?.name ?? g.seedId}</b>
                    <small>{fmtWhen(g.at, now)} · já está no Depósito</small>
                  </span>
                  {g.thanked ? <span className="ok small">Agradecido ✓</span> : (
                    <button className="btn green small" disabled={busy || !g.from} title={g.from ? `Aparece no Mural de ${g.from}` : undefined}
                      onClick={() => act({ type: 'thank', eventId: g.id })}>Agradecer</button>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Dialog>
  )
}

// ---------- "Você não tem semente de X. Quer comprar?" (no lugar do toast de erro) ----------

export function NoSeedDialog({ seedId, onShop, onClose }: { seedId: string; onShop: () => void; onClose: () => void }) {
  const seed = SEED_BY_ID[seedId]
  return (
    <Dialog title="Sem semente" icon={<Icon name="shop" emoji="🏪" size={36} />} onClose={onClose}>
      <p className="center"><Icon name={`crop:${seedId}`} emoji="🌱" size={56} /></p>
      <p className="center big">Você não tem semente de {seed?.name ?? seedId}. Quer comprar?</p>
      <div className="center row">
        <PrimaryButton onClick={onShop}>Comprar na loja</PrimaryButton>
        <button className="btn" onClick={onClose}>Agora não</button>
      </div>
    </Dialog>
  )
}

// ---------- Acessórios (lote O): vestir e tirar, só estética ----------

function Wardrobe({ animal, kind, wear, inventory, busy, act }: {
  animal: string; kind: string; wear: string[]; inventory: FarmPayload['inventory']; busy: boolean; act: Act
}) {
  const fits = ACCESSORIES.filter((a) => a.animal === kind)
  if (!fits.length) return null
  const have = (id: string) => inventory.find((i) => i.itemId === accItem(id))?.qty ?? 0
  const shown = fits.filter((a) => wear.includes(a.id) || have(a.id) > 0)
  return (
    <div className="wardrobe">
      <b>Enfeites</b>
      {!shown.length && <small className="muted">Compre na loja, aba Animais: {fits.map((a) => a.name.toLowerCase()).join(', ')}.</small>}
      <div className="row">
        {shown.map((a) => {
          const on = wear.includes(a.id)
          return (
            <button key={a.id} className={`btn small ${on ? 'green' : ''}`} disabled={busy} aria-pressed={on}
              onClick={() => act({ type: 'wear', animal, acc: a.id, on: !on })}>{on ? `Tirar ${a.name.toLowerCase()}` : `Vestir ${a.name.toLowerCase()}`}</button>
          )
        })}
      </div>
    </div>
  )
}

// ---------- Ficha do bicho (balão do bicho, com ações do dono) ----------

export function AnimalDialog({ a, isOwn, owner, wear, inventory, busy, act, onShop, onClose }: {
  a: AnimalView; isOwn: boolean; owner: string; wear: string[]; inventory: FarmPayload['inventory']; busy: boolean; act: Act; onShop: () => void; onClose: () => void
}) {
  const l = LIVESTOCK[a.kind]
  const feed = FEEDS[l.feed]
  const feedQty = inventory.find((i) => i.itemId === l.feed)?.qty ?? 0
  const status = a.ready
    ? a.meat ? `plantado ${a.produced}, ainda restam ${a.left}` : `produzido ${a.produced}, restam ${a.left}`
    : a.nextStageMs != null ? `status do crescimento: ${fmtHM(a.nextStageMs)} para Estágio ${a.stage + 1}` : `Resultado depois de ${fmtHM(a.cycleLeftMs ?? 0)}`
  const age = a.look === 'baby' ? 'filhote' : a.look === 'teen' ? 'jovem' : 'adulto'
  const [ask, setAsk] = useState(false)
  if (ask) return <MeatConfirmDialog name={l.name} busy={busy} onConfirm={async () => { await act({ type: 'collect_animal', slot: a.slot }); onClose() }} onClose={() => setAsk(false)} />
  return (
    <Dialog title={isOwn ? `${l.name} (${age})` : `${l.name} de ${owner}`} icon={<Icon name={`anim:${a.kind}${a.look === 'adult' ? '' : `_${a.look}`}`} emoji="🐾" size={44} />} onClose={onClose}>
      <Card tone={a.hungry ? 'red' : a.ready ? 'green' : 'gold'} className="dog-state">
        <span className="dog-state-ic" aria-hidden>{a.hungry ? '😣' : a.ready ? '✋' : '⏳'}</span>
        <span><b>{a.hungry ? 'Com fome' : a.ready ? 'Pronto para colher' : a.stage < a.stages ? 'Crescendo' : 'Produzindo'}</b><small>{a.hungry ? 'Sem comida não cresce nem produz.' : status}</small></span>
      </Card>
      <div className="stats dog-facts">
        <StatChip icon="🍽️" label="Alimento" value={`${a.food}/100`} tone={a.food < 25 ? 'red' : 'plain'} />
        <StatChip icon="📈" label="Estágio" value={`${a.stage}/${a.stages}`} />
        <StatChip icon={itemIcon(l.product).emoji} label="Produz" value={itemName(l.product)} hint={a.meat ? 'Bicho de corte: colhido, sai da fazenda' : undefined} />
        <StatChip icon={itemIcon(l.feed).emoji} label="Come" value={feed.name} />
      </div>
      {isOwn && (
        <>
          <div className="center row">
            {a.ready && <button className="btn green" disabled={busy} onClick={() => (a.meat ? setAsk(true) : act({ type: 'collect_animal', slot: a.slot }))}>Colher</button>}
            {feedQty > 0
              ? <button className="btn green" disabled={busy || a.food >= 90} onClick={() => act({ type: 'feed_animal', slot: a.slot, itemId: l.feed })}>Dar {feed.name.toLowerCase()} ({feedQty})</button>
              : <button className="btn" onClick={onShop}>Comprar {feed.name.toLowerCase()}</button>}
          </div>
          {a.look === 'adult' && <Wardrobe animal={a.slot} kind={a.kind} wear={wear} inventory={inventory} busy={busy} act={act} />}
        </>
      )}
    </Dialog>
  )
}

/** Bicho de corte (porco, burro): colhido, sai da fazenda (regra do jogo). Um toque só não basta: pede confirmação. */
export const meatQuestion = (name: string) => `Colher o ${name.toLowerCase()}? Ele vai sair da fazenda.`

export function MeatConfirmDialog({ name, busy, onConfirm, onClose }: { name: string; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog title={`Colher o ${name.toLowerCase()}`} icon={<Icon name="hand_harvest" emoji="✋" size={36} />} onClose={onClose}>
      <p className="center big">{meatQuestion(name)}</p>
      <p className="center muted small">Ele vira carne no depósito. Para criar outro, compre na loja, aba Animais.</p>
      <div className="center row">
        <PrimaryButton disabled={busy} onClick={onConfirm}>Colher</PrimaryButton>
        <button className="btn" onClick={onClose}>Agora não</button>
      </div>
    </Dialog>
  )
}
