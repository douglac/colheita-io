import { inWindow, type EventCalendar } from './event-calendar'

// Nome do jogo: ÚNICO lugar onde ele é definido.
// `||` e não `??`: o Dockerfile passa o build arg vazio quando ninguém escolhe outro nome.
export const GAME_NAME = process.env.NEXT_PUBLIC_GAME_NAME || 'Colheita Feliz'
export const GAME_TAGLINE = 'Plante, colha e (com jeitinho) pegue a colheita dos amigos.'

// Servidor de teste fechado (APP_ENV=staging no build): mostra a faixa "versão de teste".
export const isStaging = (env: string | undefined = process.env.NEXT_PUBLIC_APP_ENV) => env === 'staging'

// Acelera todos os tempos de crescimento (só para testes locais). 1 = tempo real.
// No navegador chega por NEXT_PUBLIC_GROWTH_SPEED (next.config.ts), para a loja mostrar os mesmos tempos.
export const GROWTH_SPEED = Number(process.env.GROWTH_SPEED || process.env.NEXT_PUBLIC_GROWTH_SPEED || 1)

// Valores-base do balanceamento: tempos de 25 min a 48 h, preços em milhares. Estes multiplicadores levam
// esses números para o ritmo do jogo. PACE = 1 em tudo = valores-base sem escala. GROWTH_SPEED vem por cima (só QA).
export const PACE = {
  time: 1 / 8, // tempos das culturas e dos adubos (morango de 35 h → ~4 h 20)
  animalTime: 1 / 3, // estágios, ciclos de produção e barra de alimento dos bichos (galinha: 24 h por estágio → 8 h)
  gold: 1 / 10, // preços de semente, venda, adubo, bicho e ração (morango 1.550 → 155)
  land: 0.4, // multiplicador adicional do preço dos terrenos
  xp: 1 / 2, // XP por colheita (a curva daqui é ~1/4 da curva-base)
  level: 1 / 2, // nível mínimo de terreno e de semente (nível-base 20 → 10)
}
/** Horas-base → ms do jogo (culturas e adubos). */
export const origHoursMs = (h: number) => Math.round((h * 3600_000 * PACE.time) / GROWTH_SPEED)
/** Horas-base → ms do jogo (bichos). */
export const origAnimalMs = (h: number) => Math.round((h * 3600_000 * PACE.animalTime) / GROWTH_SPEED)
/** Ouro-base → ouro do jogo (nunca menos que 1). */
export const origGold = (g: number) => Math.max(1, Math.round(g * PACE.gold))
/** Preço-base de venda por unidade → do jogo, com 1 casa decimal (nabo 13 → 1,3): arredondar para inteiro
 *  mudaria o lucro das sementes baratas em até 25%. A venda soma tudo e arredonda para baixo no fim (salePrice). */
export const origUnit = (g: number) => Math.max(0.1, Math.round(g * PACE.gold * 10) / 10)

// No nível 1 e nas hortas dos vizinhos-bot, o nabo usa o tempo do tutorial.
// A partir do nível 2, usa o tempo-base multiplicado por PACE.time.
export const TUTORIAL = { seedId: 'nabo', minutes: 5, maxLevel: 1 }

// Eventos com data (dia e mês em Brasília). Natal: de 1º a 25 de dezembro. Fora da época, os itens do evento somem da loja.
// EVENTS_FORCE=natal (ou NEXT_PUBLIC_EVENTS_FORCE) liga um evento fora de época, só para QA.
export type GameEvent = 'natal'
export const EVENTS: Record<GameEvent, { name: string; from: [number, number]; to: [number, number] }> = {
  natal: { name: 'Natal', from: [12, 1], to: [12, 26] },
}
const FORCED_EVENTS = (process.env.NEXT_PUBLIC_EVENTS_FORCE || process.env.EVENTS_FORCE || '').split(',')
/** O evento está na época agora (horário de Brasília)? */
export function inSeason(ev: GameEvent, now: number): boolean {
  if (FORCED_EVENTS.includes(ev)) return true
  const d = new Date(now - 3 * 3600_000)
  const md = (d.getUTCMonth() + 1) * 100 + d.getUTCDate()
  const { from, to } = EVENTS[ev]
  return md >= from[0] * 100 + from[1] && md <= to[0] * 100 + to[1]
}

/** Hoje (horário de Brasília) está na janela do calendário do evento? Aceita data fixa que vira o ano e as datas
 *  móveis (Páscoa, n-ésimo domingo). Conta só do calendário; a regra completa (atalho de QA, fim exato, trava da
 *  semente) fica em events.ts. */
export function inCalendar(cal: EventCalendar, now: number): boolean {
  return inWindow(cal, now)
}

export const START_GOLD = 200
export const START_PLOTS = 6

// Dois jeitos de pegar da horta do amigo:
// - 'tap' (padrão): cada toque leva 1 unidade ("x 1"), até o dono chegar ao piso.
//   O limite do dia conta unidades e o servidor exige um intervalo mínimo entre toques.
// - 'chunk': 1 tentativa por lote por safra, levando perSteal da safra (a regra anterior).
export type StealMode = 'tap' | 'chunk'

export const STEAL = {
  mode: 'tap' as StealMode,
  // Fração da safra que sempre fica com o dono (o piso que ninguém rouba), quando a cultura ou o bicho não traz o
  // dele (`min_output` por item: nabo 21 de 36, melão 32 de 40, caviar 3 de 20).
  ownerFloor: 0.6,
  // 'chunk': fração da safra levada por roubo (mínimo 1 unidade).
  perSteal: 0.1,
  // 'chunk': roubos (tentativas) por ladrão por dia (UTC-3, horário de Brasília).
  dailyLimit: 20,
  // 'tap': unidades por ladrão por dia (20 tentativas × ~3 unidades do 'chunk').
  dailyUnits: 60,
  // 'tap': intervalo mínimo entre dois toques do mesmo ladrão (anti-clique automático).
  tapMinMs: 250,
  // Conta nova só rouba de jogador real depois disso (dos vizinhos-bot pode: é o tutorial).
  quarantineMs: 10 * 60_000,
  // XP por lote roubado (no 'tap', só no 1º toque de cada lote por safra).
  xp: 1,
  // Aviso ao dono: toques do mesmo ladrão no mesmo lote dentro deste tempo viram uma linha só no mural.
  groupMs: 2 * 60_000,
}

export const SELL_ALL_MIN_QTY = 1

// Semente inicial no depósito: o tutorial planta sem precisar abrir a loja.
export const START_SEEDS = { nabo: 6 }

// Cuidados. Tempos em "tempo de jogo": divididos por GROWTH_SPEED.
export const CARE = {
  dryChance: 0.3, // chance de secar na metade do crescimento
  dryLimitMs: 2 * 3600_000, // seco por mais que isso → penalidade
  dryPenalty: 10, // pontos de saúde
  naturalPestChance: 0.25,
  naturalWeedChance: 0.25,
  penaltyPer: 5, // por praga/erva ativa
  maxPenalty: 30, // teto das pragas/ervas
  maxPerPlot: 3, // pragas (ou ervas) por lote
  throwDaily: 10, // pragas e ervas que cada um pode jogar por dia (cada tipo)
  helpDaily: 50, // ajudas por dia que dão recompensa
  helpXp: 2,
  helpGold: 1, // só na fazenda alheia
}

// Cachorro de guarda: ração (sem ração dorme e não morde) e prazo por raça.
export const DOG = {
  feedMs: 24 * 3600_000, // cada ração enche o pote por 24 h
  maxFedMs: 7 * 24 * 3600_000, // pote cheio para no máximo 7 dias
  hungryWarnMs: 6 * 3600_000, // aviso no registro: ração acabando
  leavingWarnMs: 2 * 24 * 3600_000, // aviso no registro: raça indo embora
}

export type DogBreed = {
  id: string; name: string; gold: number; minLevel: number
  bite: number // chance de morder quem tenta roubar (acordado)
  finePct: number; fineMax: number // multa: % do ouro do ladrão, com teto, que vai para o dono
  days: number | null // prazo (null = permanente, como o vira-lata)
  width: number // tamanho na cena
  guard?: boolean // guarda no lugar do cachorro (cabra, cavalo, avestruz): mesma casinha, ração e mordida
  icon?: string // ícone da loja e da ficha (Icon.tsx); sem ele, `ui/dog_<raça>`
  cry?: string // fala no balão quando morde; sem ela, "Au! Au!"
}

export const DOG_BREEDS: Record<string, DogBreed> = {
  vira_lata: { id: 'vira_lata', name: 'Vira-lata', gold: 500, minLevel: 3, bite: 0.25, finePct: 0.05, fineMax: 100, days: null, width: 76 },
  salsicha: { id: 'salsicha', name: 'Salsicha', gold: 1500, minLevel: 5, bite: 0.4, finePct: 0.08, fineMax: 200, days: 30, width: 70 },
  pastor: { id: 'pastor', name: 'Pastor', gold: 4000, minLevel: 8, bite: 0.55, finePct: 0.12, fineMax: 400, days: 30, width: 92 },
  // Guardas: ocupam o espaço do cachorro e mordem ladrão. Força 50 (a do Mastim, a maior), nível 6, 30 dias;
  // Cabra 100.000 de ouro (ou 100 verdes), Cavalo 120 verdes, Avestruz 75 verdes. Ouro × PACE.gold, nível × PACE.level;
  // verdes a 1.000 de ouro cada, como nos bichos de livestock.ts. Mordida e multa: um degrau acima do
  // Pastor (força 40). Todos comem a mesma ração do cachorro.
  guarda_cabra: { id: 'guarda_cabra', name: 'Guarda Cabra', gold: origGold(100_000), minLevel: 3, bite: 0.6, finePct: 0.14, fineMax: 500, days: 30, width: 76, guard: true, icon: 'animals/goat_idle_0', cry: 'Béé! Béé!' },
  guarda_avestruz: { id: 'guarda_avestruz', name: 'Guarda Avestruz', gold: origGold(75_000), minLevel: 3, bite: 0.6, finePct: 0.14, fineMax: 500, days: 30, width: 86, guard: true, icon: 'animals/guarda_avestruz_idle', cry: 'Bum! Bum!' },
  guarda_cavalo: { id: 'guarda_cavalo', name: 'Guarda Cavalo', gold: origGold(120_000), minLevel: 3, bite: 0.6, finePct: 0.14, fineMax: 500, days: 30, width: 92, guard: true, icon: 'animals/guarda_cavalo_idle', cry: 'Iiirrí!' },
}
/** Ícone da raça (loja, ficha do cachorro). */
export const dogIcon = (id: string) => DOG_BREEDS[id]?.icon ?? `dog_${id}`

// Patrulha do cachorro: quando ele vira de costas para a planta, é a hora de pegar. A patrulha é determinística por tempo (semente do dono + relógio): o servidor
// sabe para onde o cachorro olha sem perguntar ao cliente. Regras em src/game/patrol.ts.
export const PATROL = {
  cycleMs: 16_000, // um vaivém completo (as pausas e o "olhar em volta" variam a cada ciclo)
  reach: 45, // quanto ele anda para cada lado da casinha/lugar dele (unidades do mundo)
  speed: 45, // mesma velocidade do passeio da cena
  graceMs: 400, // atraso da rede: vale o mais favorável ao ladrão entre agora e 400 ms atrás
  deadZone: 24, // lote quase reto embaixo do cachorro: ele vê (conta como "de frente")
  // Chance de mordida por toque × fator. De costas é muito baixa; de frente, alta. Com o cachorro de
  // costas metade do tempo, a média fica igual à calibração do modo 'tap' (backMult + frontMult = 2).
  backMult: 0.15,
  frontMult: 1.85,
  maxBite: 0.95,
}

// Nível do cachorro por ossos (nível N pede 10·N ossos).
// O osso só se ganha jogando (bônus diário, missões, ajudar amigos).
export const DOG_LEVEL = {
  max: 5,
  bonesFor: (level: number) => 10 * level, // ossos para passar do nível level−1 ao level
  bitePer: 0.06, // cada nível tira 6% da chance de o ladrão escapar: 1 − (1 − b)·(1 − 0,06·N)
  finePer: 0.1, // cada nível aumenta a multa (e o teto) em 10%
  // De onde vêm os ossos (de graça):
  loginBones: 1, // bônus diário
  missionBones: 1, // cada missão do dia recebida
  helpEvery: 5, // 1 osso a cada 5 ajudas na horta de amigos...
  helpMaxDaily: 2, // ...até 2 por dia
}

// Terrenos: de 6 até 24 lotes, comprados um a um.
export const MAX_PLOTS = 24
// Tabela-base: `enlargeFieldCosts` (verdes) e `enlargeFieldGrades` (nível), 29 terrenos.
// O n-ésimo terreno custa VERDES[n]·9.000 de ouro.
// Aqui em escala: ouro × PACE.gold × PACE.land e nível × PACE.level (5 → 3 … 39 → 20). O layout para no 18º (24 lotes).
export const LAND_ORIGINAL_GREENS = [1, 2, 3, 5, 7, 9, 12, 15, 18, 23, 30, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 170, 200, 240, 290, 350, 420, 500]
export const LAND_ORIGINAL_LEVELS = [5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 43, 45, 47, 50, 55, 62, 70, 79, 89, 100]
export const landOriginal = (n: number) => {
  const i = Math.min(n, LAND_ORIGINAL_GREENS.length) - 1
  return { gold: LAND_ORIGINAL_GREENS[i] * 9000, minLevel: LAND_ORIGINAL_LEVELS[i] }
}
export const landPrice = (n: number) => {
  const o = landOriginal(n)
  return { gold: Math.round((o.gold * PACE.gold * PACE.land) / 10) * 10, minLevel: Math.round(o.minLevel * PACE.level + 0.01) }
}

// Bônus de login diário por dia seguido (o 7º em diante repete o último).
export const LOGIN_BONUS = [20, 30, 40, 50, 60, 80, 100]

// Popularidade (flores): +1% no preço de venda por ponto, até 50%, pago no
// "Vender tudo" como prêmio pela popularidade.
export const POPULARITY_CAP = 50

// Level-up compartilhado. Quem abre o link ganha 100 XP, uma vez por link (quem compartilhou + nível), até 3 links por dia;
// cada jogador dá XP a no máximo 30 pessoas por dia pelos links dele (limite anti-abuso).
export const SHARE_XP = { xp: 100, perViewerDay: 3, perSharerDay: 30 }

// Convite: os dois ganham ouro; o 1º amigo convidado traz um Vira-lata grátis.
export const INVITE = { gold: 50, seeds: { cenoura: 3 } }

// Presente diário: 1 por amigo por dia, uma semente comum que o remetente já desbloqueou.
export const GIFT_SEEDS = ['nabo', 'cenoura', 'milho', 'tomate'] as const

// Baú do tesouro ao limpar planta seca. Chance pequena, ouro fixo e baixo, decidido no servidor, e no máximo
// `daily` baús por dia (base de 12 × PACE.gold daria 1 de ouro, que ninguém sente; 10 ≈ um punhado de sementes baratas).
export const CHEST = { chance: 0.03, gold: 10, daily: 3 }

// XP ao plantar: 1 por semente (curva mais curta).
export const PLANT_XP = 1

// Adubos: todos "somente uma vez por estágio".
// Comum 50 de ouro, −1 h; Rápido 350, −2 h 30; Super 1.000, −5 h 30. A "Luz do Sol Mágica" (paga) fica fora.
// Preço × PACE.gold e corte × PACE.time. O id 'adubo_forte' continua (inventários antigos) e é o Rápido.
export type Fertilizer = { id: string; name: string; origGold: number; origCutH: number; minLevel: number }
export const FERTILIZERS: Record<string, Fertilizer> = {
  adubo: { id: 'adubo', name: 'Adubo comum', origGold: 50, origCutH: 1, minLevel: 1 },
  adubo_forte: { id: 'adubo_forte', name: 'Adubo rápido', origGold: 350, origCutH: 2.5, minLevel: 1 },
  adubo_super: { id: 'adubo_super', name: 'Super adubo', origGold: 1000, origCutH: 5.5, minLevel: 2 },
}
/** Quanto o adubo adianta a planta, em ms do jogo. */
export const fertCutMs = (f: Fertilizer) => origHoursMs(f.origCutH)

// Horta madura: aviso ao dono e o "plantão de roubo" dos amigos.
export const RIPE_ALERT = {
  friendDaily: 3, // avisos por amigo por dia (dia de Brasília)
  perOwnerGapMs: 2 * 3600_000, // o mesmo amigo ouve falar da mesma horta no máximo a cada 2 h
  // Silêncio para os amigos das 23h às 8h (America/Sao_Paulo). RIPE_QUIET="0-0" desliga (só para QA à noite).
  quietFrom: Number((process.env.RIPE_QUIET ?? '23-8').split('-')[0]),
  quietTo: Number((process.env.RIPE_QUIET ?? '23-8').split('-')[1]),
  groupMs: 90_000, // espera lotes que amadurecem logo em seguida para mandar um aviso só
  maxWaitMs: 5 * 60_000, // mas nunca segura um lote maduro por mais que isso
  staleMs: 6 * 3600_000, // maduro há mais que isso (servidor ficou fora do ar): só marca, não avisa
  sweepMs: 60_000, // varredura de garantia (além do timer para o próximo lote)
}

// Bônus diário: além do ouro, 1 semente grátis que muda a cada dia (entre as que o jogador já planta).
export const DAILY_SEEDS = ['nabo', 'cenoura', 'milho', 'tomate', 'morango', 'batata', 'abobora'] as const

// Fertilizante do Amor: grátis, 1 por dia, só na horta de um amigo; adianta como o adubo comum (−1 h).
export const LOVE = { daily: 1, origCutH: 1, xp: 3 }

// Link da comunidade (grupo/fórum). Vazio = o botão "Comunidade" não aparece.
export const COMMUNITY_URL = process.env.NEXT_PUBLIC_COMMUNITY_URL ?? ''

// Decoração: só ouro e sem prazo.
// Peças das séries: o preço-base × PACE.gold (a mesma escala de sementes, bichos e ração).
// Enfeites soltos: fração do 1º terreno (landPrice), na mesma escala.
export const DECOR = {
  // Ouro-base de cada peça, igual em todas as séries.
  pieceGoldOriginal: { fundo: 24888, casa: 19999, enfeite: 7888, casinha: 6999, cerca: 5688 },
  // Conjunto: sai pela soma das peças que faltam (sem desconto); na base, 65.462 = soma exata das 5 peças.
  // O botão "Comprar conjunto" é atalho: compra o que falta e equipa as 5 peças de uma vez.
  setDiscount: 0,
  // XP na compra de decoração: 1 XP a cada 20 de ouro.
  goldPerXp: 20,
  // Enfeites soltos colocados: 4 + nível/2, até 40.
  maxOrnaments: (level: number) => Math.min(40, 4 + Math.floor(level / 2)),
  // Caminho: células pintadas no máximo (separado dos enfeites; cada célula é do tamanho de um lote)
  // e quantas vêm em cada pacote.
  maxPathCells: 80,
  pathPack: 10,
}

/** Preço do enfeite solto: fração do 1º terreno, maior para nível alto e pegada grande (arredondado a 10). */
export const ornamentPrice = (minLevel: number, cells: number) =>
  Math.round((landPrice(1).gold * (0.3 + 0.08 * minLevel) * Math.sqrt(cells)) / 10) * 10

