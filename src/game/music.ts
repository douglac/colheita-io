// Música de fundo composta para o jogo: três cantigas em loop,
// no espírito das trilhas de jogo de fazenda em Flash (marimba saltitante, baixo "um-pá", chocalho).
//   dia     — Dó maior, 112 BPM, marimba + pizzicato nos contratempos + chocalho;
//   noite   — Fá maior, 72 BPM, caixinha de música sobre colchão suave e grilos ao longe;
//   visita  — Sol maior, 126 BPM, pizzicato "na ponta dos pés" com bloco de madeira (passear na horta alheia).
// Cada compasso tem 8 colcheias. Na melodia: nota ("E5", "F#4", "Bb5"), "-" segura a anterior, "." é pausa.

export type MusicMode = 'day' | 'night' | 'visit'

type Bar = { mel: string; chord: string }
export type Song = {
  bpm: number
  /** Atraso das colcheias pares (0 = reto, 0.2 = levemente "suingado"). */
  swing: number
  lead: 'marimba' | 'musicbox' | 'pizz'
  comp: 'offbeat' | 'pad' | 'walk'
  perc: 'shaker' | 'crickets' | 'wood'
  bars: Bar[]
}

// Acordes em MIDI (oitava 3/4); a fundamental (1º número) vai para o baixo uma oitava abaixo.
const CHORDS: Record<string, number[]> = {
  C: [48, 52, 55], Dm: [50, 53, 57], Em: [52, 55, 59], F: [53, 57, 60], G: [55, 59, 62], G7: [55, 59, 65], Am: [57, 60, 64],
  Bb: [58, 62, 65], Gm: [55, 58, 62], D: [50, 54, 57], D7: [50, 54, 60],
}

export const SONGS: Record<MusicMode, Song> = {
  day: {
    bpm: 112, swing: 0.08, lead: 'marimba', comp: 'offbeat', perc: 'shaker',
    bars: [
      { chord: 'C', mel: 'E5 G5 C6 - B5 G5 E5 -' },
      { chord: 'Am', mel: 'A5 - G5 E5 C5 - E5 .' },
      { chord: 'F', mel: 'F5 - A5 - C6 - A5 G5' },
      { chord: 'G', mel: 'G5 - D5 - B4 - . .' },
      { chord: 'C', mel: 'E5 G5 C6 - B5 G5 E5 -' },
      { chord: 'Am', mel: 'A5 - C6 A5 G5 - E5 .' },
      { chord: 'Dm G', mel: 'F5 A5 D6 - B5 G5 D5 F5' },
      { chord: 'C', mel: 'E5 - C5 - C5 . . .' },
      { chord: 'F', mel: 'A5 - G5 F5 E5 - F5 .' },
      { chord: 'G', mel: 'G5 - B5 - D6 - B5 .' },
      { chord: 'Em', mel: 'G5 - E5 G5 B5 - G5 .' },
      { chord: 'Am', mel: 'C6 - A5 - E5 - . .' },
      { chord: 'F', mel: 'F5 G5 A5 - C6 - A5 .' },
      { chord: 'G', mel: 'G5 A5 B5 - D6 - B5 .' },
      { chord: 'C', mel: 'C6 - G5 E5 D5 - E5 -' },
      { chord: 'G7', mel: 'D5 - G4 - B4 - D5 .' },
    ],
  },
  night: {
    bpm: 72, swing: 0, lead: 'musicbox', comp: 'pad', perc: 'crickets',
    bars: [
      { chord: 'F', mel: 'A5 - - C6 A5 - F5 -' },
      { chord: 'Dm', mel: 'D5 - F5 - A5 - - .' },
      { chord: 'Bb', mel: 'Bb5 - A5 - G5 - F5 -' },
      { chord: 'C', mel: 'G5 - - - . . E5 .' },
      { chord: 'F', mel: 'A5 - - C6 A5 - F5 -' },
      { chord: 'Dm', mel: 'D6 - C6 - A5 - F5 .' },
      { chord: 'Gm C', mel: 'G5 - Bb5 - E5 - G5 -' },
      { chord: 'F', mel: 'F5 - - - . . . .' },
    ],
  },
  visit: {
    bpm: 126, swing: 0.16, lead: 'pizz', comp: 'walk', perc: 'wood',
    bars: [
      { chord: 'G', mel: 'G4 . B4 . D5 . B4 .' },
      { chord: 'G', mel: 'C5 B4 A4 . G4 . D4 .' },
      { chord: 'C', mel: 'E5 . G5 . E5 . C5 .' },
      { chord: 'D', mel: 'D5 . F#5 . A5 - . .' },
      { chord: 'G', mel: 'G5 . D5 . B4 . G4 .' },
      { chord: 'Em', mel: 'E5 G5 E5 . B4 . G4 .' },
      { chord: 'C D7', mel: 'C5 E5 G5 . A5 F#5 D5 .' },
      { chord: 'G', mel: 'G5 . D5 . G4 . . .' },
    ],
  },
}

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** "F#5" → 78 (MIDI). */
export function midi(name: string): number {
  const m = /^([A-G])(#|b)?(\d)$/.exec(name)
  if (!m) throw new Error(`nota inválida: ${name}`)
  return 12 * (Number(m[3]) + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)
}
export const hz = (n: number) => 440 * 2 ** ((n - 69) / 12)

/** Notas de um compasso: [colcheia inicial, duração em colcheias, MIDI]. */
export function parseBar(mel: string): [number, number, number][] {
  const toks = mel.trim().split(/\s+/)
  if (toks.length !== 8) throw new Error(`compasso com ${toks.length} colcheias: "${mel}"`)
  const out: [number, number, number][] = []
  toks.forEach((t, i) => {
    if (t === '-') { if (out.length && out[out.length - 1][0] + out[out.length - 1][1] === i) out[out.length - 1][1]++; return }
    if (t !== '.') out.push([i, 1, midi(t)])
  })
  return out
}

/** Acorde de cada metade do compasso ("Dm G" = Dm na 1ª metade, G na 2ª). */
export function barChords(chord: string): [number[], number[]] {
  const [a, b = a] = chord.split(/\s+/)
  if (!CHORDS[a] || !CHORDS[b]) throw new Error(`acorde desconhecido: ${chord}`)
  return [CHORDS[a], CHORDS[b]]
}

// ---------- instrumentos (só osciladores, ruído e envelopes) ----------

type Kit = { ctx: AudioContext; noise: AudioBuffer }

function env(kit: Kit, dest: AudioNode, t: number, attack: number, peak: number, decay: number) {
  const g = kit.ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  g.connect(dest)
  return g
}
function osc(kit: Kit, type: OscillatorType, f: number, t: number, stop: number, out: AudioNode, detune = 0) {
  const o = kit.ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f, t)
  o.detune.setValueAtTime(detune, t)
  o.connect(out)
  o.start(t)
  o.stop(stop + 0.05)
  return o
}

/** Marimba: fundamental + parcial 4× que morre rápido (o "toc" da baqueta). */
function marimba(kit: Kit, dest: AudioNode, f: number, t: number, len: number, vol: number) {
  const d = Math.min(0.9, 0.25 + len * 0.6)
  osc(kit, 'sine', f, t, t + d, env(kit, dest, t, 0.005, vol, d))
  osc(kit, 'sine', f * 4, t, t + 0.06, env(kit, dest, t, 0.002, vol * 0.35, 0.05))
}
/** Caixinha de música: seno + parcial inarmônico brilhante, cauda longa. */
function musicbox(kit: Kit, dest: AudioNode, f: number, t: number, len: number, vol: number) {
  osc(kit, 'sine', f, t, t + 1.6, env(kit, dest, t, 0.004, vol, 1.5 + len * 0.2))
  osc(kit, 'sine', f * 5.4, t, t + 0.3, env(kit, dest, t, 0.002, vol * 0.18, 0.25))
}
/** Pizzicato: triangular com filtro fechando rápido. */
function pizz(kit: Kit, dest: AudioNode, f: number, t: number, len: number, vol: number) {
  const lp = kit.ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(f * 6, t)
  lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.15)
  lp.connect(env(kit, dest, t, 0.004, vol, 0.18 + len * 0.08))
  osc(kit, 'triangle', f, t, t + 0.4, lp)
  osc(kit, 'sawtooth', f, t, t + 0.12, env(kit, lp, t, 0.002, 0.25, 0.08))
}
function bass(kit: Kit, dest: AudioNode, f: number, t: number, len: number, vol: number) {
  osc(kit, 'triangle', f, t, t + len, env(kit, dest, t, 0.01, vol, len))
}
function pad(kit: Kit, dest: AudioNode, notes: number[], t: number, len: number, vol: number) {
  for (const n of notes) {
    const g = kit.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(vol, t + len * 0.35)
    g.gain.linearRampToValueAtTime(0.0001, t + len)
    g.connect(dest)
    osc(kit, 'sine', hz(n), t, t + len, g, -6)
    osc(kit, 'sine', hz(n), t, t + len, g, 6)
  }
}
function noiseHit(kit: Kit, dest: AudioNode, t: number, dur: number, vol: number, f: number, type: BiquadFilterType, q = 1) {
  const src = kit.ctx.createBufferSource(), flt = kit.ctx.createBiquadFilter()
  src.buffer = kit.noise
  flt.type = type
  flt.frequency.value = f
  flt.Q.value = q
  src.connect(flt).connect(env(kit, dest, t, 0.003, vol, dur))
  src.start(t, Math.random() * 0.5, dur + 0.05)
}
function wood(kit: Kit, dest: AudioNode, t: number, vol: number, f = 1050) {
  osc(kit, 'sine', f, t, t + 0.06, env(kit, dest, t, 0.001, vol, 0.05))
  noiseHit(kit, dest, t, 0.02, vol * 0.4, f * 2, 'bandpass', 3)
}
function cricket(kit: Kit, dest: AudioNode, t: number, vol: number) {
  for (let i = 0; i < 3; i++) {
    const g = env(kit, dest, t + i * 0.07, 0.005, vol, 0.04)
    osc(kit, 'sine', 4300 + Math.random() * 300, t + i * 0.07, t + i * 0.07 + 0.05, g)
  }
}

const LEAD = { marimba, musicbox, pizz }

/** Toca a colcheia `step` (0..bars*8−1) da música no instante `t`. */
export function playStep(kit: Kit, dest: AudioNode, song: Song, step: number, t: number) {
  const beat = 60 / song.bpm / 2
  const bar = song.bars[Math.floor(step / 8) % song.bars.length], i = step % 8
  const [c1, c2] = barChords(bar.chord)
  const chord = i < 4 ? c1 : c2
  for (const [at, len, n] of parseBar(bar.mel)) if (at === i) LEAD[song.lead](kit, dest, hz(n), t, len * beat, song.lead === 'musicbox' ? 0.09 : 0.11)
  const root = hz(chord[0] - 12)
  switch (song.comp) {
    case 'offbeat': // "um-pá": baixo nos tempos 1 e 3, acorde curto de pizzicato nos contratempos
      if (i === 0 || i === 4) bass(kit, dest, i === 0 ? root : root * 1.5, t, beat * 1.6, 0.13)
      if (i === 2 || i === 6) for (const n of chord) pizz(kit, dest, hz(n), t, 0.5, 0.025)
      break
    case 'pad':
      if (i === 0) { pad(kit, dest, c1, t, c1 === c2 ? beat * 8 : beat * 4, 0.022); bass(kit, dest, root, t, beat * 3, 0.07) }
      if (i === 4 && c1 !== c2) { pad(kit, dest, c2, t, beat * 4, 0.022); bass(kit, dest, root, t, beat * 3, 0.07) }
      break
    case 'walk': // baixo andando em semínimas: 1, 3, 5, 3 do acorde
      if (i % 2 === 0) bass(kit, dest, hz([chord[0], chord[1], chord[2], chord[1]][i / 2] - 12), t, beat * 0.9, 0.12)
      break
  }
  switch (song.perc) {
    case 'shaker': if (i % 2 === 1) noiseHit(kit, dest, t, 0.04, i === 3 || i === 7 ? 0.035 : 0.02, 7000, 'highpass'); break
    case 'wood': if (i === 2 || i === 6) wood(kit, dest, t, 0.05); else if (i % 2 === 1) noiseHit(kit, dest, t, 0.03, 0.015, 8000, 'highpass'); break
    case 'crickets': if (i === 3 && step % 16 === 3 && Math.random() < 0.7) cricket(kit, dest, t, 0.006); break
  }
}

/**
 * Tocador com antecipação (agenda 0,25 s à frente a cada 60 ms, o jeito estável de sequenciar no Web Audio).
 * Trocar de modo faz fade de 1,2 s na música antiga e começa a nova do início.
 */
export function createMusic(ctx: AudioContext, out: AudioNode, noise: AudioBuffer) {
  const kit: Kit = { ctx, noise }
  let cur: { mode: MusicMode; gain: GainNode; step: number; next: number } | null = null
  let timer: ReturnType<typeof setInterval> | null = null

  const tick = () => {
    if (!cur) return
    const song = SONGS[cur.mode]
    const beat = 60 / song.bpm / 2
    while (cur.next < ctx.currentTime + 0.25) {
      const sw = cur.step % 2 === 1 ? song.swing * beat : 0
      playStep(kit, cur.gain, song, cur.step, cur.next + sw)
      cur.step = (cur.step + 1) % (song.bars.length * 8)
      cur.next += beat
    }
  }
  const fadeOut = (g: GainNode) => {
    g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.35)
    setTimeout(() => g.disconnect(), 1600)
  }
  return {
    get mode() { return cur?.mode ?? null },
    play(mode: MusicMode) {
      if (cur?.mode === mode) return
      if (cur) fadeOut(cur.gain)
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.2)
      gain.connect(out)
      cur = { mode, gain, step: 0, next: ctx.currentTime + 0.1 }
      timer ??= setInterval(tick, 60)
      tick()
    },
    stop() {
      if (cur) fadeOut(cur.gain)
      cur = null
      if (timer) clearInterval(timer)
      timer = null
    },
  }
}
