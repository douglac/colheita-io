// Destaque de clicável (hoverFx.ts), sem o Pixi desenhando: entra, sai e volta exatamente ao estado de antes.
import { Container, Filter, Sprite } from 'pixi.js'
import { describe, expect, it, vi } from 'vitest'
import { FLASH_S, HOVER_S, HoverFilter, HoverFx } from '../src/scene/hoverFx'

// Sem WebGL no teste: o filtro de verdade não compila aqui, então entra um no lugar dele (só o `k` importa).
class FakeFilter extends Filter { k = 0 }
const make = () => new FakeFilter({}) as unknown as HoverFilter
const FRAME = 1 / 60
const run = (fx: HoverFx, s: number) => { for (let t = 0; t < s; t += FRAME) fx.update(FRAME) }

function critter() {
  const node = new Container(), body = new Container()
  body.addChild(new Sprite())
  body.scale.set(-0.8, 0.8) // virado e com a escala do desenho: é do passeio, o destaque não mexe
  node.addChild(body)
  return { node, body }
}

describe('destaque de clicável', () => {
  it('entra (contorno no corpo, pulinho no nó) e sai voltando ao original', () => {
    const fx = new HoverFx(false, make)
    const { node, body } = critter()
    fx.on(node, { fx: body })
    expect(body.filters?.[0]).toBeInstanceOf(FakeFilter)
    run(fx, HOVER_S)
    const f = body.filters![0] as HoverFilter
    const destroy = vi.spyOn(f, 'destroy')
    expect(f.k).toBeCloseTo(1)
    expect(node.scale.x).toBeGreaterThan(1.02)
    expect(body.scale.x).toBe(-0.8) // o corpo continua do passeio
    run(fx, 0.5)
    expect(node.scale.x).toBeCloseTo(1.04, 2) // assentou no pulinho
    fx.off(node)
    run(fx, 0.6)
    expect(fx.active).toBe(0)
    expect(node.scale.x).toBe(1)
    expect(node.scale.y).toBe(1)
    expect(body.filters).toBeNull()
    expect(body.scale.x).toBe(-0.8)
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('hover repetido rápido não acumula: escala, filtros e tint voltam iguais', () => {
    const fx = new HoverFx(false, make)
    const sp = new Sprite()
    sp.scale.set(0.6875)
    sp.tint = 0xffeedd
    const keep = new FakeFilter({})
    sp.filters = [keep]
    for (let i = 0; i < 40; i++) {
      fx.on(sp)
      fx.update(FRAME * (i % 3))
      fx.off(sp)
      fx.update(FRAME)
    }
    expect(fx.active).toBe(1)
    expect(sp.filters).toHaveLength(2) // um filtro do destaque só, nunca dois
    run(fx, 1)
    expect(fx.active).toBe(0)
    expect(sp.scale.x).toBe(0.6875)
    expect(sp.scale.y).toBe(0.6875)
    expect(sp.tint).toBe(0xffeedd)
    expect(sp.filters).toEqual([keep])
  })

  it('voltar no meio da saída retoma de onde estava (sem salto de escala)', () => {
    const fx = new HoverFx(false, make)
    const { node, body } = critter()
    fx.on(node, { fx: body })
    run(fx, 0.3)
    fx.off(node)
    let last = node.scale.x
    for (let i = 0; i < 4; i++) { fx.update(FRAME); expect(Math.abs(node.scale.x - last)).toBeLessThan(0.02); last = node.scale.x }
    fx.on(node, { fx: body })
    for (let i = 0; i < 20; i++) { fx.update(FRAME); expect(Math.abs(node.scale.x - last)).toBeLessThan(0.02); last = node.scale.x }
  })

  it('movimento reduzido: só tom e contorno, a escala não muda', () => {
    const fx = new HoverFx(true, make)
    const { node, body } = critter()
    fx.on(node, { fx: body })
    run(fx, HOVER_S)
    expect((body.filters![0] as HoverFilter).k).toBeCloseTo(1)
    expect(node.scale.x).toBe(1)
    fx.off(node)
    run(fx, HOVER_S + FRAME)
    expect(body.filters).toBeNull()
  })

  it('versão leve e sem pulinho (lote)', () => {
    const fx = new HoverFx(false, make)
    const a = new Container(), b = new Container()
    fx.on(a, { light: true })
    fx.on(b, { bump: false })
    run(fx, 0.5)
    expect((a.filters![0] as HoverFilter).k).toBeCloseTo(0.5)
    expect(a.scale.x).toBeCloseTo(1.02, 2)
    expect(b.scale.x).toBe(1)
  })

  it('toque: flash curto que sai sozinho', () => {
    const fx = new HoverFx(false, make)
    const { node, body } = critter()
    fx.flash(node, { fx: body })
    run(fx, FLASH_S / 2)
    expect(body.filters).toHaveLength(1)
    run(fx, FLASH_S + 0.6)
    expect(fx.active).toBe(0)
    expect(node.scale.x).toBe(1)
    expect(body.filters).toBeNull()
  })

  it('objeto destruído no meio do destaque sai da lista sem erro; clear() limpa na hora', () => {
    const fx = new HoverFx(false, make)
    const a = new Container(), b = new Container()
    fx.on(a)
    fx.on(b)
    a.destroy()
    expect(() => fx.update(FRAME)).not.toThrow()
    expect(fx.active).toBe(1)
    fx.clear()
    expect(fx.active).toBe(0)
    expect(b.filters).toBeNull()
    expect(b.scale.x).toBe(1)
  })

  it('mouse: um objeto aceso por vez, e sair da cena apaga (o Pixi às vezes não manda o pointerout)', () => {
    const fx = new HoverFx(false, make)
    const a = critter(), b = critter()
    fx.point(a.node, { fx: a.body })
    fx.point(b.node, { fx: b.body }) // entrou no outro sem a saída do primeiro
    run(fx, 0.6)
    expect(a.body.filters).toBeNull()
    expect(a.node.scale.x).toBe(1)
    expect(b.body.filters).toHaveLength(1)
    fx.leave()
    run(fx, 0.6)
    expect(fx.active).toBe(0)
    expect(b.node.scale.x).toBe(1)
    expect(b.body.filters).toBeNull()
  })
})
