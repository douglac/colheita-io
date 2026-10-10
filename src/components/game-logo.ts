// Logo do jogo: caminhos da arte e a regra imagem × texto. Sem React, para o OG e os testes usarem também.

/** Arte do letreiro (1200×600, RGBA). Telas e OG usam estas constantes, nunca o caminho solto. */
export const LOGO_SRC = '/art/ui/logo_2x.png'
/** Versão leve (600×300): prévia Open Graph e usos pequenos. */
export const LOGO_SRC_1X = '/art/ui/logo_1x.png'
/** Só o letreiro, recortado num quadrado (512×512): selos, avatares de grupo, ícones (não é o ícone PWA). */
export const LOGO_SQUARE_SRC = '/art/ui/logo_square_512.png'
export const LOGO_SIZE = { width: 1200, height: 600 } as const

/** O nome que está desenhado na arte. */
export const LOGO_ART_NAME = 'Colheita Feliz'

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase()

/** A arte só vale para o nome desenhado nela; com outro NEXT_PUBLIC_GAME_NAME, o logo vira texto estilizado. */
export const logoUsesArt = (gameName: string) => norm(gameName) === norm(LOGO_ART_NAME)
