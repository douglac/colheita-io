// colheita.io como produto sério (9/out/2026): dados da empresa num lugar só, sem cara de rascunho e loja sem provedor.
import { readdirSync, readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertLegalReady, LEGAL, legalDate, legalPlaceholders, type LegalInfo } from '../src/game/legal'

process.env.PGLITE_DIR = 'memory://'

afterEach(() => vi.unstubAllEnvs())

const FILLED: LegalInfo = {
  controller: 'os responsáveis pelo Jogo (exemplo.com)', contactEmail: 'contato@example.com', dpoEmail: 'privacidade@example.com', updated: '2026-10-09',
}
// CNPJ com ou sem máscara (14 dígitos), razão social e nome de empresa: fora das páginas legais por decisão do projeto.
const CNPJ = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/
const IDENT = [CNPJ, /\bLTDA\b/i]

describe('dados da empresa (src/game/legal.ts)', () => {
  it('campo [ENTRE COLCHETES] ou vazio reprova o build de produção', () => {
    const draft = { ...FILLED, contactEmail: '[E-MAIL DE CONTATO]', dpoEmail: ' ' }
    expect(legalPlaceholders(draft)).toEqual(['contactEmail', 'dpoEmail'])
    expect(() => assertLegalReady('production', draft)).toThrow(/contactEmail, dpoEmail/)
    // dev e staging só listam, não travam
    expect(assertLegalReady(undefined, draft)).toEqual(['contactEmail', 'dpoEmail'])
    expect(assertLegalReady('staging', draft)).toEqual(['contactEmail', 'dpoEmail'])
  })

  it('preenchido passa sem razão social, CNPJ nem endereço', () => {
    expect(assertLegalReady('production', FILLED)).toEqual([])
    expect(Object.keys(LEGAL).sort()).toEqual(['contactEmail', 'controller', 'dpoEmail', 'updated'])
  })

  it('next.config.ts chama a trava com o APP_ENV do build', () => {
    expect(readFileSync('next.config.ts', 'utf8')).toMatch(/assertLegalReady\(process\.env\.APP_ENV\)/)
  })

  it('os dados de colheita.io estão preenchidos: controlador genérico e os dois contatos', () => {
    expect(legalPlaceholders(LEGAL)).toEqual([])
    expect(LEGAL.controller).toMatch(/^os responsáveis pelo .+ \(colheita\.io\)$/)
    expect(LEGAL.contactEmail).toBe('contato@colheita.io')
    expect(LEGAL.dpoEmail).toBe('privacidade@colheita.io')
  })

  it('data por extenso e versão dos termos', async () => {
    expect(legalDate('2026-10-09')).toBe('9 de outubro de 2026')
    const { TERMS_VERSION } = await import('../src/server/auth')
    expect(TERMS_VERSION).toBe(LEGAL.updated)
  })
})

describe('sem cara de rascunho', () => {
  const FILES = ['src/components/LegalPage.tsx', 'src/app/privacidade/page.tsx', 'src/app/termos/page.tsx', 'src/game/age.ts']
  it('sem faixa de RASCUNHO nem "revisar com advogado"', () => {
    for (const f of FILES) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/rascunho|advogado|\[ENTRE COLCHETES\]/i)
    }
  })

  it('Privacidade e Termos leem a empresa de src/game/legal.ts, sem colchetes no texto', () => {
    for (const f of ['src/app/privacidade/page.tsx', 'src/app/termos/page.tsx']) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).toMatch(/LEGAL\.controller/)
      expect(src, f).toMatch(/LEGAL\.contactEmail/)
      expect(src.replace(/\{[^}]*\}/g, ''), f).not.toMatch(/\[[A-ZÁÉÍÓÚÃÕÇ ]{3,}/)
    }
    const priv = readFileSync('src/app/privacidade/page.tsx', 'utf8')
    for (const must of ['Encarregado de dados', 'LEGAL.dpoEmail', 'Base legal', 'Hospedagem', 'E-mail', 'art. 18', 'ANPD']) expect(priv).toContain(must)
  })
})

describe('páginas legais e rodapé sem identificação de empresa', () => {
  const FILES = ['src/game/legal.ts', 'src/components/LegalLinks.tsx', 'src/components/LegalPage.tsx', 'src/app/privacidade/page.tsx', 'src/app/termos/page.tsx']
  it('sem CNPJ (com ou sem máscara) nem LTDA no código', () => {
    for (const f of FILES) for (const re of IDENT) expect(readFileSync(f, 'utf8'), `${f} ${re}`).not.toMatch(re)
  })

  it('o HTML renderizado também não tem; rodapé é só © ano + nome do jogo', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { createElement } = await import('react')
    const { LegalLinks } = await import('../src/components/LegalLinks')
    const { default: Privacidade } = await import('../src/app/privacidade/page')
    const { default: Termos } = await import('../src/app/termos/page')
    const { GAME_NAME } = await import('../src/game/config')
    const footer = renderToStaticMarkup(createElement(LegalLinks))
    expect(footer).toContain(`© 2026 ${GAME_NAME}`)
    expect(footer).not.toMatch(/CNPJ/)
    for (const C of [LegalLinks, Privacidade, Termos]) {
      const html = renderToStaticMarkup(createElement(C))
      for (const re of [...IDENT, /CNPJ/, /\[[A-ZÁÉÍÓÚÃÕÇ ]{3,}/]) expect(html, `${C.name} ${re}`).not.toMatch(re)
    }
    const priv = renderToStaticMarkup(createElement(Privacidade))
    expect(priv).toContain('os responsáveis pelo')
    expect(priv).toContain('Encarregado de dados: <a href="mailto:privacidade@colheita.io">privacidade@colheita.io</a>')
    expect(priv).toContain('9 de outubro de 2026')
  })
})

describe('rodapé "© ano · Termos · Privacidade" só na LP e nas páginas legais', () => {
  const uses = (f: string) => /<LegalLinks\b/.test(readFileSync(f, 'utf8'))
  it('aparece em / e em /termos e /privacidade (pela moldura LegalPage)', () => {
    expect(uses('src/app/page.tsx')).toBe(true)
    expect(uses('src/components/LegalPage.tsx')).toBe(true)
    for (const f of ['src/app/privacidade/page.tsx', 'src/app/termos/page.tsx']) expect(readFileSync(f, 'utf8')).toMatch(/<LegalPage\b/)
  })

  it('não aparece no jogo: /conta, /fazenda, /bem-vindo, /c/<código> nem em componentes do jogo', () => {
    const game = ['src/app/conta/page.tsx', 'src/app/bem-vindo/page.tsx', 'src/app/c/[code]/page.tsx',
      ...readdirSync('src/app/fazenda', { recursive: true }).map(String).filter((f) => f.endsWith('.tsx')).map((f) => `src/app/fazenda/${f}`)]
    for (const f of game) expect(uses(f), f).toBe(false)
    const comps = readdirSync('src/components', { recursive: true }).map(String).filter((f) => f.endsWith('.tsx'))
    const users = comps.filter((f) => uses(`src/components/${f}`)).map((f) => f.replace(/\\/g, '/'))
    expect(users).toEqual(['LegalPage.tsx'])
  })
})

