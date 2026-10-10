// Mural e "Enquanto você estava fora": o que os amigos fizeram na sua
// fazenda vira um resumo agrupado por pessoa, com o atalho para ir lá (revidar ou retribuir).
// Regras puras; o "já visto" fica no aparelho (cf:mural:<apelido>), como as outras preferências.
import { itemName, SEED_BY_ID } from './catalog'

export type FeedEvent = { id: number; kind: string; actor: string | null; payload: Record<string, unknown>; at: number }

/** Eventos que contam como novidade no Mural (o que é só recibo de compra/venda fica de fora). */
const QUIET = new Set(['bought', 'sold', 'gold_bought', 'gold_refunded', 'gold_adjusted', 'level_up'])
export const isNews = (e: FeedEvent) => !QUIET.has(e.kind)

/** Novidades ainda não vistas no Mural. */
export const unseenCount = (events: FeedEvent[], seenId: number) => events.filter((e) => e.id > seenId && isNews(e)).length

/** Maior id da lista (o que fica "visto" ao abrir o Mural). */
export const lastId = (events: FeedEvent[]) => events.reduce((m, e) => Math.max(m, e.id), 0)

export type GoBack = 'revenge' | 'return' | 'run'
export const GO_LABEL: Record<GoBack, string> = { revenge: 'Revidar', return: 'Retribuir', run: 'Correr lá' }

/** Atalho do Mural para a fazenda de quem fez a ação (null = sem atalho). */
export function goBack(e: Pick<FeedEvent, 'kind' | 'actor'>): GoBack | null {
  if (!e.actor) return null
  switch (e.kind) {
    case 'stolen': case 'sabotaged': case 'bitten': return 'revenge'
    case 'helped': case 'loved': case 'gift': case 'flower': case 'visited': case 'thanked': case 'friend_joined': case 'friend_added': case 'share_xp': case 'share_seen': return 'return'
    case 'friend_ripe': return 'run'
    default: return null
  }
}

export type AwayLine = { actor: string; text: string; go: GoBack; icon: string; rank: number }

const ORDER: Record<string, number> = {
  stolen: 0, sabotaged: 1, bitten: 2, friend_ripe: 3, helped: 4, loved: 5, gift: 6, flower: 7, thanked: 8, friend_joined: 9, friend_added: 10, visited: 11, share_seen: 12,
}
const ICON: Record<string, string> = {
  stolen: '✋', sabotaged: '🐛', bitten: '🐕', friend_ripe: '🧺', helped: '💧', loved: '💚', gift: '🎁', flower: '🌻', thanked: '💐',
  friend_joined: '🎉', friend_added: '👥', visited: '👣', share_seen: '📣',
}

const times = (n: number) => (n > 1 ? ` ${n} vezes` : '')
const joinPt = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`)

/**
 * Resumo do que aconteceu desde a última vez que o jogador olhou: 1 linha por pessoa, juntando o que ela
 * fez ("bia pegou 3 Nabo, soltou praga e regou sua horta"), da mais urgente (roubo, praga) para a mais leve
 * (visita). O atalho segue a ação mais urgente da pessoa. Só ações de outras pessoas.
 */
export function awaySummary(events: FeedEvent[], seenId: number, max = 6): AwayLine[] {
  type Acc = { n: number; qty: Map<string, number>; gold: number; plots: number; tools: Set<string> }
  const people = new Map<string, Map<string, Acc>>()
  for (const e of events) {
    if (e.id <= seenId || !e.actor || ORDER[e.kind] == null) continue
    const kinds = people.get(e.actor) ?? new Map<string, Acc>()
    const g = kinds.get(e.kind) ?? { n: 0, qty: new Map(), gold: 0, plots: 0, tools: new Set() }
    g.n++
    if (e.kind === 'stolen') {
      const name = e.payload.item ? itemName(String(e.payload.item)) : SEED_BY_ID[String(e.payload.seedId)]?.name ?? '?'
      g.qty.set(name, (g.qty.get(name) ?? 0) + Number(e.payload.qty ?? 1))
    }
    if (e.kind === 'bitten') g.gold += Number(e.payload.gold ?? 0)
    if (e.kind === 'friend_ripe') g.plots = Math.max(g.plots, Number(e.payload.plots ?? 1))
    if (e.kind === 'helped') g.tools.add(String(e.payload.tool ?? 'water'))
    kinds.set(e.kind, g)
    people.set(e.actor, kinds)
  }
  // Pedaços da frase (sem o nome); o primeiro leva o objeto "da sua fazenda/horta" quando faz sentido.
  const part = (kind: string, g: Acc): string => {
    switch (kind) {
      case 'stolen': return `pegou ${joinPt([...g.qty].map(([name, q]) => `${q} ${name}`))} da sua fazenda`
      case 'sabotaged': return `aprontou na sua horta${times(g.n)}`
      case 'bitten': return `levou mordida do seu cachorro${times(g.n)} (+${g.gold} de ouro para você)`
      case 'friend_ripe': return `está com a horta madura (${g.plots} ${g.plots === 1 ? 'lote' : 'lotes'})`
      case 'helped': {
        const did = [g.tools.has('water') && 'regou', g.tools.has('pesticide') && 'tirou praga', g.tools.has('herbicide') && 'tirou erva'].filter(Boolean) as string[]
        return `${joinPt(did.length ? did : ['ajudou'])} na sua horta${times(g.n)}`
      }
      case 'loved': return 'adubou sua horta com carinho'
      case 'gift': return `te mandou ${g.n > 1 ? `${g.n} presentes` : 'um presente'}`
      case 'flower': return `te deu ${g.n > 1 ? `${g.n} flores` : 'uma flor'}`
      case 'thanked': return 'agradeceu o seu presente'
      case 'friend_joined': return 'entrou pelo seu convite'
      case 'friend_added': return 'te adicionou como amigo'
      case 'share_seen': return `abriu o seu link de nível${times(g.n)} e ganhou XP`
      default: return 'passou pela sua fazenda'
    }
  }
  const lines: AwayLine[] = []
  for (const [actor, kinds] of people) {
    const list = [...kinds].sort(([a], [b]) => ORDER[a] - ORDER[b])
    // A visita só entra sozinha: se a pessoa fez outra coisa, "passou por aqui" é óbvio.
    const shown = list.length > 1 ? list.filter(([k]) => k !== 'visited') : list
    const [top] = shown[0]
    lines.push({ actor, text: `${actor} ${joinPt(shown.map(([k, g]) => part(k, g)))}`, go: goBack({ kind: top, actor })!, icon: ICON[top], rank: ORDER[top] })
  }
  return lines.sort((a, b) => a.rank - b.rank).slice(0, max)
}

/** Vale abrir a janela "Enquanto você estava fora"? Só com ação de outra pessoa que pede resposta (visita sozinha não). */
export const awayWorthShowing = (lines: AwayLine[]) => lines.some((l) => l.rank < ORDER.visited)
