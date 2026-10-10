import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOGO_ART_NAME, LOGO_SQUARE_SRC, LOGO_SRC, LOGO_SRC_1X, logoUsesArt } from '@/components/game-logo'

describe('logo do jogo', () => {
  it('usa a arte só com o nome desenhado nela', () => {
    expect(logoUsesArt(LOGO_ART_NAME)).toBe(true)
    expect(logoUsesArt('Colheita Feliz')).toBe(true)
    // Variações de digitação no .env não derrubam a arte.
    expect(logoUsesArt('  colheita   FELIZ ')).toBe(true)
  })

  it('com outro nome, cai para o texto', () => {
    expect(logoUsesArt('Fazendinha Alegre')).toBe(false)
    expect(logoUsesArt('Colheita Feliz 2')).toBe(false)
    expect(logoUsesArt('')).toBe(false)
  })

  it('os arquivos da arte existem em public/', () => {
    for (const src of [LOGO_SRC, LOGO_SRC_1X, LOGO_SQUARE_SRC]) expect(existsSync(path.join('public', src))).toBe(true)
  })
})
