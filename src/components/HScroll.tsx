'use client'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { DragGate, edges, itemTarget, pageTarget, revealTarget, wheelToX, type Metrics } from './hscroll-math'

const FOCUSABLE = 'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Faixa horizontal do jogo (sacola, vizinhos, abas, sementes de presente).
 * Celular: arrasta com o dedo (inércia nativa), para alinhada no item e esmaece a borda do lado que continua.
 * Computador: setas ◀ ▶ amarelas nas pontas (uma página), roda do mouse e clicar-e-arrastar.
 * Teclado: ← → item a item, PageUp/PageDown página, Home/End pontas. Arrastar mais de 8 px não vira clique.
 */
export function HScroll({ children, className = '', wrapClassName = '', label, role, onScroll }: {
  children: ReactNode
  className?: string // na faixa que rola (onde ficam os itens)
  wrapClassName?: string // no contorno (setas + faixa)
  label?: string
  role?: string
  onScroll?: () => void
}) {
  const track = useRef<HTMLDivElement>(null)
  const gate = useRef(new DragGate())
  const drag = useRef<{ x: number; left: number; id: number } | null>(null)
  const [edge, setEdge] = useState({ overflow: false, atStart: true, atEnd: true })

  const metrics = (el: HTMLElement): Metrics => ({ left: el.scrollLeft, width: el.clientWidth, scroll: el.scrollWidth })
  /** Onde cada item começa, em scrollLeft (o primeiro item fica em 0). */
  const starts = (el: HTMLElement) => {
    const kids = [...el.children] as HTMLElement[]
    const pad = kids[0]?.offsetLeft ?? 0
    return kids.map((k) => k.offsetLeft - pad)
  }
  const measure = useCallback(() => {
    const el = track.current
    if (!el) return
    const e = edges(metrics(el))
    setEdge((cur) => (cur.overflow === e.overflow && cur.atStart === e.atStart && cur.atEnd === e.atEnd ? cur : e))
  }, [])
  const go = (left: number) => track.current?.scrollTo({ left, behavior: reducedMotion() ? 'auto' : 'smooth' })
  const page = (dir: 1 | -1) => { const el = track.current; if (el) go(pageTarget(metrics(el), dir, starts(el))) }

  // Tamanho e conteúdo mudam (abrir a sacola, chegar vizinho novo, girar o celular): recalcula as pontas.
  useEffect(() => {
    const el = track.current
    if (!el) return
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    const mo = new MutationObserver(measure)
    mo.observe(el, { childList: true, subtree: true, characterData: true })
    return () => { ro.disconnect(); mo.disconnect() }
  }, [measure])

  // Roda do mouse: Shift+roda e a roda vertical sobre a faixa rolam na horizontal (precisa de listener não passivo).
  useEffect(() => {
    const el = track.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return // pinça do trackpad: deixa o navegador
      const m = metrics(el), x = wheelToX(e)
      if (!x || !edges(m).overflow) return
      const { atStart, atEnd } = edges(m)
      // Já na ponta e a roda era vertical: deixa passar, para a janela de fora rolar normalmente.
      if ((x < 0 && atStart) || (x > 0 && atEnd)) { if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && !e.shiftKey) return; e.preventDefault(); return }
      e.preventDefault()
      el.scrollLeft += x
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    gate.current.start(e.clientX, e.clientY)
    // Mouse: clicar e arrastar rola (no toque o navegador já rola sozinho, com inércia).
    if (e.pointerType === 'mouse') drag.current = { x: e.clientX, left: e.currentTarget.scrollLeft, id: e.pointerId }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const moved = gate.current.move(e.clientX, e.clientY)
    const d = drag.current, el = e.currentTarget
    if (!d || d.id !== e.pointerId || !moved) return
    if (!el.classList.contains('dragging')) { el.classList.add('dragging'); el.setPointerCapture?.(e.pointerId) }
    el.scrollLeft = d.left - (e.clientX - d.x)
  }
  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    gate.current.end()
    if (!drag.current) return
    drag.current = null
    const el = e.currentTarget
    if (!el.classList.contains('dragging')) return
    el.classList.remove('dragging')
    // Solta: para alinhada no item mais próximo (o scroll-snap volta a valer).
    const s = starts(el), m = metrics(el)
    const near = s.reduce((a, b) => (Math.abs(b - m.left) < Math.abs(a - m.left) ? b : a), 0)
    go(Math.min(near, Math.max(0, m.scroll - m.width)))
  }
  // Arrastou (dedo ou mouse)? Então o clique que vem junto não escolhe item. Teclado (detail 0) sempre passa.
  const onClickCapture = (e: React.MouseEvent) => {
    if (e.detail === 0) return
    if (!gate.current.takeClick()) { e.preventDefault(); e.stopPropagation() }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    const el = e.currentTarget
    const keys: Record<string, true> = { ArrowLeft: true, ArrowRight: true, PageUp: true, PageDown: true, Home: true, End: true }
    if (!keys[e.key]) return
    // Dentro de um campo de texto as setas são do campo.
    if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return
    e.preventDefault()
    e.stopPropagation() // nada de atalho do jogo nem câmera andando enquanto a faixa tem o foco
    const kids = [...el.children] as HTMLElement[]
    const focusables = kids.map((k) => (k.matches(FOCUSABLE) ? k : k.querySelector<HTMLElement>(FOCUSABLE))).filter((k): k is HTMLElement => !!k)
    const cur = focusables.findIndex((f) => f === document.activeElement || f.contains(document.activeElement))
    const m = metrics(el), s = starts(el)
    if (cur >= 0) {
      // Foco num item: anda o foco (e a faixa acompanha).
      let next = cur
      if (e.key === 'ArrowLeft') next = cur - 1
      else if (e.key === 'ArrowRight') next = cur + 1
      else if (e.key === 'Home') next = 0
      else if (e.key === 'End') next = focusables.length - 1
      else {
        const left = pageTarget(m, e.key === 'PageDown' ? 1 : -1, s)
        next = focusables.findIndex((f) => f.offsetLeft - (kids[0]?.offsetLeft ?? 0) >= left - 1)
        if (next < 0) next = focusables.length - 1
        go(left)
      }
      next = Math.max(0, Math.min(focusables.length - 1, next))
      const f = focusables[next], item = kids.find((k) => k.contains(f)) ?? f
      f.focus({ preventScroll: true })
      if (e.key !== 'PageUp' && e.key !== 'PageDown') go(revealTarget(m, item.offsetLeft - (kids[0]?.offsetLeft ?? 0), item.offsetWidth, s))
      return
    }
    // Foco na própria faixa: só rola.
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') go(itemTarget(m, e.key === 'ArrowRight' ? 1 : -1, s))
    else if (e.key === 'PageUp' || e.key === 'PageDown') go(pageTarget(m, e.key === 'PageDown' ? 1 : -1, s))
    else go(e.key === 'Home' ? 0 : m.scroll)
  }

  const cls = ['hs', wrapClassName, edge.overflow ? 'overflow' : '', edge.atStart ? '' : 'can-prev', edge.atEnd ? '' : 'can-next'].filter(Boolean).join(' ')
  return (
    <div className={cls}>
      {edge.overflow && <Arrow dir={-1} disabled={edge.atStart} onClick={() => page(-1)} />}
      <div ref={track} className={`hs-track ${className}`} tabIndex={0} role={role ?? 'group'} aria-label={label}
        onScroll={() => { if (gate.current.pressing) gate.current.moved = true; measure(); onScroll?.() }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}
        onClickCapture={onClickCapture} onKeyDown={onKeyDown} onDragStart={(e) => e.preventDefault()}>
        {children}
      </div>
      {edge.overflow && <Arrow dir={1} disabled={edge.atEnd} onClick={() => page(1)} />}
    </div>
  )
}

/** Seta redonda amarela com contorno marrom, como as da sacola. */
function Arrow({ dir, disabled, onClick }: { dir: 1 | -1; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`hs-arrow ${dir < 0 ? 'prev' : 'next'}`} disabled={disabled} onClick={onClick} tabIndex={-1}
      aria-label={dir < 0 ? 'Rolar para a esquerda' : 'Rolar para a direita'} title={dir < 0 ? 'Anteriores' : 'Próximos'}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><path d={dir < 0 ? 'M11 2 L4 8 L11 14 Z' : 'M5 2 L12 8 L5 14 Z'} /></svg>
    </button>
  )
}
