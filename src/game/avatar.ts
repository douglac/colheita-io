// Avatares do fazendeiro (lote Q, A9): o login não tem
// foto, então o jogador escolhe um dos rostos de public/art/ui/avatar_NN.png. Sem escolha, o rosto sai do apelido
// (sempre o mesmo para a mesma pessoa, inclusive vizinhas-bot).
export const AVATARS = ['01', '02', '03', '04', '05', '06', '07', '08'] as const
export type AvatarId = (typeof AVATARS)[number]

export const isAvatar = (v: unknown): v is AvatarId => typeof v === 'string' && (AVATARS as readonly string[]).includes(v)

/** Rosto que aparece: o escolhido ou, sem escolha, um fixo pelo apelido. */
export function avatarOf(chosen: string | null | undefined, handle: string): AvatarId {
  if (isAvatar(chosen)) return chosen
  let h = 0
  for (const ch of handle) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATARS[h % AVATARS.length]
}

export const avatarSrc = (id: AvatarId) => `/art/ui/avatar_${id}.png`
