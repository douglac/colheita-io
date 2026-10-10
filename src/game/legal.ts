// Dados das páginas legais num lugar só: Privacidade, Termos e rodapé leem daqui.
// Os textos são genéricos: sem razão social, CNPJ, endereço nem nome de pessoa;
// só os canais de contato. Antes de vender ouro de verdade, identificar fornecedor e controlador.
// Campo vazio ou [ENTRE COLCHETES] reprova o build de produção (APP_ENV=production, next.config.ts).
import { GAME_NAME } from './config'

export type LegalInfo = {
  /** Quem responde pelo jogo, sem identificar pessoa nem empresa. */
  controller: string
  contactEmail: string
  /** Canal do encarregado pelo tratamento de dados pessoais (LGPD art. 41). */
  dpoEmail: string
  /** Última atualização de Privacidade e Termos (AAAA-MM-DD). Também é a versão gravada no aceite do cadastro. */
  updated: string
}

export const LEGAL: LegalInfo = {
  controller: `os responsáveis pelo ${GAME_NAME} (colheita.io)`,
  contactEmail: 'contato@colheita.io',
  dpoEmail: 'privacidade@colheita.io',
  updated: '2026-10-09',
}

/** Campos que ainda são modelo (vazios ou com colchetes). */
export function legalPlaceholders(info: LegalInfo = LEGAL): (keyof LegalInfo)[] {
  return (Object.keys(info) as (keyof LegalInfo)[]).filter((k) => !info[k]?.trim() || /[[\]]/.test(info[k]))
}

/** Reprova o build de produção com dado provisório. Em dev e staging, só devolve a lista. */
export function assertLegalReady(appEnv: string | undefined, info: LegalInfo = LEGAL): (keyof LegalInfo)[] {
  const missing = legalPlaceholders(info)
  if (appEnv === 'production' && missing.length) {
    throw new Error(`Dados das páginas legais incompletos em src/game/legal.ts: ${missing.join(', ')}. Preencha antes do build de produção.`)
  }
  return missing
}

/** "9 de outubro de 2026" */
export function legalDate(iso: string = LEGAL.updated): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}
