// Banner do evento (bug de 9/out/2026: a frase do Natal estourava a tábua): toda tagline cabe na caixa lisa da sua arte,
// em no máximo 2 linhas, com a fonte em cqw definida em `art.text` (event-content.ts). A largura das letras é estimada
// por cima (negrito arredondado); o QA no navegador confere com a fonte de verdade.
import { describe, expect, it } from 'vitest'
import { EVENT_DEFS } from '../src/game/event-content'

const MAX_LINES = 2
const LINE_H = 1.15 // line-height de .event-banner-text > span
const ART_H = 160 / 384 // altura da arte em fração da largura

/** Largura estimada de um caractere, em em (negrito; para cima, de propósito). */
function charEm(c: string): number {
  if (c === ' ') return 0.3
  if ('iljtfr.,:;!\'’'.includes(c)) return 0.38
  if ('mwMW'.includes(c)) return 0.92
  if (c !== c.toLowerCase()) return 0.72
  return 0.6
}
const widthEm = (s: string) => [...s].reduce((a, c) => a + charEm(c), 0)

/** Quebra gulosa por palavra, como o navegador (antes do `text-wrap: balance`, que só redistribui). */
function wrap(text: string, maxEm: number): string[] {
  const lines: string[] = []
  for (const w of text.split(' ')) {
    const last = lines.at(-1)
    if (last !== undefined && widthEm(`${last} ${w}`) <= maxEm) lines[lines.length - 1] = `${last} ${w}`
    else lines.push(w)
  }
  return lines
}

describe('banner do evento', () => {
  it.each(EVENT_DEFS.map((e) => [e.id, e] as const))('%s: a frase cabe na tábua em até 2 linhas', (_id, ev) => {
    const t = ev.art.text
    expect(t.x).toBeGreaterThanOrEqual(0)
    expect(t.y).toBeGreaterThanOrEqual(0)
    expect(t.x + t.w).toBeLessThanOrEqual(100)
    expect(t.y + t.h).toBeLessThanOrEqual(100)
    const lines = wrap(ev.tagline, t.w / t.fs) // largura da caixa em em (as duas em cqw)
    expect(lines.length, lines.join(' / ')).toBeLessThanOrEqual(MAX_LINES)
    for (const l of lines) expect(widthEm(l) * t.fs, l).toBeLessThanOrEqual(t.w)
    expect(lines.length * LINE_H * t.fs).toBeLessThanOrEqual(t.h * ART_H)
    // Legível no banner mais estreito (320 px): pelo menos 10 px de letra.
    expect(t.fs * 3.2).toBeGreaterThanOrEqual(10)
  })
})
