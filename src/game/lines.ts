// Falas do jogo num lugar só: balões sobre o lote, nomes dos estágios, tela de visita e
// ganchos de compartilhar. Texto próprio, curto e brincalhão.
// Para trocar uma frase, mude só aqui.

/** Balões que aparecem em cima do lote (no lugar do toast). A chave vem do servidor (`say` ou `code`). */
export const PLOT_LINES = {
  greedy: 'Não seja tão ganancioso!', // limite do dia, ou o piso do dono depois de você já ter pegado dali
  empty: 'Por favor, eu não tenho mais nada sobrando!', // piso do dono e você não pegou nada dali
  // Agradecimentos ao ajudar o amigo; "pestes" cobre praga e erva.
  thanks_water: 'Obrigado por colocar água!', // ajudou na horta do amigo
  thanks_pest: 'Obrigado por remover as pestes!',
  thanks_weed: 'Obrigado por remover as pestes!',
  no_water: 'Sem mais água aqui!', // regou terra que não estava seca
  fertTwice: 'Não precisa de mais fertilizante!', // 2º adubo no mesmo estágio
} as const

export type PlotLine = keyof typeof PLOT_LINES

export const isPlotLine = (k: unknown): k is PlotLine => typeof k === 'string' && k in PLOT_LINES

/** Tooltips da HUD ao tocar na barra. `left` = quanto falta para o próximo nível. */
export const HUD_TIPS = {
  xp: (now: number, left: number) => [`Sua experiência no momento: ${now}`, `para o próximo nível: ${left}`] as const,
  pop: (now: number, left: number) => [`Popularidade atual: ${now}`, `Para o próximo nível: ${left}`] as const,
}

/** Nomes dos 6 estágios no balão do lote, na ordem dos estágios da arte (0..5). */
export const GROWTH_NAMES = {
  seed: 'semente',
  sprout: 'broto',
  smallLeaves: 'folhas pequenas',
  bigLeaves: 'folhas grandes',
  bloom: 'florescendo',
  ripe: 'maduro',
} as const

/** Linha da planta madura ("plantado N, ainda restam M"). */
export const ripeLine = (total: number, left: number) => `plantado ${total}, ainda restam ${left}`

/** Tela de carregamento ao visitar um amigo (sorteia uma). */
export const VISIT_LINES = [
  (who: string) => `O espantalho está de olho na plantação de ${who}…`,
  (who: string) => `Pegando a estradinha de terra até a fazenda de ${who}…`,
  (who: string) => `Limpando as botas antes de pisar na horta de ${who}…`,
  (who: string) => `Contando as cenouras de ${who} (só olhando, juro)…`,
]

/** Ganchos de compartilhar da mordida. */
export const BITE_LINES = {
  thiefTitle: (owner: string) => `Fui mordido na horta de ${owner}!`,
  thiefShare: (owner: string, game: string) => `Fui mordido na horta de ${owner} 🐕😵 no ${game}! Vem ver se você tem coragem:`,
  ownerTitle: (thief: string) => `Seu cachorro pegou ${thief}!`,
  ownerShare: (thief: string, game: string) => `Meu cachorro pegou ${thief} roubando minha horta no ${game} 🐕💪 Vem tentar:`,
}
