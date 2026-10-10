// Os 20 sons dos bichos (10 bichos × cutucar/pegar): todos tocam algo, e o mudo dos efeitos cala todos.
import { beforeEach, describe, expect, it, vi } from 'vitest'

let oscillators = 0
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} })
const node = () => ({ connect: (n: unknown) => n, start() {}, stop() {}, gain: param(), frequency: param(), Q: param(), type: '', buffer: null })
class FakeAudio {
  currentTime = 0; sampleRate = 8000; state = 'running'; destination = node()
  createOscillator() { oscillators++; return node() }
  createGain() { return node() }
  createBiquadFilter() { return node() }
  createBufferSource() { return node() }
  createBuffer(_c: number, len: number) { return { getChannelData: () => new Float32Array(len) } }
  resume() {}
}
const store = new Map<string, string>()
vi.stubGlobal('window', {})
vi.stubGlobal('AudioContext', FakeAudio)
vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) })

const sfx = await import('../src/game/sfx')
const ALL = (['chicken', 'cow', 'pig', 'sheep', 'dog', 'donkey', 'peacock', 'duck', 'rabbit', 'goat'] as const).flatMap((k) => (['poke', 'pick'] as const).map((a) => [k, a] as const))

beforeEach(() => { oscillators = 0 })

describe('sons dos bichos', () => {
  it('cada um dos 20 toca; latido muda pela raça', () => {
    store.set('cf:sound', JSON.stringify({ sfx: true, music: false }))
    sfx.unlock()
    expect(ALL).toHaveLength(20)
    for (const [k, a] of ALL) {
      oscillators = 0
      sfx.playAnimal(k, a, 'pastor')
      expect(oscillators, `${k}/${a}`).toBeGreaterThan(0)
    }
  })

  it('mudo dos efeitos cala os 20', () => {
    store.set('cf:sound', JSON.stringify({ sfx: false, music: false }))
    sfx.unlock()
    for (const [k, a] of ALL) sfx.playAnimal(k, a)
    expect(oscillators).toBe(0)
  })
})
