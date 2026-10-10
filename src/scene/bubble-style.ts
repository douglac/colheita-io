// Balão de fala do lote: laranja com contorno marrom.
// Arte própria do lote W (`ui/balao_lote*.png`, três tamanhos, não é 9-slice); estas cores são a reserva desenhada
// por código quando o arquivo falta (e a cor do texto nos dois casos).
export const PLOT_BUBBLE = {
  fill: 0xffa43a,
  stroke: 0x7a3f12,
  text: 0x4a2207,
  radius: 14,
  strokeWidth: 3,
} as const

// Miolo vazio do balão da arte (frações da imagem, iguais nos três tamanhos) e a ponta da cauda, que fica no lote.
export const PLOT_BUBBLE_ART = {
  sizes: ['balao_lote_pequeno', 'balao_lote_medio', 'balao_lote'] as const, // 192, 288 e 384 px de largura
  inner: { x0: 0.13, x1: 0.86, y0: 0.32, y1: 0.76 },
  tip: 0.965,
} as const
