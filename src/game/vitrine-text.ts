// Texto do contador da página inicial (servidor e navegador). `shown` já vem filtrado pelo mínimo (server/vitrine.ts):
// null = poucas pessoas, então nada de número ("1 pessoa online" afasta e pode identificar alguém).
export const onlineLabel = (shown: number | null) =>
  shown == null ? 'Fazendas abertas agora' : `${shown.toLocaleString('pt-BR')} pessoas plantando agora`

// Fazenda em destaque em tela cheia (/espiar/[token]). A LP guarda em sessionStorage de qual token abriu e a
// rolagem; ao fechar, quem veio da LP volta no histórico (o Voltar do celular faz o mesmo) e quem chegou por
// link abre a LP. "Entrar e plantar a sua" deixa um recado para a LP focar o e-mail.
export const PEEK_FROM = 'cf:peek-from'
export const PEEK_SCROLL = 'cf:peek-scroll'
export const PEEK_JOIN = 'cf:peek-join'
export const peekHref = (token: string) => `/espiar/${encodeURIComponent(token)}`
export const peekExit = (from: string | null, token: string): 'back' | 'home' => (from === token ? 'back' : 'home')

// Retorno do ranking do jogo: destino estritamente local, preservando fazenda visitada e categoria.
export function rankingReturn(raw: unknown): string | null {
  return typeof raw === 'string' && raw === raw.trim() && /^\/fazenda(?:\/[a-z0-9_]{3,20})?\?ranking=(nivel|moedas|popularidade)$/.test(raw) ? raw : null
}
