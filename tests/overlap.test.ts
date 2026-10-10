import { Container } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { pastureBlocked } from '../src/game/pasture'
import { ANIMAL_AREAS, FIELD, HOUSE, inPoly, MAX_FIELD_PLOTS, plotPos, PROPS } from '../src/scene/layout'
import { footZ } from '../src/scene/depth-order'
import { Wanderer } from '../src/scene/wander'

// QA nível máximo (9/out/2026): o ninho ficava em cima do lote 9 e o bicho parado nascia com zIndex 0.
describe('sobreposição na fazenda', () => {
  it('adereços fixos ficam fora da roça cheia e da casa (com a folga do desenho)', () => {
    for (const p of PROPS) {
      const ring = [[0, 0], [p.w / 2, 0], [-p.w / 2, 0], [0, -p.w / 2]].map(([dx, dy]) => [p.x + dx, p.y + dy] as [number, number])
      for (const [x, y] of ring) {
        expect(inPoly(x, y, FIELD), `${p.key} em cima da roça`).toBe(false)
        expect(inPoly(x, y, HOUSE), `${p.key} em cima da casa`).toBe(false)
      }
    }
  })

  it('bicho recém-criado já é ordenado pelo pé (sem esperar o primeiro passo)', () => {
    const node = new Container(), body = new Container()
    node.addChild(body)
    new Wanderer(node, body, { x0: 100, y0: 200, x1: 140, y1: 240 }, 30)
    expect(node.zIndex).toBe(footZ(node.x, node.y))
    expect(node.y).toBeGreaterThanOrEqual(200)
  })

  it('nas áreas de passeio padrão, nenhum bicho fica atrás de um lote encostado nas plantas ou no balão dele', () => {
    // Na camada do pé (Evolução 31) o bicho atrás do lote fica embaixo das plantas; mesmo assim, a área padrão não deixa
    // ele passear escondido atrás delas.
    // Corpo do bicho ~30×30 acima do pé; plantas e balão do lote: ±50 em x, de 90 acima do centro até 20 abaixo.
    const bad: string[] = []
    for (const [kind, a] of Object.entries(ANIMAL_AREAS)) {
      for (let x = a.x0; x <= a.x1; x += 5) for (let y = a.y0; y <= a.y1; y += 5) {
        if ((a.poly && !inPoly(x, y, a.poly)) || pastureBlocked(x, y)) continue
        for (let i = 0; i < MAX_FIELD_PLOTS; i++) {
          const p = plotPos(i)
          if (y < p.y + 33 && x + 15 > p.x - 50 && x - 15 < p.x + 50 && y > p.y - 90 && y - 30 < p.y + 20) bad.push(`${kind} em (${x}, ${y}) atrás do lote ${i}`)
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([])
  })
})
