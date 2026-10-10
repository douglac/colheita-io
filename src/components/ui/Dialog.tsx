'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { play } from '@/game/sfx'
import { HScroll } from '../HScroll'
import { DialogHeader } from './kit'

type Tab<T extends string> = { id: T; name: string }

/** Janela modal com moldura de madeira (ui/panel_9slice.png) e abas opcionais (Loja, Depósito). */
export function Dialog<T extends string>({ title, subtitle, icon, tabs, tab, onTab, onClose: close, children, footer, wide, className }: {
  title: string
  subtitle?: ReactNode
  icon?: ReactNode
  tabs?: Tab<T>[]
  tab?: T
  onTab?: (t: T) => void
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  className?: string
}) {
  // Som de janela abrindo e fechando (o anti-repetição de sfx.ts segura a montagem dupla do modo estrito).
  useEffect(() => { play('open') }, [])
  const onClose = () => { play('close'); close() }
  // Celular: arrastar o topo do painel para baixo fecha (gesto padrão de bottom sheet).
  const [drag, setDrag] = useState(0)
  const start = useRef<number | null>(null)
  const grab = {
    onPointerDown: (e: React.PointerEvent) => { if (e.pointerType === 'touch') { start.current = e.clientY; (e.target as Element).setPointerCapture?.(e.pointerId) } },
    onPointerMove: (e: React.PointerEvent) => { if (start.current != null) setDrag(Math.max(0, e.clientY - start.current)) },
    onPointerUp: () => { if (start.current == null) return; start.current = null; if (drag > 90) onClose(); setDrag(0) },
    onPointerCancel: () => { start.current = null; setDrag(0) },
  }
  // Teclado: o foco entra na janela ao abrir (e o Tab não fica perdido atrás dela, na cena).
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { box.current?.focus({ preventScroll: true }) }, [])
  // Celular: as abas não cabem e rolam de lado; a aba aberta fica sempre à vista (a Decoração ficava fora da tela).
  useEffect(() => {
    box.current?.querySelector('[role="tab"][aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [tab])
  return (
    <div className="overlay" onClick={onClose}>
      <div ref={box} tabIndex={-1} className={`dialog ${wide ? 'wide' : ''} ${className ?? ''}`} role="dialog" aria-modal="true" aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}>
        <DialogHeader icon={icon} title={title} subtitle={subtitle} onClose={onClose} {...grab} style={{ touchAction: 'none' }} />
        {tabs && (
          <HScroll className="tabs" wrapClassName="hs-tabs" role="tablist" label={`Abas de ${title}`}>
            {tabs.map((t) => (
              <button key={t.id} role="tab" aria-selected={t.id === tab} className={`tab ${t.id === tab ? 'on' : ''}`} onClick={() => { play('tab'); onTab?.(t.id) }}>
                {t.name}
              </button>
            ))}
          </HScroll>
        )}
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-footer">{footer}</footer>}
      </div>
    </div>
  )
}
