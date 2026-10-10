'use client'
import { useEffect, useRef } from 'react'
import { flowerItem, itemIcon, SEED_BY_ID } from '@/game/catalog'
import { Icon } from './ui/Icon'

// A frutinha subindo mostra que você pegou da horta: ao colher ou pegar da
// horta do amigo, o ícone da cultura sai do pé, sobe em arco e some no Depósito, com um "x N" ao lado.
// Arte: o ícone do produto (public/art/ui/produto_<id>.png, ou a cultura madura). Movimento reduzido: só aparece e some no lugar.

// `product`: produto de bicho (ovo, leite…): sobe o ícone dele (emoji enquanto não há arte).
export type Fruit = { id: number; seedId: string; qty: number; from: { x: number; y: number }; product?: { name: string; emoji: string } }

const ICON = 56

/** Botão do Depósito que está na tela (HUD no computador, barra de abas no celular). */
function barnTarget(): HTMLElement | null {
  const all = [...document.querySelectorAll<HTMLElement>('[data-barn]')]
  return all.find((e) => e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0) ?? null
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

function FruitFlight({ f, onDone }: { f: Fruit; onDone: (id: number) => void }) {
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = el.current
    if (!node) return
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const barn = barnTarget()
    const r = barn?.getBoundingClientRect()
    const to = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: f.from.x, y: f.from.y - 180 }
    const at = (x: number, y: number, s: number) => `translate(${x - ICON / 2}px, ${y - ICON / 2}px) scale(${s})`
    let anim: Animation
    if (calm) {
      const tf = at(f.from.x, f.from.y - 20, 1)
      anim = node.animate(
        [{ transform: tf, opacity: 0 }, { transform: tf, opacity: 1, offset: 0.15 }, { transform: tf, opacity: 1, offset: 0.75 }, { transform: tf, opacity: 0 }],
        { duration: 1000, fill: 'forwards' })
    } else {
      // Primeiro um pulinho para cima do pé; depois o arco (Bézier quadrática) até o Depósito.
      const c = { x: (f.from.x + to.x) / 2, y: Math.min(f.from.y, to.y) - 120 }
      const frames: Keyframe[] = [{ transform: at(f.from.x, f.from.y, 0.5), opacity: 0, offset: 0 }]
      frames.push({ transform: at(f.from.x, f.from.y - 46, 1.15), opacity: 1, offset: 0.22 })
      const start = { x: f.from.x, y: f.from.y - 46 }
      const ctrl = { x: c.x, y: Math.min(c.y, start.y - 60) }
      const N = 12
      for (let i = 1; i <= N; i++) {
        const t = ease(i / N)
        const x = (1 - t) ** 2 * start.x + 2 * (1 - t) * t * ctrl.x + t * t * to.x
        const y = (1 - t) ** 2 * start.y + 2 * (1 - t) * t * ctrl.y + t * t * to.y
        frames.push({ transform: at(x, y, 1.15 - 0.75 * t), opacity: i === N ? 0 : 1, offset: 0.32 + (0.68 * i) / N })
      }
      anim = node.animate(frames, { duration: 1250, easing: 'linear', fill: 'forwards' })
    }
    anim.onfinish = () => {
      if (barn && !calm) barn.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 260 })
      onDone(f.id)
    }
    // Rede de segurança: aba em segundo plano não anda as animações; a frutinha sai do mesmo jeito.
    const t = setTimeout(() => onDone(f.id), 3000)
    return () => { clearTimeout(t); anim.cancel() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const icon = f.product ?? itemIcon(SEED_BY_ID[f.seedId]?.flower ? flowerItem(f.seedId) : f.seedId)
  return (
    <div ref={el} className="fruit" style={{ opacity: 0 }}>
      <span className="fruit-icon product"><Icon name={icon.name} emoji={icon.emoji} size={ICON} /></span>
      <b>x {f.qty}</b>
    </div>
  )
}

export function FruitLayer({ fruits, onDone }: { fruits: Fruit[]; onDone: (id: number) => void }) {
  return (
    <div className="fruit-layer" aria-hidden>
      {fruits.map((f) => <FruitFlight key={f.id} f={f} onDone={onDone} />)}
    </div>
  )
}
