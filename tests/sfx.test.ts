// Efeitos e música (frente P): todo efeito toca algo, o mudo e o volume valem por barramento,
// o anti-repetição segura rajadas, as preferências ficam por jogador e as três músicas são válidas.
import { beforeEach, describe, expect, it, vi } from 'vitest'

let started = 0
let clock = 0
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} })
const node = () => ({ connect: (n: unknown) => n, disconnect() {}, start() { started++ }, stop() {}, gain: param(), frequency: param(), detune: param(), Q: param(), type: '', buffer: null })
class FakeAudio {
  get currentTime() { return clock }
  set currentTime(v: number) { clock = v }
  sampleRate = 8000; state = 'running'; destination = node()
  createOscillator() { return node() }
  createGain() { return node() }
  createBiquadFilter() { return node() }
  createBufferSource() { return node() }
  createBuffer(_c: number, len: number) { const d = new Float32Array(len); return { getChannelData: () => d } }
  resume() {}
}
const store = new Map<string, string>()
vi.stubGlobal('window', {})
vi.stubGlobal('AudioContext', FakeAudio)
vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) })

store.set('cf:sound', JSON.stringify({ sfx: true, music: false }))
const sfx = await import('../src/game/sfx')
const music = await import('../src/game/music')

beforeEach(() => { started = 0 })

describe('efeitos', () => {
  it('cada efeito da lista toca algo', () => {
    sfx.unlock()
    expect(sfx.SFX_LIST.length).toBeGreaterThanOrEqual(35)
    for (const s of sfx.SFX_LIST) {
      started = 0
      clock += 1 // um efeito por segundo: longe do anti-repetição
      sfx.play(s)
      expect(started, s).toBeGreaterThan(0)
    }
  })

  it('bichos novos (burro, pato, cabra, coelho, pavão, abelha) têm cutucar e pegar', () => {
    for (const k of ['donkey', 'duck', 'goat', 'rabbit', 'peacock', 'bee'] as const) for (const a of ['poke', 'pick'] as const) {
      started = 0
      clock += 1
      sfx.playAnimal(k, a)
      expect(started, `${k}/${a}`).toBeGreaterThan(0)
    }
  })

  it('mudo dos efeitos cala play e playAnimal', () => {
    sfx.setPrefs({ sfx: false })
    clock += 1
    sfx.play('harvest'); sfx.playAnimal('donkey', 'poke')
    expect(started).toBe(0)
    sfx.setPrefs({ sfx: true })
  })
})

describe('anti-repetição', () => {
  it('play: o 2º "pop" logo em seguida é descartado', () => {
    clock += 5
    sfx.play('pop'); const first = started
    sfx.play('pop')
    expect(first).toBeGreaterThan(0)
    expect(started).toBe(first)
  })
  it('mesmo som dentro do intervalo é descartado; depois volta', () => {
    expect(sfx.gate('x', 100, 0.1)).toBe(true)
    expect(sfx.gate('x', 100.05, 0.1)).toBe(false)
    expect(sfx.gate('x', 100.2, 0.1)).toBe(true)
  })
  it('no máximo 5 efeitos começam a cada 150 ms', () => {
    const ok = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, i) => sfx.gate(id, 200 + i * 0.01))
    expect(ok.filter(Boolean)).toHaveLength(5)
    expect(sfx.gate('h', 200.5)).toBe(true)
  })
})

describe('preferências por jogador', () => {
  it('cada jogador guarda as suas; quem não tem herda as do aparelho', () => {
    sfx.setSoundUser(null)
    sfx.setPrefs({ musicVol: 0.6, sfxVol: 0.7 })
    sfx.setSoundUser('Ana')
    expect(sfx.prefs().musicVol).toBe(0.6)
    sfx.setPrefs({ music: false, musicVol: 0.2 })
    expect(sfx.prefs()).toMatchObject({ music: false, musicVol: 0.2, sfxVol: 0.7 })
    sfx.setSoundUser('bia')
    expect(sfx.prefs()).toMatchObject({ musicVol: 0.6, sfxVol: 0.7 })
    sfx.setSoundUser('ANA')
    expect(sfx.prefs().musicVol).toBe(0.2)
    sfx.setSoundUser(null)
  })
  it('volume fora de 0..1 ou lixo no armazenamento volta ao padrão', () => {
    store.set('cf:sound:zé', '{"sfxVol": 7, "musicVol": "alto"}')
    sfx.setSoundUser('zé')
    const p = sfx.prefs()
    expect(p.sfxVol).toBe(1)
    expect(p.musicVol).toBeGreaterThanOrEqual(0)
    expect(p.musicVol).toBeLessThanOrEqual(1)
    store.set('cf:sound:zé', '{quebrado')
    expect(() => sfx.prefs()).not.toThrow()
    sfx.setSoundUser(null)
  })
  it('sem preferência salva: música desligada, efeitos ligados (C12)', () => {
    store.delete('cf:sound')
    sfx.setSoundUser('novata')
    expect(sfx.prefs()).toEqual({ sfx: true, music: false, sfxVol: 0.8, musicVol: 0.5 })
    // Mexer só no volume dos efeitos não liga a música.
    sfx.setPrefs({ sfxVol: 0.4 })
    expect(sfx.prefs()).toMatchObject({ sfx: true, music: false, sfxVol: 0.4 })
    sfx.setSoundUser(null)
  })
  it('quem já escolheu música ligada continua com ela', () => {
    store.set('cf:sound:veterano', JSON.stringify({ sfx: true, music: true, sfxVol: 0.8, musicVol: 0.5 }))
    sfx.setSoundUser('veterano')
    expect(sfx.prefs()).toMatchObject({ sfx: true, music: true })
    sfx.setSoundUser(null)
    // Preferência do aparelho com música ligada vale para o jogador sem preferência própria.
    store.set('cf:sound', JSON.stringify({ music: true }))
    sfx.setSoundUser('herdeira')
    expect(sfx.prefs()).toMatchObject({ sfx: true, music: true })
    sfx.setSoundUser(null)
  })
})

describe('música', () => {
  it('as três músicas têm compassos de 8 colcheias e acordes conhecidos', () => {
    for (const [mode, song] of Object.entries(music.SONGS)) {
      expect(song.bars.length, mode).toBeGreaterThanOrEqual(8)
      for (const b of song.bars) { expect(() => music.parseBar(b.mel)).not.toThrow(); expect(() => music.barChords(b.chord)).not.toThrow() }
    }
  })
  it('notas e durações', () => {
    expect(music.midi('A4')).toBe(69)
    expect(music.midi('F#5')).toBe(78)
    expect(music.midi('Bb5')).toBe(82)
    expect(music.parseBar('E5 G5 C6 - B5 . E5 -')).toEqual([[0, 1, 76], [1, 1, 79], [2, 2, 84], [4, 1, 83], [6, 2, 76]])
    expect(() => music.parseBar('C5 D5')).toThrow()
  })
  it('cada colcheia de cada música toca sem erro, e a melodia soa', () => {
    const ctx = new FakeAudio() as unknown as AudioContext
    const kit = { ctx, noise: ctx.createBuffer(1, 8000, 8000) }
    for (const song of Object.values(music.SONGS)) {
      started = 0
      for (let step = 0; step < song.bars.length * 8; step++) music.playStep(kit, ctx.destination, song, step, step * 0.25)
      expect(started).toBeGreaterThan(song.bars.length * 4)
    }
  })
  it('o tocador troca de modo e para', () => {
    vi.useFakeTimers()
    const ctx = new FakeAudio() as unknown as AudioContext
    const m = music.createMusic(ctx, ctx.destination, ctx.createBuffer(1, 8000, 8000))
    m.play('day'); expect(m.mode).toBe('day')
    started = 0
    clock += 2
    vi.advanceTimersByTime(120)
    expect(started).toBeGreaterThan(0)
    m.play('night'); expect(m.mode).toBe('night')
    m.stop(); expect(m.mode).toBeNull()
    vi.useRealTimers()
  })
})
