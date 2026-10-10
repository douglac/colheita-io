import { Container, Sprite, Texture } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { ACCESSORY_BY_ID } from '../src/game/livestock'
import { layerFrame, layerOrder, syncLayer, type Layer } from '../src/scene/layers'
import { Wanderer } from '../src/scene/wander'

const tex = (): Texture => new Texture({ source: Texture.WHITE.source })
const set = (n: number) => Array.from({ length: n }, tex)
const frames = () => ({ walk: set(4), idle: set(2) })

describe('camada de acessório presa ao corpo', () => {
  it('usa o quadro de mesmo índice e lista do corpo', () => {
    const body = frames(), acc = frames()
    expect(layerFrame(body.walk[2], body, acc)).toBe(acc.walk[2])
    expect(layerFrame(body.idle[1], body, acc)).toBe(acc.idle[1])
    // Corpo em textura de fora da grade (sprite parado scene/cow.png, "mordendo" do guarda): sem quadro.
    expect(layerFrame(tex(), body, acc)).toBeNull()
  })

  it('copia âncora, escala, posição e giro do corpo; troca junto quando o corpo muda', () => {
    const body = frames(), acc = frames()
    const sp = new Sprite(body.idle[0])
    sp.anchor.set(0.5, 0.95)
    sp.scale.set(0.5)
    const layer: Layer = { sprite: new Sprite(acc.idle[0]), ...acc }
    syncLayer(sp, body, layer)
    expect(layer.sprite.visible).toBe(true)
    expect([layer.sprite.anchor.x, layer.sprite.anchor.y, layer.sprite.scale.x]).toEqual([0.5, 0.95, 0.5])
    // O corpo muda de escala, âncora e quadro depois de a camada existir (passou para a grade, idade, arrasto).
    sp.texture = body.walk[3]
    sp.anchor.set(0.5, 0.9)
    sp.scale.set(-0.48, 0.48)
    sp.position.set(2, -3)
    sp.rotation = 0.02
    syncLayer(sp, body, layer)
    expect(layer.sprite.texture).toBe(acc.walk[3])
    expect([layer.sprite.anchor.y, layer.sprite.scale.x, layer.sprite.scale.y]).toEqual([0.9, -0.48, 0.48])
    expect([layer.sprite.x, layer.sprite.y, layer.sprite.rotation]).toEqual([2, -3, 0.02])
  })

  it('fica escondida com o corpo no sprite parado ou sem quadros', () => {
    const body = frames(), acc = frames()
    const sp = new Sprite(tex())
    const layer: Layer = { sprite: new Sprite(acc.idle[0]), ...acc }
    syncLayer(sp, body, layer)
    expect(layer.sprite.visible).toBe(false)
    syncLayer(sp, undefined, layer)
    expect(layer.sprite.visible).toBe(false)
  })

  it('no bicho: segue andando e parado, e aparece só quando o sprite parado vira quadro', () => {
    const node = new Container(), body = new Container()
    node.addChild(body)
    const still = new Sprite(tex()) // scene/cow.png: outra moldura
    body.addChild(still)
    const w = new Wanderer(node, body, { x0: 0, y0: 0, x1: 200, y1: 100 }, 40, true)
    const acc = frames()
    const layer: Layer = { sprite: new Sprite(acc.idle[0]), ...acc }
    body.addChild(layer.sprite)
    w.layers = [layer]
    w.update(0.05)
    expect(layer.sprite.visible).toBe(false)
    // Os quadros chegam (refreshArt → setLooks): o corpo adota a grade e a camada aparece no quadro dele.
    const adult = frames()
    still.scale.set(0.5)
    w.setAnim({ sprite: still, walk: adult.walk, idle: adult.idle })
    expect(w.animated).toBe(true)
    expect(layer.sprite.visible).toBe(true)
    let walking = 0
    for (let i = 0; i < 600; i++) {
      w.update(0.05)
      const wi = adult.walk.indexOf(still.texture), ii = adult.idle.indexOf(still.texture)
      expect(wi >= 0 || ii >= 0).toBe(true)
      expect(layer.sprite.texture).toBe(wi >= 0 ? acc.walk[wi] : acc.idle[ii])
      expect(layer.sprite.scale.x).toBe(still.scale.x)
      if (wi >= 0) walking++
    }
    expect(walking).toBeGreaterThan(50)
  })
})

describe('ordem das camadas', () => {
  it('sela por baixo, pescoço no meio (lenço sob a coleira), cabeça por cima', () => {
    const ids = (l: string[]) => l.map((id) => ACCESSORY_BY_ID[id]).sort(layerOrder).map((a) => a.id)
    expect(ids(['donkey_chapeu', 'donkey_sino', 'donkey_sela'])).toEqual(['donkey_sela', 'donkey_sino', 'donkey_chapeu'])
    expect(ids(['cow_laco', 'cow_sino'])).toEqual(['cow_sino', 'cow_laco'])
    expect(ids(['dog_coleira_spike', 'dog_lenco'])).toEqual(['dog_lenco', 'dog_coleira_spike'])
  })
})
