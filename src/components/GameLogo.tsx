import Image from 'next/image'
import { GAME_NAME } from '@/game/config'
import { LOGO_SIZE, LOGO_SRC, logoUsesArt } from './game-logo'

export { LOGO_SRC, LOGO_SRC_1X, LOGO_SQUARE_SRC } from './game-logo'

// hero: tela de entrada e convite (até 440 px). compact: cabeçalhos e telas de passagem (até 260 px).
const SIZES = { hero: '(max-width: 560px) 92vw, 480px', compact: '(max-width: 560px) 70vw, 280px' } as const

/**
 * O letreiro "Colheita Feliz" com a sombra do convite. Com outro nome de jogo (NEXT_PUBLIC_GAME_NAME), mostra o nome
 * em texto no mesmo espírito, para a troca de nome continuar num lugar só.
 */
export function GameLogo({ size = 'hero', as: Tag = 'h1', preload = false, name = GAME_NAME }: {
  size?: keyof typeof SIZES; as?: 'h1' | 'div'; preload?: boolean; name?: string
}) {
  return (
    <Tag className={`game-logo ${size}`}>
      {/* Sem preload, carrega mesmo assim na hora: o logo fica no topo da tela (é o LCP). */}
      {logoUsesArt(name)
        ? <Image src={LOGO_SRC} {...LOGO_SIZE} sizes={SIZES[size]} alt={name} preload={preload} loading={preload ? undefined : 'eager'} />
        : <span className="game-logo-text">{name}</span>}
    </Tag>
  )
}
