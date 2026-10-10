// Segurar, arrastar e soltar bicho (animal-drag.ts), sem o Pixi desenhando: tela = mundo.
import { Container } from 'pixi.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnimalDrag, HOLD_MS, type Critter } from '../src/scene/animal-drag'
import { plotPos } from '../src/scene/layout'
import { Wanderer } from '../src/scene/wander'
import { pastureBlocked } from '../src/game/pasture'

function setup(canDrag = true) {
  const node = new Container(), body = new Container()
  node.addChild(body)
  const w = new Wanderer(node, body, { x0: 330, y0: 300, x1: 330, y1: 300 }, 20, true, undefined, pastureBlocked)
  const c: Critter = { id: 'pig', w, width: 64 }
  const log: string[] = []
  const drag = new AnimalDrag({
    toWorld: (p) => p, canDrag: () => canDrag, calm: () => false,
    onPick: () => log.push('pick'), onDenied: () => log.push('denied'),
    onDrop: (_c, x, y) => log.push(`drop ${x},${y}`), onReject: (_c, r) => log.push(`reject ${r}`),
  })
  return { c, w, node, drag, log }
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('pegar e trocar de lugar', () => {
  it('segurar 300 ms pega; soltar em grama livre muda o bicho de lugar e da área de passeio', () => {
    const { c, node, drag, log } = setup()
    drag.press(c, 1, { x: 330, y: 300 }, false)
    vi.advanceTimersByTime(HOLD_MS - 10)
    expect(drag.holding).toBe(false)
    vi.advanceTimersByTime(20)
    expect(drag.holding).toBe(true)
    expect(drag.move(1, { x: -60, y: 200 })).toBe(true)
    expect(drag.release(1)).toBe(true)
    expect(log).toEqual(['pick', 'drop -60,200'])
    expect(node.position).toMatchObject({ x: -60, y: 200 })
    expect(c.w.held).toBe(false)
  })

  it('soltar na terra: recusa e o bicho volta animado para onde estava', () => {
    const { c, node, drag, log } = setup()
    drag.press(c, 1, { x: 330, y: 300 }, false)
    vi.advanceTimersByTime(HOLD_MS)
    const lot = plotPos(4)
    drag.move(1, lot)
    drag.release(1)
    expect(log).toEqual(['pick', 'reject Na terra da roça não dá'])
    drag.update(0.1)
    expect(node.x).not.toBe(330) // no meio do caminho de volta
    for (let i = 0; i < 10; i++) drag.update(0.05)
    expect(node.position).toMatchObject({ x: 330, y: 300 })
    expect(c.w.held).toBe(false)
  })

  it('dedo andando antes do tempo é arraste da câmera: não pega', () => {
    const { c, drag, log } = setup()
    drag.press(c, 1, { x: 330, y: 300 }, true)
    expect(drag.move(1, { x: 345, y: 300 })).toBe(false)
    vi.advanceTimersByTime(HOLD_MS * 2)
    expect(drag.holding).toBe(false)
    expect(log).toEqual([])
  })

  it('pinça (cancel) larga o bicho e ele volta', () => {
    const { c, node, drag } = setup()
    drag.press(c, 1, { x: 330, y: 300 }, false)
    vi.advanceTimersByTime(HOLD_MS)
    drag.move(1, { x: -60, y: 200 })
    drag.cancel()
    for (let i = 0; i < 10; i++) drag.update(0.05)
    expect(node.position).toMatchObject({ x: 330, y: 300 })
  })

  it('visitante: segurar não pega (só avisa) e o bicho não sai do lugar', () => {
    const { c, node, drag, log } = setup(false)
    drag.press(c, 1, { x: 330, y: 300 }, false)
    vi.advanceTimersByTime(HOLD_MS)
    expect(drag.holding).toBe(false)
    expect(drag.move(1, { x: -60, y: 200 })).toBe(false)
    expect(drag.release(1)).toBe(false)
    expect(log).toEqual(['denied'])
    expect(node.position).toMatchObject({ x: 330, y: 300 })
  })
})
