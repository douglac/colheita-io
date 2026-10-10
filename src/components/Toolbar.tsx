'use client'
import { memo, useState } from 'react'
import { fmtGold, itemIcon, itemName, SEED_BY_ID, SHOP_BY_ID, seedItem } from '@/game/catalog'
import { isFeed } from '@/game/livestock'
import { growMs } from '@/game/rules'
import { fmtDuration } from '@/game/sheet'
import { OWN_BAR, TOOLS, VISIT_BAR, type ActiveTool, type ToolId } from '@/game/tools'
import { HScroll } from './HScroll'
import { Icon } from './ui/Icon'

/** Barra inferior translúcida com as ferramentas (o tooltip é o nome). */
export function Toolbar({ visiting, active, bagOpen, onPick, counts }: {
  visiting: boolean
  active: ActiveTool
  bagOpen: boolean
  onPick: (id: ToolId) => void
  counts: Partial<Record<ToolId, number>> // limites do dia (pragas/ervas que ainda pode jogar)
}) {
  const bar = visiting ? VISIT_BAR : OWN_BAR
  return (
    <HScroll className="toolbar-tools" wrapClassName="toolbar-wrap" role="toolbar" label="Ferramentas">
      {bar.map((id) => {
        const t = TOOLS[id]
        const on = id === 'bag' ? bagOpen || active.id === 'seed' || active.id === 'fertilizer' || active.id === 'feed' : active.id === id
        const icon = id === 'hand' && visiting ? 'tool_steal' : t.icon
        return (
          <button key={id} className={`tool ${on ? 'on' : ''}`} title={t.name} aria-label={t.name} aria-pressed={on} onClick={() => onPick(id)}>
            <Icon name={icon} emoji={t.emoji} size={40} />
            {counts[id] != null && <em className="count">{counts[id]}</em>}
            {id === 'bag' && active.id === 'seed' && active.seedId && (
              <Icon className="sub" name={`crop:${active.seedId}`} emoji="🌱" size={22} />
            )}
          </button>
        )
      })}
    </HScroll>
  )
}

type BagTip = { name: string; lines: string[] }
/** Os textos não mudam (catálogo fixo): calculados uma vez por item, não a cada segundo do relógio do jogo. */
const tipCache = new Map<string, BagTip>()
function bagTip(itemId: string): BagTip {
  let t = tipCache.get(itemId)
  if (!t) { t = makeBagTip(itemId); tipCache.set(itemId, t) }
  return t
}

/** Tooltip da sacola: Nome, Período (até amadurecer) e Preço. */
function makeBagTip(itemId: string): BagTip {
  const seedId = itemId.startsWith('semente:') ? itemId.slice(8) : undefined
  if (seedId) {
    const s = SEED_BY_ID[seedId]
    return {
      name: s.name,
      lines: [
        `Período: ${fmtDuration(growMs(s))}${s.seasons ? ` · ${s.seasons} safras` : ''}`,
        `Preço: 🪙 ${fmtGold(SHOP_BY_ID[seedItem(seedId)]?.gold ?? s.cost)} na loja${s.sellPrice ? ` · vende a ${fmtGold(s.sellPrice)}/un` : ' · vira flor'}`,
      ],
    }
  }
  const item = SHOP_BY_ID[itemId]
  return { name: itemName(itemId), lines: item ? [item.desc, `Preço: 🪙 ${fmtGold(item.gold)} na loja`] : [] }
}

/**
 * "Seus pertences": fileira de slots com sementes e itens usáveis; escolher um vira a ferramenta ativa.
 * `memo`: o relógio do jogo redesenha a página a cada segundo; a sacola só muda com o inventário ou a ferramenta
 * (na fazenda máxima eram ~60 slots refeitos a cada segundo e no toque: Evolução 12, perfil do toque no celular).
 */
export const BagStrip = memo(function BagStrip({ inventory, level, active, onUse, onShop, onClose }: {
  inventory: { itemId: string; qty: number }[]
  level: number
  active: ActiveTool
  onUse: (itemId: string) => void
  onShop: () => void
  onClose: () => void
}) {
  const usable = inventory.filter((i) => i.itemId.startsWith('semente:') || i.itemId.startsWith('adubo') || i.itemId === 'racao' || isFeed(i.itemId))
  // A fileira rola na horizontal (e corta o que sai dela): o balão fica fora, acima da sacola.
  const [tip, setTip] = useState<{ itemId: string; x: number } | null>(null)
  const showTip = (itemId: string, el: HTMLElement) => {
    const bag = el.closest('.bag')!.getBoundingClientRect(), r = el.getBoundingClientRect()
    setTip({ itemId, x: r.left + r.width / 2 - bag.left })
  }
  // Rolou: o balão some, a não ser que o item tenha o foco do teclado (aí acompanha o item).
  const followFocus = () => {
    const el = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>('.bag .slot[data-item]') : null
    if (el) showTip(el.dataset.item!, el)
    else setTip(null)
  }
  const t = tip ? bagTip(tip.itemId) : null
  return (
    <section className="bag" aria-label="Seus pertences">
      <header>
        <b>Seus pertences</b>
        <button className="close small" onClick={onClose} aria-label="Fechar">×</button>
      </header>
      {t && tip && (
        <div className="bag-tip" role="tooltip" style={{ left: tip.x }}>
          <b>{t.name}</b>
          {t.lines.map((l) => <small key={l}>{l}</small>)}
        </div>
      )}
      <HScroll className="slots" label="Itens da sacola" onScroll={followFocus}>
        {usable.map((i) => {
          const seedId = i.itemId.startsWith('semente:') ? i.itemId.slice(8) : undefined
          const locked = seedId ? level < SEED_BY_ID[seedId].minLevel : false
          const on = (seedId && active.id === 'seed' && active.seedId === seedId) || ((active.id === 'fertilizer' || active.id === 'feed') && (active.itemId ?? 'adubo') === i.itemId)
          const info = bagTip(i.itemId)
          const name = seedId ? SEED_BY_ID[seedId].name : itemName(i.itemId)
          return (
            <button key={i.itemId} data-item={i.itemId} className={`slot ${on ? 'on' : ''}`} disabled={locked} aria-label={[`${info.name}, ${i.qty}`, ...info.lines].join('. ')} title={name}
              onClick={() => onUse(i.itemId)}
              onPointerEnter={(e) => e.pointerType === 'mouse' && showTip(i.itemId, e.currentTarget)} onPointerLeave={() => setTip(null)}
              onFocus={(e) => showTip(i.itemId, e.currentTarget)} onBlur={() => setTip(null)}>
              <Icon {...itemIcon(i.itemId)} size={52} />
              <em className="qty" aria-hidden>{i.qty}</em>
              <small className="slot-name">{name}</small>
            </button>
          )
        })}
        <button className="slot slot-shop" onClick={onShop} title="Comprar na loja">
          <Icon name="shop" emoji="🏪" size={52} />
          <small className="slot-name">Loja</small>
        </button>
      </HScroll>
      {usable.length === 0 && <p className="muted">Nada aqui. Compre sementes na loja.</p>}
    </section>
  )
})

export const bagItemTool = (itemId: string): ActiveTool | null =>
  itemId.startsWith('semente:') ? { id: 'seed', seedId: itemId.slice(8) }
  : itemId.startsWith('adubo') ? { id: 'fertilizer', itemId }
  : isFeed(itemId) ? { id: 'feed', itemId } : null
