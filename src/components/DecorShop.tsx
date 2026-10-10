'use client'
// Decoração na loja e no Depósito (frente J).
// Loja > Decoração: "Séries" (cartão com a prévia da fazenda decorada, as 5 peças com preço
// e as setas ◀ ▶) e "Enfeites" (grade de enfeites soltos e caminhos, com preço e nível).
// Depósito > Minha decoração: o que você tem, trocar a peça de cada lugar e pôr/guardar enfeites.
import { useState } from 'react'
import { DECOR } from '@/game/config'
import { fmtGold } from '@/game/catalog'
import {
  DEFAULT_SERIES, ORNAMENTS, PATHS, pieceId, piecePrice, SERIES, setPrice, SLOT_NAMES, SLOTS, type Ornament, type PathKind, type Series, type Slot,
} from '@/game/decor'
import type { FarmPayload } from '@/server/game'
import type { Act } from './Dialogs'
import { Icon } from './ui/Icon'

type Me = FarmPayload['me']
type MyDecor = FarmPayload['myDecor']

const SLOT_EMOJI: Record<Slot, string> = { fundo: '🏞️', casa: '🏠', casinha: '🛖', enfeite: '🌈', cerca: '🚧' }
const ORN_EMOJI: Record<string, string> = {
  canteiro_flores: '🌷', barris: '🛢️', placa_madeira: '🪧', caixa_correio: '📫', lampiao: '🏮', banco: '🪑', carrinho_mao: '🛒',
  espantalho: '🧑‍🌾', monte_feno: '🌾', cata_vento: '🎡', pinheiro: '🌲', arvore_frutifera: '🍎', arco_flores: '🌸', poco_manivela: '🪣',
  lago_patinhos: '🦆', moinho_pequeno: '🌬️', caminho_terra: '🟫', caminho_pedra: '⬜',
}

/** Ícone de peça/enfeite: arte do lote M (public/art/deco/...) ou emoji enquanto ela não chega. */
export function DecoIcon({ id, size = 56 }: { id: string; size?: number }) {
  const [slot, series] = id.split(':')
  const piece = series && (SLOTS as readonly string[]).includes(slot)
  // Arte do lote M: peças em deco/<série>/ (a cerca usa o trecho cerca_ne), soltos e caminhos em deco/soltos/.
  const name = piece ? `deco/${series}/${slot === 'cerca' ? 'cerca_ne' : slot}` : `deco/soltos/${id}`
  return <Icon name={name} emoji={piece ? SLOT_EMOJI[slot as Slot] : ORN_EMOJI[id] ?? '🎀'} size={size} className={piece && slot === 'fundo' ? 'cover' : undefined} />
}

const coin = (n: number, size = 16) => <><Icon name="coin" emoji="🪙" size={size} /> {fmtGold(n)}</>

type Sub = 'series' | 'enfeites'

export function DecorShop({ me, decor, event = null, busy, act, sub: startSub }: { me: Me; decor: MyDecor; event?: string | null; busy: boolean; act: Act; sub?: Sub }) {
  const [sub, setSub] = useState<Sub>(startSub ?? 'series')
  return (
    <div className="decor-shop">
      <div className="subtabs" role="tablist" aria-label="Decoração">
        <button role="tab" aria-selected={sub === 'series'} className={sub === 'series' ? 'on' : ''} onClick={() => setSub('series')}>Séries</button>
        <button role="tab" aria-selected={sub === 'enfeites'} className={sub === 'enfeites' ? 'on' : ''} onClick={() => setSub('enfeites')}>Enfeites</button>
      </div>
      {sub === 'series' ? <SeriesCard me={me} decor={decor} event={event} busy={busy} act={act} /> : <OrnamentGrid me={me} decor={decor} busy={busy} act={act} />}
    </div>
  )
}

// Onde cada etiqueta de preço fica em cima da prévia (perto da peça na cena do lote M).
const TAG_POS: Record<Slot, { left: string; top: string }> = {
  fundo: { left: '50%', top: '8%' }, casa: { left: '24%', top: '22%' }, enfeite: { left: '22%', top: '62%' },
  casinha: { left: '80%', top: '52%' }, cerca: { left: '52%', top: '88%' },
}

function SeriesCard({ me, decor, event, busy, act }: { me: Me; decor: MyDecor; event: string | null; busy: boolean; act: Act }) {
  // Série de evento (Bruxinha) só aparece na época, ou para quem já tem alguma peça dela (essa usa o ano todo).
  const list = SERIES.filter((x) => !x.event || x.event === event || SLOTS.some((k) => decor.owned[pieceId(k, x.id)]))
  // Abre na série do evento, se houver; senão, na primeira que ainda dá para comprar (a do Sítio todo mundo já tem).
  const [i, setI] = useState(() => Math.max(0, list.findIndex((x) => x.event && x.event === event), list.findIndex((x) => x.id !== DEFAULT_SERIES)))
  const s = list[Math.min(i, list.length - 1)]
  const owns = (slot: Slot) => s.id === DEFAULT_SERIES || !!decor.owned[pieceId(slot, s.id)]
  const set = setPrice(s, owns)
  const offSeason = !!s.event && s.event !== event
  const locked = me.level < s.minLevel || offSeason
  const lockText = offSeason ? 'Só no evento' : `Nível ${s.minLevel}`
  const go = (d: number) => setI((n) => (n + d + list.length) % list.length)

  return (
    <div className="series">
      <div className="series-head">
        <button className="arrow" onClick={() => go(-1)} aria-label="Série anterior">◀</button>
        <div className="series-title">
          <b>Série {s.name}</b>
          <small>{s.id === DEFAULT_SERIES ? 'A de todo fazendeiro' : offSeason ? 'Série de evento: fora da época' : locked ? `Libera no nível ${s.minLevel}` : `Nível ${s.minLevel}+`}{s.event && !offSeason ? ' · 🎃 só no evento' : ''} · {list.indexOf(s) + 1}/{list.length}</small>
        </div>
        <button className="arrow" onClick={() => go(1)} aria-label="Próxima série">▶</button>
      </div>
      <div className="series-preview" style={{ '--series': `#${s.color.toString(16).padStart(6, '0')}` } as React.CSSProperties}>
        <Preview series={s} />
        {SLOTS.map((slot) => (
          <span key={slot} className={`tag ${owns(slot) ? 'own' : ''}`} style={TAG_POS[slot]} title={s.pieces[slot]}>
            {owns(slot) ? '✓' : coin(piecePrice(s, slot), 14)}
          </span>
        ))}
      </div>
      <ul className="pieces">
        {SLOTS.map((slot) => {
          const own = owns(slot), on = decor.slots[slot] === s.id, price = piecePrice(s, slot)
          return (
            <li key={slot} className={on ? 'on' : ''}>
              <DecoIcon id={pieceId(slot, s.id)} size={40} />
              <span className="piece-name"><b>{s.pieces[slot]}</b><small>{SLOT_NAMES[slot]}</small></span>
              {on ? <span className="ok small">Na fazenda ✓</span>
                : own ? <button className="btn small" disabled={busy} onClick={() => act({ type: 'decor_equip', slot, series: s.id })}>Usar</button>
                : (
                  <button className="btn green small" disabled={busy || locked || me.gold < price}
                    title={locked ? lockText : me.gold < price ? 'Ouro insuficiente' : undefined}
                    onClick={() => act({ type: 'decor_buy', itemId: pieceId(slot, s.id) })}>{coin(price)}</button>
                )}
            </li>
          )
        })}
      </ul>
      {s.id !== DEFAULT_SERIES && (
        <div className="set-buy">
          {set.missing.length ? (
            <>
              <span className="set-price">
                Conjunto{set.missing.length < SLOTS.length ? ` (faltam ${set.missing.length})` : ''}: <b>{coin(set.gold, 20)}</b>
                {set.gold < set.full && <s className="muted">{set.full}</s>}
              </span>
              <button className="btn green" disabled={busy || locked || me.gold < set.gold}
                onClick={() => act({ type: 'decor_buy_set', series: s.id })}>
                {locked ? lockText : me.gold < set.gold ? 'Ouro insuficiente' : 'Comprar conjunto'}
              </button>
            </>
          ) : (
            <>
              <span className="ok">Você tem a série inteira ✓</span>
              {SLOTS.some((k) => decor.slots[k] !== s.id) && (
                <button className="btn" disabled={busy} onClick={async () => { for (const slot of SLOTS) if (decor.slots[slot] !== s.id) await act({ type: 'decor_equip', slot, series: s.id }) }}>
                  Usar tudo
                </button>
              )}
            </>
          )}
        </div>
      )}
      <p className="muted small center">Só com ouro e não vence. Cada peça troca a do lugar dela; dá para voltar em Depósito › Minha decoração.</p>
    </div>
  )
}

/** Prévia da fazenda com a série: imagem do lote M; sem ela, um desenho simples nas cores da série. */
function Preview({ series }: { series: Series }) {
  const [failed, setFailed] = useState(false)
  if (!failed) {
     
    return <img className="preview-img" src={`/art/deco/${series.id}/preview.jpg`} alt={`Prévia da série ${series.name}`} onError={() => setFailed(true)} />
  }
  return (
    <div className={`preview-ph ph-${series.id}`} role="img" aria-label={`Prévia da série ${series.name}`}>
      <span className="ph-fundo" />
      <span className="ph-roca" />
      <span className="ph-casa">{SLOT_EMOJI.casa}</span>
      <span className="ph-casinha">{SLOT_EMOJI.casinha}</span>
      <span className="ph-enfeite">{series.id === 'inverno' ? '⛄' : series.id === 'arco_iris' ? '🌈' : series.id === 'bruxinha' ? '🎃' : '🛒'}</span>
      <span className="ph-cerca" />
    </div>
  )
}

function OrnamentGrid({ me, decor, busy, act }: { me: Me; decor: MyDecor; busy: boolean; act: Act }) {
  const [pick, setPick] = useState<(Ornament | PathKind) | null>(null)
  const [qty, setQty] = useState(1)
  const isPathItem = (x: Ornament | PathKind): x is PathKind => !('w' in x)
  const items: (Ornament | PathKind)[] = [...ORNAMENTS, ...PATHS]
  const max = pick ? Math.max(1, Math.min(10, Math.floor(me.gold / pick.gold))) : 1
  return (
    <>
      <p className="muted small center">
        Na fazenda cabem {decor.maxOrnaments} enfeites no seu nível (4 + nível/2, até 40) · você pôs {decor.ornaments}.
        Caminhos à parte: até {decor.maxPathCells} células.
      </p>
      <div className="grid">
        {items.map((o) => {
          const locked = me.level < o.minLevel
          const have = decor.owned[o.id] ?? 0, used = decor.used[o.id] ?? 0
          return (
            <button key={o.id} className={`cell ${pick?.id === o.id ? 'on' : ''}`} disabled={locked} onClick={() => { setPick(o); setQty(1) }}>
              <DecoIcon id={o.id} size={56} />
              <b>{o.name}</b>
              <span className="price">{coin(o.gold)}{isPathItem(o) ? <small>/{DECOR.pathPack}</small> : null}</span>
              <small className="muted">{isPathItem(o) ? `pacote de ${DECOR.pathPack} células` : `ocupa ${o.w}×${o.h}`}</small>
              {locked && <span className="lock">Nível {o.minLevel}</span>}
              {have > 0 && <em className="qty" title={`${used} na fazenda`}>{have - used}/{have}</em>}
            </button>
          )
        })}
      </div>
      {pick && (
        <div className="buy">
          <DecoIcon id={pick.id} size={56} />
          <div className="buy-info">
            <b>{pick.name}</b>
            <small>
              {isPathItem(pick)
                ? `Pinta ${DECOR.pathPack} células de caminho por pacote. Liga sozinho: reta, curva, T e cruz.`
                : `Ocupa ${pick.w}×${pick.h} células da grade · nível ${pick.minLevel}`} · só enfeite (não muda a colheita) · ponha com o martelo 🔨
            </small>
          </div>
          <div className="stepper" aria-label="Quantidade">
            <button className="btn small" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
            <input type="number" min={1} max={max} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} />
            <button className="btn small" onClick={() => setQty((q) => Math.min(max, q + 1))}>+</button>
          </div>
          <button className="btn green" disabled={busy || me.gold < pick.gold * qty}
            onClick={async () => { if (await act({ type: 'decor_buy', itemId: pick.id, qty })) setPick(null) }}>
            Comprar · {coin(pick.gold * qty)}
          </button>
        </div>
      )}
    </>
  )
}

// ---------- Depósito > Minha decoração ----------

export function MyDecorPanel({ decor, isOwn, busy, act, onEdit }: {
  decor: MyDecor; isOwn: boolean; busy: boolean; act: Act
  onEdit: (itemId?: string) => void // abre o modo edição (martelo) já com esse item na mão
}) {
  const loose = [...ORNAMENTS, ...PATHS].filter((o) => (decor.owned[o.id] ?? 0) > 0)
  return (
    <div className="my-decor">
      <h3>Peças da fazenda</h3>
      <ul className="pieces">
        {SLOTS.map((slot) => {
          const options = SERIES.filter((s) => s.id === DEFAULT_SERIES || decor.owned[pieceId(slot, s.id)])
          const cur = SERIES.find((s) => s.id === decor.slots[slot])!
          return (
            <li key={slot}>
              <DecoIcon id={pieceId(slot, cur.id)} size={40} />
              <span className="piece-name"><b>{cur.pieces[slot]}</b><small>{SLOT_NAMES[slot]}</small></span>
              <span className="chips" role="radiogroup" aria-label={SLOT_NAMES[slot]}>
                {options.map((s) => (
                  <button key={s.id} role="radio" aria-checked={s.id === cur.id} className={`chip ${s.id === cur.id ? 'on' : ''}`}
                    disabled={busy || s.id === cur.id} onClick={() => act({ type: 'decor_equip', slot, series: s.id })}>{s.name}</button>
                ))}
              </span>
            </li>
          )
        })}
      </ul>
      <h3>Enfeites e caminhos <small className="muted">({decor.ornaments}/{decor.maxOrnaments} enfeites · {decor.pathCells}/{decor.maxPathCells} células de caminho na fazenda)</small></h3>
      {!loose.length && <p className="muted center">Nenhum enfeite ainda. Tem na Loja › Decoração › Enfeites.</p>}
      <div className="grid">
        {loose.map((o) => {
          const have = decor.owned[o.id] ?? 0, used = decor.used[o.id] ?? 0
          return (
            <div key={o.id} className="cell static">
              <DecoIcon id={o.id} size={56} />
              <b>{o.name}</b>
              <small>{used} na fazenda · {have - used} guardado{have - used === 1 ? '' : 's'}</small>
              {isOwn && <button className="btn small" disabled={busy} onClick={() => onEdit(have - used > 0 ? o.id : undefined)}>{have - used > 0 ? 'Pôr na fazenda' : 'Arrumar'}</button>}
            </div>
          )
        })}
      </div>
      {isOwn && <div className="center"><button className="btn" onClick={() => onEdit()}>🔨 Arrumar a fazenda</button></div>}
      {!isOwn && <p className="muted small center">Para pôr ou guardar enfeites, volte para a sua fazenda.</p>}
    </div>
  )
}
