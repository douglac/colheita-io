'use client'
// Barra do modo edição (martelo 🔨): no lugar da barra de ferramentas enquanto o dono arruma a fazenda.
// Mover (arrastar um enfeite), pôr um enfeite guardado, pintar/apagar caminho, guardar o escolhido e fechar.
import { ORNAMENT_BY_ID, ORNAMENTS, PATHS } from '@/game/decor'
import type { EditMode } from '@/scene/decor-layer'
import type { FarmPayload } from '@/server/game'
import { DecoIcon } from './DecorShop'

export type DecorEditState = { mode: EditMode; itemId?: string; selected?: number | null; hint?: string; bad?: boolean }

export function DecorEditBar({ decor, state, busy, onState, onStore, onShop, onClose }: {
  decor: FarmPayload['myDecor']; state: DecorEditState; busy: boolean
  onState: (s: DecorEditState) => void
  onStore: (id: number) => void
  onShop: () => void
  onClose: () => void
}) {
  const left = (id: string) => (decor.owned[id] ?? 0) - (decor.used[id] ?? 0)
  const stored = ORNAMENTS.filter((o) => left(o.id) > 0)
  const paths = PATHS.filter((p) => (decor.owned[p.id] ?? 0) > 0)
  const on = (m: EditMode, itemId?: string) => state.mode === m && (itemId == null || state.itemId === itemId)
  return (
    <div className="decor-edit" role="toolbar" aria-label="Arrumar a fazenda">
      <div className="decor-edit-head">
        <b>🔨 Arrumando a fazenda</b>
        <small>{decor.ornaments}/{decor.maxOrnaments} enfeites · {decor.pathCells}/{decor.maxPathCells} de caminho</small>
      </div>
      <div className="decor-edit-tools">
        <button className={`dtool ${on('move') ? 'on' : ''}`} onClick={() => onState({ mode: 'move', selected: null })} title="Toque num enfeite e arraste">
          <span className="dt-ico">✋</span><span>Mover</span>
        </button>
        {stored.map((o) => (
          <button key={o.id} className={`dtool ${on('place', o.id) ? 'on' : ''}`} onClick={() => onState({ mode: 'place', itemId: o.id })} title={`Pôr ${o.name}`}>
            <DecoIcon id={o.id} size={34} /><span>{o.name}</span><em>{left(o.id)}</em>
          </button>
        ))}
        {paths.map((p) => (
          <button key={p.id} className={`dtool ${on('paint', p.id) ? 'on' : ''}`} onClick={() => onState({ mode: 'paint', itemId: p.id })} title={`Pintar ${p.name.toLowerCase()} (arraste o dedo)`}>
            <DecoIcon id={p.id} size={34} /><span>{p.name}</span><em>{left(p.id)}</em>
          </button>
        ))}
        {paths.length > 0 && (
          <button className={`dtool ${on('erase') ? 'on' : ''}`} onClick={() => onState({ mode: 'erase' })} title="Apagar caminho (volta para o estoque)">
            <span className="dt-ico">🧽</span><span>Apagar caminho</span>
          </button>
        )}
        <button className="dtool" onClick={onShop} title="Loja › Decoração"><span className="dt-ico">🏪</span><span>Comprar</span></button>
      </div>
      <div className="decor-edit-foot">
        <span className={`decor-hint ${state.bad ? 'bad' : ''}`} role="status">
          {state.hint ?? HINT[state.mode]}
        </span>
        {state.selected != null && (
          <button className="btn small" disabled={busy} onClick={() => onStore(state.selected!)}>Guardar</button>
        )}
        <button className="btn green small" onClick={onClose}>Pronto</button>
      </div>
    </div>
  )
}

const HINT: Record<EditMode, string> = {
  off: '',
  move: 'Toque num enfeite para escolher; arraste para mudar de lugar.',
  place: 'Toque na grade para pôr. Verde pode, vermelho não.',
  paint: 'Arraste o dedo para pintar o caminho: ele se liga sozinho.',
  erase: 'Arraste por cima do caminho para apagar.',
}

export const ornamentLabel = (id: string) => ORNAMENT_BY_ID[id]?.name ?? id
