// Pegar e trocar bicho de lugar: onde pode soltar (mesma regra no cliente e no servidor) e o passeio depois.
import { Container } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { ANIMAL_IDS, DOG_LEASH, dropCheck, pastureBlocked, roamArea, YARD } from '../src/game/pasture'
import { DOGHOUSE, FENCE, farmBlocked, HOUSE, MAX_FIELD_PLOTS, plotPos, TREES } from '../src/scene/layout'
import { Wanderer } from '../src/scene/wander'

const mid = (pts: [number, number][]) => ({ x: pts.reduce((s, p) => s + p[0], 0) / pts.length, y: pts.reduce((s, p) => s + p[1], 0) / pts.length })

// Grama livre em cantos diferentes da fazenda (pasto da frente, perto da cerca, atrás da roça, ao lado da casinha).
const GRASS = [
  { x: -250, y: 150 }, { x: -60, y: 200 }, { x: 330, y: 300 }, { x: 420, y: -40 }, { x: -60, y: -180 }, { x: 140, y: -120 }, { x: -300, y: 60 },
]

describe('onde soltar o bicho', () => {
  it('grama livre: pode', () => {
    for (const p of GRASS) for (const id of ANIMAL_IDS) {
      if (id === 'dog') continue
      expect(dropCheck(id, p.x, p.y), `${id} em ${p.x},${p.y}`).toEqual({ ok: true })
    }
  })

  it('lotes de terra (até os 24, mesmo os não comprados): não pode', () => {
    for (let i = 0; i < MAX_FIELD_PLOTS; i++) {
      const p = plotPos(i)
      const r = dropCheck('pig', p.x, p.y)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toMatch(/roça/)
    }
  })

  it('casa (paredes e telhado), casinha e cerca: não pode', () => {
    const house = mid(HOUSE)
    expect(dropCheck('cow', house.x, house.y)).toEqual({ ok: false, reason: 'Em cima da casa não dá' })
    expect(dropCheck('cow', -230, -190)).toEqual({ ok: false, reason: 'Em cima da casa não dá' }) // telhado
    const dh = mid(DOGHOUSE)
    expect(dropCheck('dog', dh.x, dh.y)).toEqual({ ok: false, reason: 'Em cima da casinha não dá' })
    const f = { x: (FENCE[0][0] + FENCE[1][0]) / 2, y: (FENCE[0][1] + FENCE[1][1]) / 2 }
    expect(dropCheck('sheep', f.x, f.y)).toEqual({ ok: false, reason: 'Em cima da cerca não dá' })
  })

  it('em cima das árvores: não pode (elas ficam atrás dos bichos no desenho)', () => {
    for (const t of TREES) {
      const r = dropCheck('sheep', t.x, t.y - 30)
      if (!r.ok && r.reason === 'Fora da fazenda não dá') continue
      expect(r).toEqual({ ok: false, reason: 'Na árvore não dá' })
    }
  })

  it('pegada inteira conta: a vaca não fica com metade do corpo na roça', () => {
    // Logo ao lado de um ponto bloqueado, a galinha (pé pequeno) cabe onde a vaca não cabe.
    let found = false
    for (let x = -400; x < 500 && !found; x += 4) for (let y = -250; y < 320 && !found; y += 4) {
      if (dropCheck('chicken', x, y).ok && !dropCheck('cow', x, y).ok) found = true
    }
    expect(found).toBe(true)
  })

  it('fora da fazenda e números inválidos: não pode', () => {
    expect(dropCheck('pig', YARD.x1 + 50, 0)).toMatchObject({ ok: false, reason: 'Fora da fazenda não dá' })
    expect(dropCheck('pig', 0, YARD.y0 - 50)).toMatchObject({ ok: false })
    expect(dropCheck('pig', NaN, 0)).toMatchObject({ ok: false })
    expect(dropCheck('pig', Infinity, 0)).toMatchObject({ ok: false })
  })

  it('cachorro: muda de lugar, mas sempre perto da casinha', () => {
    expect(dropCheck('dog', 140, -120)).toEqual({ ok: true })
    expect(dropCheck('dog', 360, -60)).toEqual({ ok: true })
    expect(dropCheck('dog', -250, 150)).toEqual({ ok: false, reason: 'O cachorro fica perto da casinha' })
    expect(Math.hypot(330 - DOG_LEASH.x, (300 - DOG_LEASH.y) * 2)).toBeGreaterThan(DOG_LEASH.r)
  })

  it('todo ponto aceito é chão livre (varredura da fazenda)', () => {
    for (let x = YARD.x0; x <= YARD.x1; x += 10) for (let y = YARD.y0; y <= YARD.y1; y += 10) {
      if (dropCheck('chicken', x, y).ok) { expect(farmBlocked(x, y)).toBe(false); expect(pastureBlocked(x, y)).toBe(false) }
    }
  })
})

describe('depois de mudar de lugar', () => {
  it('passeia em volta do lugar novo e nunca pisa em área bloqueada (3.000 passos de vários pontos)', () => {
    const starts = [...GRASS]
    // Mais pontos novos, sorteados entre os válidos (determinístico: varredura em grade).
    for (let x = YARD.x0; x <= YARD.x1; x += 97) for (let y = YARD.y0; y <= YARD.y1; y += 61) if (dropCheck('cow', x, y).ok) starts.push({ x, y })
    expect(starts.length).toBeGreaterThan(15)
    for (const s of starts) {
      const node = new Container(), body = new Container()
      node.addChild(body)
      const w = new Wanderer(node, body, { x0: -330, y0: -40, x1: -150, y1: 40 }, 40, true, undefined, pastureBlocked)
      const area = roamArea('cow', s.x, s.y)
      w.setArea(area, s)
      expect(node.position).toMatchObject({ x: s.x, y: s.y })
      let far = 0
      const bad: string[] = []
      for (let i = 0; i < 3000; i++) {
        w.update(0.05)
        const { x, y } = node
        if (farmBlocked(x, y) || pastureBlocked(x, y) || x < area.x0 || x > area.x1 || y < area.y0 || y > area.y1) bad.push(`${x},${y}`)
        far = Math.max(far, Math.hypot(x - s.x, y - s.y))
      }
      expect(bad, `solto em ${s.x},${s.y}`).toEqual([])
      expect(far).toBeGreaterThan(0)
    }
  }, 30_000)

  it('na mão do jogador não anda', () => {
    const node = new Container(), body = new Container()
    node.addChild(body)
    const w = new Wanderer(node, body, { x0: 0, y0: 0, x1: 100, y1: 50 }, 40)
    w.held = true
    const { x, y } = node
    for (let i = 0; i < 200; i++) w.update(0.05)
    expect(node.position).toMatchObject({ x, y })
  })
})
