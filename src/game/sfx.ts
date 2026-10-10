// Sons sintetizados na hora com Web Audio: nenhum arquivo de áudio, nada de terceiros
// (sem direito autoral envolvido). Cada efeito é uma receita curta de osciladores e ruído,
// composta para o remake no caráter dos jogos de fazenda em Flash (curto, brilhante, de desenho animado).
'use client'

import { createMusic, type MusicMode } from './music'

export type Sfx =
  // interface
  | 'click' | 'tab' | 'open' | 'close' | 'error' | 'deny' | 'notify'
  // horta
  | 'plant' | 'dig' | 'pull' | 'water' | 'spray' | 'fertilize' | 'harvest' | 'pop' | 'steal' | 'pest' | 'weed' | 'love'
  // cachorro
  | 'bark' | 'bite' | 'feed_dog'
  // dinheiro e progresso
  | 'coin' | 'sell' | 'buy' | 'levelup' | 'expand' | 'claim' | 'bonus'
  // social
  | 'gift' | 'flower' | 'thank' | 'friend'
  // bichos produtivos
  | 'animal_buy' | 'feed' | 'collect' | 'grow'
  // legado (vozes simples; os bichos de verdade usam playAnimal)
  | 'moo' | 'cluck' | 'baa' | 'oink'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let sfxBus: GainNode | null = null
let musicBus: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let music: ReturnType<typeof createMusic> | null = null
let musicMode: MusicMode = 'day'

// ---------- preferências (por usuário, no aparelho) ----------

export type Prefs = { sfx: boolean; music: boolean; sfxVol: number; musicVol: number }
// Música desligada por padrão (C12): música sozinha incomoda no celular em público.
// Sem migração: a preferência só é gravada quando a pessoa mexe na janela Som, então `music: true` salvo foi escolha dela.
const DEFAULTS: Prefs = { sfx: true, music: false, sfxVol: 0.8, musicVol: 0.5 }
const BASE_KEY = 'cf:sound'
let key = BASE_KEY

/** Troca o dono das preferências (handle do jogador). Sem preferência própria, herda a do aparelho. */
export function setSoundUser(user: string | null | undefined) {
  const next = user ? `${BASE_KEY}:${user.toLowerCase()}` : BASE_KEY
  if (next === key) return
  key = next
  applyPrefs(prefs())
}

function read(k: string): Partial<Prefs> | null {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as Partial<Prefs>) : null } catch { return null }
}
const clamp01 = (n: unknown, d: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : d)

export function prefs(): Prefs {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS }
  const p = { ...DEFAULTS, ...(read(BASE_KEY) ?? {}), ...(key !== BASE_KEY ? read(key) ?? {} : {}) }
  return { sfx: p.sfx !== false, music: p.music === true, sfxVol: clamp01(p.sfxVol, DEFAULTS.sfxVol), musicVol: clamp01(p.musicVol, DEFAULTS.musicVol) }
}

export function setPrefs(p: Partial<Prefs>) {
  const next = { ...prefs(), ...p }
  localStorage.setItem(key, JSON.stringify(next))
  applyPrefs(next)
  return next
}

function fade(p: AudioParam, v: number, dur: number) {
  const t = ctx!.currentTime
  p.setValueAtTime(p.value, t)
  p.linearRampToValueAtTime(v, t + dur)
}

// Volume perceptivo: o controle deslizante vai em curva (x²), como os mixers.
function applyPrefs(p: Prefs) {
  if (!ctx || !sfxBus || !musicBus) return
  fade(sfxBus.gain, p.sfx ? p.sfxVol ** 2 : 0, 0.05)
  fade(musicBus.gain, p.music ? p.musicVol ** 2 * 0.9 : 0, 0.3)
  if (p.music && p.musicVol > 0) music?.play(musicMode)
  else music?.stop()
}

/** Qual música tocar: dia, noite ou visitando amigo. Pode ser chamado antes do primeiro toque. */
export function setMusicMode(mode: MusicMode) {
  musicMode = mode
  const p = prefs()
  if (music && p.music && p.musicVol > 0) music.play(mode)
}

/** Noite pela hora de Brasília (mesmos limites da luz da cena: escurece às 19h, clareia às 6h). */
export function isNightBrasilia(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' }).format(now))
  return h >= 19 || h < 6
}

/**
 * Monta o áudio (contexto, mixer, ruído, música) ainda suspenso: o navegador só deixa tocar depois de um gesto.
 * Chamar em tempo ocioso depois de a fazenda abrir: criar o AudioContext no próprio toque custava ~100 ms no
 * celular com CPU 4× (a tarefa longa do 1º gesto; Evolução 12). No toque, unlock() só dá o resume().
 */
export function prepareAudio() {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = 0.7
    master.connect(ctx.destination)
    sfxBus = ctx.createGain()
    musicBus = ctx.createGain()
    sfxBus.gain.value = 0
    musicBus.gain.value = 0
    sfxBus.connect(master)
    musicBus.connect(master)
    // Um segundo de ruído branco reaproveitado por todos os efeitos (começando em ponto aleatório).
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    music = createMusic(ctx, musicBus, noiseBuf)
    const p = prefs()
    sfxBus.gain.value = p.sfx ? p.sfxVol ** 2 : 0
    applyPrefs(p)
    // QA (só em desenvolvimento): estado do áudio no console.
    if (process.env.NODE_ENV === 'development') (window as unknown as { __cfAudio?: unknown }).__cfAudio = { ctx, music, sfxBus, musicBus, play }
  }
}

/** O navegador só libera áudio depois de um gesto do usuário: chamar no primeiro toque (a música começa aí). */
export function unlock() {
  prepareAudio()
  if (ctx?.state === 'suspended') void ctx.resume()
}

// ---------- blocos de síntese ----------

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.3, slideTo?: number) {
  const o = ctx!.createOscillator(), g = ctx!.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, start)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur)
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(vol, start + Math.min(0.01, dur / 3))
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  o.connect(g).connect(sfxBus!)
  o.start(start)
  o.stop(start + dur + 0.02)
}

/** Sino/moeda: seno + parciais inarmônicos curtos (o brilho metálico). */
function bell(freq: number, start: number, dur: number, vol = 0.2) {
  tone(freq, start, dur, 'sine', vol)
  tone(freq * 2.76, start, dur * 0.4, 'sine', vol * 0.3)
  tone(freq * 5.4, start, dur * 0.2, 'sine', vol * 0.12)
}

/** Marimba (a "voz" dos acertos): seno com toque de baqueta. */
function mallet(freq: number, start: number, dur = 0.25, vol = 0.25) {
  tone(freq, start, dur, 'sine', vol)
  tone(freq * 4, start, 0.05, 'sine', vol * 0.3)
}

function noise(start: number, dur: number, vol = 0.2, filter = 2000, q = 1, type: BiquadFilterType = 'bandpass', sweepTo?: number) {
  const src = ctx!.createBufferSource(), f = ctx!.createBiquadFilter(), g = ctx!.createGain()
  src.buffer = noiseBuf
  f.type = type
  f.frequency.setValueAtTime(filter, start)
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, start + dur)
  f.Q.value = q
  g.gain.setValueAtTime(vol, start)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  src.connect(f).connect(g).connect(sfxBus!)
  src.start(start, Math.random() * 0.4, dur + 0.05)
}

const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12) // MIDI → Hz
const arp = (notes: number[], start: number, step: number, dur: number, vol = 0.22) => notes.forEach((n, i) => mallet(NOTE(n), start + i * step, dur, vol))

// ---------- receitas ----------

const RECIPES: Record<Sfx, (t: number) => void> = {
  // Toque de madeira curtinho.
  click: (t) => { tone(1250, t, 0.035, 'sine', 0.16, 900); noise(t, 0.015, 0.05, 3000, 2) },
  tab: (t) => tone(1600, t, 0.025, 'triangle', 0.08),
  // Janela abrindo: "plim" subindo (sol→ré) com um sopro de ar; fechando: o contrário.
  open: (t) => { noise(t, 0.12, 0.05, 900, 0.8, 'bandpass', 3500); mallet(NOTE(79), t + 0.02, 0.12, 0.13); mallet(NOTE(86), t + 0.08, 0.18, 0.13) },
  close: (t) => { noise(t, 0.1, 0.04, 3000, 0.8, 'bandpass', 800); mallet(NOTE(84), t, 0.1, 0.1); mallet(NOTE(77), t + 0.06, 0.14, 0.1) },
  // Erro: "bonk" grave em duas notas descendo; recusa leve (balão do lote): "hã-hã" suave.
  error: (t) => { tone(220, t, 0.12, 'square', 0.09, 200); tone(165, t + 0.12, 0.22, 'square', 0.09, 140) },
  deny: (t) => { tone(520, t, 0.08, 'triangle', 0.12); tone(440, t + 0.1, 0.12, 'triangle', 0.12) },
  notify: (t) => { bell(NOTE(81), t, 0.3, 0.14); bell(NOTE(76), t + 0.14, 0.4, 0.14) },

  // Semente na terra: baque abafado + "tic" do grão.
  plant: (t) => { tone(180, t, 0.12, 'sine', 0.35, 90); noise(t, 0.09, 0.14, 500, 1, 'lowpass'); tone(1500, t + 0.06, 0.03, 'sine', 0.08) },
  // Pá/limpar lote: duas raspadas na terra + baque.
  dig: (t) => { noise(t, 0.1, 0.16, 1400, 1.2); noise(t + 0.14, 0.12, 0.16, 1100, 1.2); tone(140, t + 0.14, 0.1, 'sine', 0.25, 80) },
  // Arrancar mato: rasgo de folhas subindo + "pop" da raiz.
  pull: (t) => { noise(t, 0.2, 0.18, 700, 0.9, 'bandpass', 3000); tone(300, t + 0.17, 0.08, 'sine', 0.22, 900) },
  // Regador: gotas aleatórias sobre um chiado de água.
  water: (t) => {
    noise(t, 0.55, 0.07, 2600, 0.6)
    for (let i = 0; i < 9; i++) tone(700 + Math.random() * 900, t + 0.03 + i * 0.055, 0.06, 'sine', 0.1, 350 + Math.random() * 200)
  },
  // Borrifador: duas bombadas de spray.
  spray: (t) => { noise(t, 0.22, 0.16, 5000, 0.7, 'highpass'); noise(t + 0.28, 0.22, 0.16, 5200, 0.7, 'highpass') },
  // Adubo: "puf" do saco + brilhinho subindo.
  fertilize: (t) => { noise(t, 0.16, 0.18, 400, 0.8, 'lowpass'); arp([84, 88, 91], t + 0.08, 0.05, 0.12, 0.08) },
  // Colher: "plóc" do fruto soltando + arpejo alegre de marimba.
  harvest: (t) => { tone(600, t, 0.06, 'sine', 0.3, 1200); arp([72, 76, 79, 84], t + 0.05, 0.06, 0.2, 0.2) },
  // O "x N" chegando no Depósito: bolha que estoura subindo.
  pop: (t) => { tone(500, t, 0.07, 'sine', 0.25, 1400); tone(1800, t + 0.05, 0.04, 'sine', 0.06) },
  // Roubar: pizzicato "na ponta dos pés" descendo + vupt de sumir.
  steal: (t) => {
    [76, 74, 71, 67].forEach((n, i) => tone(NOTE(n), t + i * 0.08, 0.07, 'triangle', 0.16))
    noise(t + 0.32, 0.14, 0.12, 1200, 1, 'bandpass', 4000)
  },
  // Soltar praga na horta alheia: zumbido de bicho (serra com vibrato rápido).
  pest: (t) => { for (let i = 0; i < 6; i++) tone(i % 2 ? 260 : 290, t + i * 0.05, 0.06, 'sawtooth', 0.05) },
  // Plantar mato: "boing" de broto.
  weed: (t) => { tone(260, t, 0.25, 'sine', 0.22, 760); tone(780, t + 0.24, 0.08, 'sine', 0.08, 620) },
  // Adubar com carinho: duas notas doces e brilho.
  love: (t) => { bell(NOTE(84), t, 0.3, 0.12); bell(NOTE(88), t + 0.12, 0.4, 0.12) },

  // Latido genérico (o da raça vem de playAnimal('dog')).
  bark: (t) => [0, 0.22].forEach((d) => { tone(380, t + d, 0.12, 'sawtooth', 0.25, 160); noise(t + d, 0.1, 0.25, 700, 2) }),
  // Mordida: rosnado curto + estalo dos dentes + apito de "ai!" caindo.
  bite: (t) => {
    tone(95, t, 0.25, 'sawtooth', 0.12, 80)
    noise(t + 0.22, 0.05, 0.3, 2500, 2)
    tone(1400, t + 0.3, 0.35, 'triangle', 0.12, 500)
  },
  // Ração na tigela: tilintar de metal (dois parciais inarmônicos) + latidinho feliz.
  feed_dog: (t) => {
    for (let i = 0; i < 4; i++) noise(t + i * 0.04, 0.03, 0.08, 5000, 4)
    bell(1180, t + 0.05, 0.25, 0.08)
    tone(560, t + 0.35, 0.09, 'sawtooth', 0.12, 320)
  },

  // Moeda: "dim" em duas alturas (si→mi), quadrada suave + sino.
  coin: (t) => { tone(988, t, 0.07, 'square', 0.08); tone(1319, t + 0.06, 0.25, 'square', 0.08); bell(1319, t + 0.06, 0.3, 0.06) },
  // Vender: chuvinha de moedas.
  sell: (t) => { for (let i = 0; i < 5; i++) { tone(988 + i * 40, t + i * 0.07, 0.06, 'square', 0.06); bell(1319 + i * 60, t + i * 0.07 + 0.04, 0.2, 0.05) } },
  // Comprar: caixa registradora (clique da gaveta + "tlim-tlim").
  buy: (t) => { noise(t, 0.04, 0.15, 2500, 3); tone(140, t + 0.02, 0.06, 'square', 0.06); bell(NOTE(88), t + 0.08, 0.25, 0.12); bell(NOTE(93), t + 0.16, 0.4, 0.12) },
  // Subir de nível: fanfarra (arpejo + acorde sustentado com brilho).
  levelup: (t) => {
    ;[72, 76, 79, 84].forEach((n, i) => { tone(NOTE(n), t + i * 0.09, 0.14, 'square', 0.07); mallet(NOTE(n), t + i * 0.09, 0.2, 0.15) })
    ;[72, 76, 79, 84].forEach((n) => tone(NOTE(n), t + 0.42, 0.8, 'triangle', 0.08))
    arp([96, 100, 103, 108], t + 0.45, 0.06, 0.25, 0.05)
  },
  // Expandir terreno: duas marteladas + "tchã-rã" curto.
  expand: (t) => { [0, 0.16].forEach((d) => { tone(200, t + d, 0.06, 'sine', 0.3, 90); noise(t + d, 0.05, 0.15, 1800, 2) }); arp([67, 72, 76, 79], t + 0.36, 0.07, 0.25, 0.18) },
  // Missão cumprida: "ta-da" de 3 notas.
  claim: (t) => { mallet(NOTE(79), t, 0.12, 0.2); mallet(NOTE(79), t + 0.1, 0.1, 0.2); mallet(NOTE(84), t + 0.2, 0.45, 0.24); bell(NOTE(84), t + 0.2, 0.5, 0.08) },
  // Bônus do dia: cascata de sininhos.
  bonus: (t) => { for (let i = 0; i < 7; i++) bell(NOTE([84, 86, 88, 91, 93, 96, 100][i]), t + i * 0.06, 0.3, 0.08) },

  // Presente: varinha mágica (glissando subindo) + sino.
  gift: (t) => { tone(600, t, 0.3, 'sine', 0.1, 2400); bell(NOTE(91), t + 0.25, 0.5, 0.12) },
  flower: (t) => { arp([79, 83, 86, 91], t, 0.07, 0.3, 0.12); bell(NOTE(95), t + 0.28, 0.5, 0.06) },
  thank: (t) => { bell(NOTE(84), t, 0.35, 0.1); bell(NOTE(91), t + 0.1, 0.5, 0.1) },
  friend: (t) => { mallet(NOTE(76), t, 0.12, 0.2); mallet(NOTE(84), t + 0.1, 0.3, 0.2) },

  // Bichos produtivos. Comprar bicho: caixa registradora + "chegou!" saltitante.
  animal_buy: (t) => { RECIPES.buy(t); arp([72, 79, 76, 84], t + 0.4, 0.08, 0.2, 0.16) },
  // Alimentar: três mastigadas + "hum" de satisfeito.
  feed: (t) => { for (let i = 0; i < 3; i++) noise(t + i * 0.11, 0.07, 0.18, 900, 1.5, 'lowpass'); tone(330, t + 0.36, 0.18, 'triangle', 0.1, 392) },
  // Pegar produto (ovo, leite, lã, mel): "plim" de coleta.
  collect: (t) => { tone(700, t, 0.05, 'sine', 0.25, 1300); mallet(NOTE(88), t + 0.04, 0.2, 0.18); mallet(NOTE(91), t + 0.1, 0.25, 0.14) },
  // Bicho cresceu de estágio: glissando de brilho + acorde maior.
  grow: (t) => { tone(400, t, 0.4, 'triangle', 0.08, 1600); [72, 76, 79].forEach((n) => mallet(NOTE(n), t + 0.35, 0.5, 0.12)) },

  moo: (t) => { tone(140, t, 0.7, 'sawtooth', 0.18, 110); tone(142, t, 0.7, 'sine', 0.2, 112) },
  cluck: (t) => [0, 0.12, 0.2].forEach((d) => tone(700, t + d, 0.06, 'square', 0.1, 1100)),
  baa: (t) => { tone(330, t, 0.5, 'sawtooth', 0.12); for (let i = 0; i < 8; i++) tone(330 + (i % 2) * 25, t + i * 0.05, 0.05, 'sine', 0.08) },
  oink: (t) => [0, 0.18].forEach((d) => { tone(220, t + d, 0.12, 'sawtooth', 0.15, 160); noise(t + d, 0.1, 0.12, 500, 3) }),
}
export const SFX_LIST = Object.keys(RECIPES) as Sfx[]

// ---------- anti-repetição ----------
// O mesmo som não repete antes do intervalo mínimo (cliques em rajada, várias moedas na mesma resposta),
// e no máximo 5 efeitos começam a cada 150 ms (o resto é descartado, nunca enfileirado).
const MIN_GAP: Partial<Record<Sfx, number>> = {
  click: 0.06, tab: 0.06, pop: 0.05, coin: 0.09, open: 0.15, close: 0.15, error: 0.3, deny: 0.3, notify: 0.6,
  levelup: 1.5, bonus: 1, claim: 0.4, sell: 0.5, bark: 0.4, bite: 0.6, water: 0.25, spray: 0.3,
}
const DEFAULT_GAP = 0.08
const lastAt = new Map<string, number>()
let recent: number[] = []

/** true se o som pode tocar agora (e registra o toque). Exportado para teste. */
export function gate(id: string, now: number, gap = DEFAULT_GAP, cap = true) {
  const last = lastAt.get(id)
  if (last != null && now - last < gap && now >= last) return false
  recent = recent.filter((r) => now - r < 0.15 && now >= r)
  if (cap && recent.length >= 5) return false
  recent.push(now)
  lastAt.set(id, now)
  return true
}

export function play(s: Sfx) {
  if (!ctx || !sfxBus || !prefs().sfx) return
  const t = ctx.currentTime
  if (!gate(s, t, MIN_GAP[s] ?? DEFAULT_GAP)) return
  RECIPES[s](t + 0.005)
}

// ---------- vozes dos bichos (cutucar e pegar) ----------
// Cada bicho tem dois sons próprios, feitos aqui do zero: uma "voz" é um oscilador com curva de altura,
// filtro (o "formato da boca"), vibrato e tremolo opcionais, mais ruído filtrado para o sopro/raspado.

type Voice = {
  wave?: OscillatorType
  f: number[] // alturas (Hz) espalhadas igualmente ao longo da duração
  dur: number
  vol: number
  filter?: { type?: BiquadFilterType; f: number | [number, number]; q?: number } // [início, fim] = filtro abrindo/fechando
  vib?: [number, number] // vibrato [Hz, profundidade em Hz]
  am?: [number, number] // tremolo [Hz, profundidade 0..1]
}

function voice(start: number, v: Voice) {
  const c = ctx!
  const o = c.createOscillator(), env = c.createGain()
  o.type = v.wave ?? 'sawtooth'
  o.frequency.setValueAtTime(v.f[0], start)
  v.f.forEach((f, i) => { if (i) o.frequency.linearRampToValueAtTime(f, start + (v.dur * i) / (v.f.length - 1)) })
  const stop = start + v.dur + 0.05
  if (v.vib) {
    const lfo = c.createOscillator(), depth = c.createGain()
    lfo.frequency.value = v.vib[0]
    depth.gain.value = v.vib[1]
    lfo.connect(depth).connect(o.frequency)
    lfo.start(start); lfo.stop(stop)
  }
  let out: AudioNode = o
  if (v.filter) {
    const f = c.createBiquadFilter()
    f.type = v.filter.type ?? 'bandpass'
    f.Q.value = v.filter.q ?? 1
    const [f0, f1] = Array.isArray(v.filter.f) ? v.filter.f : [v.filter.f, v.filter.f]
    f.frequency.setValueAtTime(f0, start)
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, start + v.dur)
    out = out.connect(f)
  }
  if (v.am) {
    const trem = c.createGain(), lfo = c.createOscillator(), depth = c.createGain()
    trem.gain.value = 1 - v.am[1] / 2
    lfo.frequency.value = v.am[0]
    depth.gain.value = v.am[1] / 2
    lfo.connect(depth).connect(trem.gain)
    lfo.start(start); lfo.stop(stop)
    out = out.connect(trem)
  }
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(v.vol, start + Math.min(0.03, v.dur / 4))
  env.gain.setValueAtTime(v.vol, start + v.dur * 0.7)
  env.gain.exponentialRampToValueAtTime(0.0001, start + v.dur)
  out.connect(env).connect(sfxBus!)
  o.start(start)
  o.stop(stop)
}

export type AnimalSfxKind = 'cow' | 'sheep' | 'pig' | 'chicken' | 'dog' | 'donkey' | 'duck' | 'goat' | 'rabbit' | 'peacock' | 'bee'
export type AnimalAct = 'poke' | 'pick'

/** Altura base do latido por raça: Pastor grave, Vira-lata médio, Salsicha agudo. */
const BARK_HZ: Record<string, number> = { pastor: 250, vira_lata: 360, salsicha: 500 }

const GUARD_SFX: Record<string, (t: number) => void> = {
  guarda_cabra: (t) => voice(t, { f: [420, 400, 380], dur: 0.45, vol: 0.18, filter: { f: 1600, q: 3 }, am: [14, 0.85] }),
  guarda_cavalo: (t) => voice(t, { wave: 'square', f: [900, 1300, 1000, 600], dur: 0.7, vol: 0.1, filter: { f: 1800, q: 2 }, vib: [11, 40] }),
  guarda_avestruz: (t) => [0, 0.3].forEach((d) => voice(t + d, { f: [110, 80], dur: 0.25, vol: 0.3, filter: { type: 'lowpass', f: 400, q: 2 } })),
}

/** Síntese dos sons dos bichos. `t` = agora no relógio do áudio. */
const ANIMAL_SFX: Record<AnimalSfxKind, Record<AnimalAct, (t: number, breed?: string) => void>> = {
  chicken: {
    // Cacarejo: três "có" curtos subindo e um "cóóó" mais longo no fim.
    poke: (t) => {
      [0, 0.1, 0.19].forEach((d) => voice(t + d, { wave: 'square', f: [520, 880], dur: 0.06, vol: 0.12, filter: { f: 1500, q: 3 } }))
      voice(t + 0.3, { wave: 'square', f: [600, 1250, 900], dur: 0.2, vol: 0.13, filter: { f: 1600, q: 3 } })
    },
    // Pegou: cacarejo assustado e rápido + bater de asas (rajadas de ruído agudo).
    pick: (t) => {
      for (let i = 0; i < 6; i++) voice(t + i * 0.055, { wave: 'square', f: i % 2 ? [1300, 1000] : [900, 1400], dur: 0.045, vol: 0.11, filter: { f: 2000, q: 2 } })
      for (let i = 0; i < 4; i++) noise(t + 0.05 + i * 0.07, 0.05, 0.12, 3500, 0.8, 'highpass')
    },
  },
  cow: {
    // Mugido curto: dente-de-serra grave descendo, filtro abrindo ("mmm-ôô") e vibrato lento.
    poke: (t) => voice(t, { f: [125, 118, 96], dur: 0.6, vol: 0.28, filter: { type: 'lowpass', f: [280, 850], q: 4 }, vib: [5, 2.5] }),
    // Pegou: mugido indignado, mais longo, subindo no meio ("mmmUUUU?").
    pick: (t) => voice(t, { f: [100, 150, 160, 115], dur: 0.95, vol: 0.32, filter: { type: 'lowpass', f: [260, 1100], q: 5 }, vib: [6, 4] }),
  },
  pig: {
    // Grunhido: dois "ronc" ásperos (tremolo rápido = textura de ronco) com sopro grave.
    poke: (t) => [0, 0.17].forEach((d) => {
      voice(t + d, { f: [125, 95], dur: 0.13, vol: 0.26, filter: { type: 'lowpass', f: 650, q: 2 }, am: [38, 0.9] })
      noise(t + d, 0.11, 0.1, 420, 2.5)
    }),
    // Pegou: guincho agudo trêmulo.
    pick: (t) => voice(t, { wave: 'square', f: [850, 1400, 1250, 1000], dur: 0.5, vol: 0.1, filter: { f: 1800, q: 1.5 }, vib: [13, 60] }),
  },
  sheep: {
    // Balido: "mééé" com tremolo de ~9 Hz (o tremido da voz da ovelha) e filtro nasal.
    poke: (t) => voice(t, { f: [310, 300, 285], dur: 0.55, vol: 0.2, filter: { f: 1300, q: 2.5 }, am: [9, 0.7] }),
    // Pegou: balido mais agudo e mais tremido, subindo ("MÉÉÉ?").
    pick: (t) => voice(t, { f: [350, 430, 420], dur: 0.75, vol: 0.22, filter: { f: [1300, 1700], q: 2.5 }, am: [12, 0.85], vib: [6, 8] }),
  },
  dog: {
    // Latido curto: queda rápida de altura + estalo de ruído; altura pela raça. Guardas no lugar do cachorro: a cabra
    // bale como a cabra, o cavalo relincha e o avestruz faz o "bum" grave dele.
    poke: (t, breed) => {
      if (GUARD_SFX[breed ?? '']) return GUARD_SFX[breed!](t)
      const f = BARK_HZ[breed ?? ''] ?? BARK_HZ.vira_lata
      voice(t, { f: [f, f * 1.15, f * 0.55], dur: 0.13, vol: 0.28, filter: { f: f * 2.6, q: 1.2 } })
      noise(t, 0.08, 0.2, f * 2.2, 1.8)
    },
    // Pegou: ganidinho ("ain?") — assobio que sobe e cai, com vibrato.
    pick: (t, breed) => {
      if (GUARD_SFX[breed ?? '']) return GUARD_SFX[breed!](t)
      const f = (BARK_HZ[breed ?? ''] ?? BARK_HZ.vira_lata) * 2.2
      voice(t, { wave: 'triangle', f: [f, f * 1.3, f * 0.9], dur: 0.45, vol: 0.18, vib: [7, f * 0.03] })
    },
  },
  donkey: {
    // Zurro "ri-ró": alterna inspiração aguda (assobio rouco) e expiração grave (serra), duas vezes.
    poke: (t) => [0, 0.5].forEach((d) => {
      voice(t + d, { f: [700, 820], dur: 0.2, vol: 0.14, filter: { f: 1600, q: 2 }, am: [30, 0.5] })
      voice(t + d + 0.22, { f: [260, 200], dur: 0.26, vol: 0.24, filter: { type: 'lowpass', f: [500, 1200], q: 3 } })
    }),
    // Pegou: zurro mais longo e indignado (três ciclos subindo).
    pick: (t) => [0, 0.42, 0.84].forEach((d, i) => {
      voice(t + d, { f: [760 + i * 60, 900 + i * 60], dur: 0.18, vol: 0.14, filter: { f: 1700, q: 2 }, am: [32, 0.5] })
      voice(t + d + 0.19, { f: [280, 210], dur: 0.22, vol: 0.24, filter: { type: 'lowpass', f: [500, 1300], q: 3 } })
    }),
  },
  duck: {
    // "Quá-quá": nasal (onda quadrada em passa-banda estreito) com queda curta.
    poke: (t) => [0, 0.18].forEach((d) => voice(t + d, { wave: 'square', f: [560, 470], dur: 0.12, vol: 0.12, filter: { f: 1100, q: 6 } })),
    pick: (t) => [0, 0.11, 0.22, 0.33].forEach((d) => voice(t + d, { wave: 'square', f: [650, 520], dur: 0.09, vol: 0.12, filter: { f: 1300, q: 6 } })),
  },
  goat: {
    // "Béé" mais áspero e rápido que a ovelha (tremolo de 14 Hz) e mais agudo.
    poke: (t) => voice(t, { f: [420, 400, 380], dur: 0.45, vol: 0.18, filter: { f: 1600, q: 3 }, am: [14, 0.85] }),
    pick: (t) => voice(t, { f: [460, 560, 520], dur: 0.6, vol: 0.2, filter: { f: [1600, 2100], q: 3 }, am: [16, 0.9], vib: [7, 10] }),
  },
  rabbit: {
    // Coelho quase não tem voz: fungadinha (ruído agudo em 3 sopros) e um pulinho no capim.
    poke: (t) => { for (let i = 0; i < 3; i++) noise(t + i * 0.07, 0.04, 0.09, 4200, 2); tone(300, t + 0.25, 0.06, 'sine', 0.15, 160) },
    pick: (t) => voice(t, { wave: 'triangle', f: [1500, 1900, 1400], dur: 0.18, vol: 0.1, vib: [20, 40] }),
  },
  peacock: {
    // Grito do pavão "mi-áu!" agudo e nasal; pegar: grito + farfalhar da cauda abrindo.
    poke: (t) => voice(t, { wave: 'square', f: [700, 1300, 1100], dur: 0.4, vol: 0.1, filter: { f: 1800, q: 4 } }),
    pick: (t) => {
      voice(t, { wave: 'square', f: [800, 1450, 1200], dur: 0.45, vol: 0.1, filter: { f: 2000, q: 4 } })
      noise(t + 0.3, 0.35, 0.12, 3000, 0.6, 'bandpass', 6000)
    },
  },
  bee: {
    // Zumbido: serra grave com vibrato rápido, passa-banda; pegar: zumbido bravo subindo.
    poke: (t) => voice(t, { f: [220, 235, 215], dur: 0.5, vol: 0.08, filter: { f: 900, q: 2 }, vib: [28, 12] }),
    pick: (t) => voice(t, { f: [230, 320, 300], dur: 0.6, vol: 0.09, filter: { f: 1100, q: 2 }, vib: [34, 20], am: [18, 0.4] }),
  },
}

/** Som do bicho (cutucar ou pegar). Respeita o mudo e o volume dos efeitos, como `play`. */
export function playAnimal(kind: AnimalSfxKind, act: AnimalAct, breed?: string) {
  if (!ctx || !sfxBus || !prefs().sfx) return
  const t = ctx.currentTime
  if (!gate(`${kind}:${act}`, t, 0.25, false)) return // a cena já espaça os toques por bicho (0,7 s)
  ANIMAL_SFX[kind][act](t, breed)
}
