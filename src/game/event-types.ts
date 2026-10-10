// Tipos do sistema de eventos sazonais (só tipos: o conteúdo fica em event-content.ts e as regras em events.ts).
// Evolução 13: os campos E1–E14. Todos opcionais: o Dia das Bruxas não muda.
import type { EventCalendar } from './event-calendar'

export type { EventCalendar } from './event-calendar'

/** Moeda do evento (o doce do Dia das Bruxas): fica no depósito, não vende e só serve na Troca do evento. */
export type EventCurrency = { id: string; name: string; plural: string; icon: string; emoji: string }

/** Troca na barraca do evento: `give` moedas do evento → `qty` × `item` (do depósito ou peça de decoração). */
export type EventTrade = { id: string; give: number; item: string; qty: number; kind: 'item' | 'decor' }

export type EventMissionKind =
  | 'plant' // plantar semente do evento
  | 'harvest' // colher cultura do evento
  | 'fill' // encher a própria tigela
  | 'take' // pegar doce na tigela de um amigo
  | 'shoo' // espantar um visitante da fazenda
  | 'trade' // trocar moedas do evento por um prêmio
  // E12 (Evolução 13)
  | 'visit' // visitar a fazenda de um amigo (1 por amigo por dia)
  | 'send' // mandar cartão ou presente do evento a um amigo
  | 'help' // ajudar o objeto de um amigo (boneco de neve, baú); `of: 'abrir'` = abrir o seu com a ajuda deles
  | 'build' // subir um nível da construção (árvore de Natal)
  | 'craft' // fazer um item na oficina (ovo de Páscoa); `of: <receita>`
  | 'open' // abrir presente ou ovo; `of: 'peca'` = peças de decoração ganhas abrindo ovos
  | 'checkin' // assinar o calendário de presença (meias do Natal)

/** Onde a frase do banner vai: a parte lisa da tábua de `mural_banner.png` (384×160), sem os enfeites dos cantos.
 *  `x`/`y`/`w`/`h` em % da arte; `fs` em % da largura do banner (cqw), então o texto escala junto com a arte;
 *  `light`: letra clara, para fundo escuro (Ano-Novo). */
export type EventBannerText = { x: number; y: number; w: number; h: number; fs: number; light?: boolean }

export type EventReward = { gold?: number; xp?: number; candy?: number; items?: [string, number][] }
/** Missão em cadeia (molde B: "x/N", "Recompensa da missão", "Próxima missão"). */
// `of` (Evolução 13) conta só um tipo: `harvest`/`plant` de uma cultura, `craft` de uma receita, `help: 'abrir'`, `open: 'peca'`.
export type EventMission = { kind: EventMissionKind; of?: string; target: number; title: string; text: string; reward: EventReward }

/** Item vendido só no evento (aba Ferramentas da loja), ex.: o pacote de doces que enche a tigela. */
export type EventShopItem = { id: string; name: string; gold: number; desc: string; icon: string; emoji: string }

/** Tigela social: a 1ª vem cheia; os amigos pegam 1 doce por visita; vazia, dá um prêmio ao dono, que enche de novo com 1 pacote. */
export type EventBowl = {
  capacity: number // doces na tigela cheia
  refillItem: string // item gasto para encher de novo (ex.: o pacote de doces)
  takeXp: number // XP de quem pega
  takerDaily: number // doces que cada jogador pega por dia, somando todas as tigelas
  prize: { gold: number; xp: number; items: [string, number][] } // prêmio do dono quando a tigela esvazia (fixo, sem sorteio)
}

/** Visitantes que passeiam na fazenda (molde F); tocar espanta e dá um prêmio fixo, sem sorteio. */
export type EventCritters = {
  kinds: { id: string; name: string; line: string }[] // arte em public/art/event/<evento>/<id>_sheet.png
  perDay: number // quantos aparecem por dia em cada fazenda
  gold: number; xp: number
}

export type EventDef = {
  id: string
  name: string
  tagline: string // frase do banner
  /** Datas no fuso de Brasília, todo ano: do começo de `start` ao fim de `end` (inclusive). "MM-DD".
   *  E1: ou presas à Páscoa (`{ rule: 'pascoa', from, to }`) ou ao n-ésimo domingo (`{ rule: 'domingo', … }`). */
  calendar: EventCalendar
  /** `bowl`: prefixo da arte da tigela em `dir` (`<bowl>_cheia|meia|vazia.png`; padrão "tigela"): o saco de confete do
   *  Carnaval, a pipoqueira da Festa Junina. */
  art: { icon: string; banner: string; dir: string; bowl?: string; text: EventBannerText }
  seeds: string[] // culturas do evento (ids de catalog.ts)
  series: string[] // séries da loja de Decoração vendidas só no evento (ids de decor.ts)
  currency: EventCurrency | null // E11: evento pequeno, só de loja, não tem moeda
  shop: EventShopItem[] // itens vendidos só na época (além das sementes e das séries)
  harvestCandy: number // moedas do evento por colheita de cultura do evento
  /** Folga depois de a última semente vendida amadurecer, para colher e trocar antes de acabar (horas reais). */
  graceH: number
  bowl: EventBowl | null
  critters: EventCritters | null
  trades: EventTrade[]
  missions: EventMission[]
  // ---------- Evolução 13 (E3–E14), todos opcionais ----------
  drops?: EventDrop[] // E3
  help?: EventHelp // E4
  gifts?: EventGifts // E5
  advent?: EventAdvent // E6
  build?: EventBuild // E7
  workshop?: EventWorkshop // E8
  send?: EventSend[] // E9
  freeSeries?: boolean // E10: as peças das `series` são dadas a quem entra na fazenda durante o evento
  light?: EventLight // E13
  pets?: EventPet[] // E14
  items?: EventItem[] // nomes e ícones dos itens só do evento (materiais, presentes, cartões, ovos)
  /** Evento registrado e testado, mas fora do calendário até a arte chegar (como o `needsArt` das sementes). O atalho
   *  de QA (/api/dev) ainda força. */
  needsArt?: boolean
}

/** E3: material fixo por colheita de qualquer cultura (não só a do evento): `qty` moedas do evento por colheita. */
export type EventDrop = { seed: string; qty: number }

/** E4 (molde C): objeto que só se completa com `friends` ajudas de amigos diferentes em até `days` dias. Sem ajuda
 *  suficiente no prazo, recomeça do zero ("O monte de neve está derretendo"). `daily`: recomeça todo dia (baú diário).
 *  `unlockAt`: só aparece depois de N aberturas na oficina (Ovo Gigante). */
export type EventHelp = { id: string; name: string; friends: number; days: number; daily?: boolean; unlockAt?: number; prize: EventReward }

/** E5 (molde G): presentes que os amigos penduram (1 por amigo por dia, `perLevel` por nível da construção) e que só
 *  abrem a partir de `unlock` ("MM-DD"). Cada um aberto dá `prize`. */
export type EventGifts = { perLevel: number; unlock: string; kinds: string[]; prize: EventReward }

/** E6 (molde H): calendário de presença. 1 assinatura por dia; dia perdido se recupera por `recoverGold`; prêmio ao
 *  chegar a cada marco de assinaturas. */
export type EventAdvent = { days: number; recoverGold: number; milestones: [number, EventReward][] }

/** E7 (molde E): construção em níveis com materiais. Os amigos mandam `perFriend` por dia, e cada jogador manda só um
 *  tipo de `friendItems` (fixo pelo id dele). O que não está em `friendItems` (a estrela) sai da troca. */
export type EventBuild = { levels: { needs: [string, number][]; prize: EventReward }[]; friendItems: string[]; perFriend: number }

/** E8: oficina com receitas que destravam com N aberturas (`unlockAt`); a peça de decoração sai no N-ésimo item
 *  aberto daquela receita (sem sorte). Conjunto completo dá `setPrize`; `diplomaAt` aberturas dão o diploma. */
export type EventRecipe = { id: string; needs: [string, number][]; minutes: number; unlockAt: number; open: EventReward }
export type EventWorkshop = {
  npc: string; recipes: EventRecipe[]
  pieces: [recipe: string, nth: number, piece: string][]
  setPrize: EventReward; diplomaAt: number
}

/** E9: cartão ou presente mandado a um amigo: `charm` de popularidade para quem recebe. `charm: 0` = o item vai para o
 *  depósito do amigo (o corante da Páscoa); `free`: 1 por amigo por dia sem gastar o próprio (presente diário). */
export type EventSend = { id: string; name: string; charm: number; free?: boolean }

/** E13: a fazenda fica de noite o evento todo, ou amanhece às 7h00 e anoitece às 19h00. */
export type EventLight = 'noite' | 'dia-noite'

/** E14: bicho de evento (prêmio de troca ou de missão como `bicho:<id>`): passeia na fazenda de quem ganhou. Arte em
 *  `<dir>/<id>_sheet.png` (4×2), com o emoji no lugar enquanto a arte não chega. */
export type EventPet = { id: string; name: string; emoji: string; line: string }

/** Item só do evento no depósito (não vende). Ícone em public/art/ui/<icon>.png, com o emoji no lugar. */
export type EventItem = { id: string; name: string; icon: string; emoji: string }
