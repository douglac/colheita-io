// Conteúdo dos eventos sazonais: um bloco por evento, só dados (as regras ficam em events.ts).
// Para um evento novo: declare aqui datas (fixas, presas à Páscoa ou ao n-ésimo domingo), culturas, séries, moeda,
// trocas, missões e as mecânicas opcionais E3–E14 (event-types.ts), ponha a arte em public/art/event/<id>/ e acrescente
// em EVENT_DEFS (validateEvent e tests/evo13.test.ts conferem).
import type { OrigSeed } from './catalog'
import type { EventDef } from './event-types'

// ---------- Dia das Bruxas ----------
// Tigela de 10 doces que os amigos "roubam", a 1ª cheia de graça e as outras com 1 pacote de doces; vazia, prêmio
// para o dono; visitantes 3 por dia; Abóbora-de-halloween (5 h; 28 × 240; 3.000; 30 XP).

/** Abóbora-de-halloween, a semente do Dia das Bruxas. */
// Estágios: 5 h em 5 trechos iguais (h: 5).
export const HALLOWEEN_SEEDS: OrigSeed[] = [
  { id: 'abobora_halloween', name: 'Abóbora-de-halloween', seasons: 1, h: 5, out: 28, unit: 240, gold: 3000, level: 0, xp: 30, event: 'halloween', color: 0xf07a1a, leaf: 0x3f7f2f },
]

export const HALLOWEEN: EventDef = {
  id: 'halloween',
  name: 'Dia das Bruxas',
  tagline: 'Gostosuras na fazenda!',
  // 20/out a 5/nov (horário de Brasília), a janela que o projeto adotou .
  calendar: { start: '10-20', end: '11-05' },
  art: { icon: 'event/halloween/hud_icon', banner: '/art/event/halloween/mural_banner.png', dir: '/art/event/halloween', text: { x: 37, y: 32, w: 29, h: 31, fs: 3.4 } },
  seeds: HALLOWEEN_SEEDS.map((s) => s.id),
  series: ['bruxinha'],
  currency: { id: 'doce_halloween', name: 'Doce', plural: 'doces', icon: 'produto_doce_halloween', emoji: '🍬' },
  // Pacote de doces: só por ouro (nada de dinheiro real em item de evento) e nas missões do evento. Preço estimado.
  shop: [{ id: 'pacote_doces', name: 'Pacote de doces', gold: 300, desc: 'Enche de novo a sua tigela de doces (10 doces para os amigos)', icon: 'produto_doce_halloween', emoji: '🍭' }],
  harvestCandy: 2, // cada colheita de abóbora-de-halloween rende 2 doces
  graceH: 2,
  // Quem pega ganha 1 doce e XP; prêmio do dono fixo (sem sorteio, regra do projeto).
  bowl: {
    capacity: 10, refillItem: 'pacote_doces', takeXp: 3, takerDaily: 10,
    prize: { gold: 100, xp: 25, items: [['semente:abobora_halloween', 1], ['adubo_forte', 1]] },
  },
  // Visitantes: 3 por dia, um toque espanta, prêmio fixo.
  critters: {
    kinds: [
      { id: 'fantasma', name: 'Fantasminha', line: 'Buu! 👻' },
      { id: 'zumbizinho', name: 'Zumbizinho', line: 'Gostosura\nou travessura?' },
    ],
    perDay: 3, gold: 20, xp: 2,
  },
  trades: [
    { id: 'semente', give: 2, item: 'semente:abobora_halloween', qty: 1, kind: 'item' },
    { id: 'adubo', give: 3, item: 'adubo_forte', qty: 1, kind: 'item' },
    { id: 'enfeite', give: 12, item: 'enfeite:bruxinha', qty: 1, kind: 'decor' },
    { id: 'casinha', give: 16, item: 'casinha:bruxinha', qty: 1, kind: 'decor' },
  ],
  // Molde B (missão em cadeia). Prêmios na régua de 1.000–5.000 moedas e 50–200 XP × PACE.
  missions: [
    { kind: 'take', target: 3, title: 'Doce ou travessura', text: 'Pegue doce na tigela de 3 amigos', reward: { gold: 100, xp: 25 } },
    { kind: 'plant', target: 4, title: 'Horta assombrada', text: 'Plante 4 abóboras-de-halloween', reward: { gold: 100, xp: 40, candy: 2, items: [['pacote_doces', 1]] } },
    { kind: 'shoo', target: 3, title: 'Visitas da noite', text: 'Espante 3 visitantes da sua fazenda', reward: { gold: 150, xp: 40 } },
    { kind: 'harvest', target: 4, title: 'Colheita das bruxas', text: 'Colha 4 abóboras-de-halloween', reward: { gold: 150, xp: 40, candy: 3 } },
    { kind: 'fill', target: 1, title: 'Gostosuras à vista', text: 'Encha a sua tigela de doces de novo', reward: { gold: 300, xp: 50 } },
    { kind: 'trade', target: 1, title: 'Barraca de trocas', text: 'Troque doces por um prêmio', reward: { gold: 500, xp: 100 } },
  ],
}

// ---------- Natal ----------
// Troca de presentes, decoração grátis, árvore de 3 níveis com materiais dos amigos, presentes trancados até 25/12,
// boneco de neve com 10 amigos, 24 meias e renas feridas.
export const NATAL_SEEDS: OrigSeed[] = [
  // Pinheiro: o "pinheiro sem decoração" sai com 1 enfeite fixo, sem chance.
  { id: 'pinheiro_natal', name: 'Pinheiro', seasons: 4, h: 27, re: 11, out: 51, unit: 61, gold: 5633, level: 13, xp: 30, event: 'natal', color: 0x2e7d32, leaf: 0x1f5f2a },
  // arvore_natal já existe em catalog.ts com greens: 6 → passa a gold: 6000 e event: 'natal'.
]

export const NATAL: EventDef = {
  id: 'natal',
  name: 'Natal',
  tagline: 'Deixe o espírito das festas invadir sua fazenda',
  calendar: { start: '12-01', end: '12-26' },
  art: { icon: 'event/natal/hud_icon', banner: '/art/event/natal/mural_banner.png', dir: '/art/event/natal', text: { x: 14, y: 31, w: 71, h: 25, fs: 3.8 } },
  seeds: ['pinheiro_natal', 'arvore_natal'],
  series: ['natal'],
  freeSeries: true, // NOVO (E10): série grátis ao entrar no jogo
  currency: { id: 'enfeite_natal', name: 'Enfeite', plural: 'enfeites', icon: 'produto_enfeite_natal', emoji: '🎄' },
  shop: [],
  harvestCandy: 2, // cada colheita de pinheiro ou de árvore de Natal rende 2 enfeites
  graceH: 2,
  bowl: null,
  // Renas feridas: um toque cura, com prêmio fixo (sem pomada).
  critters: {
    kinds: [
      { id: 'rena_ferida', name: 'Rena machucada', line: 'Obrigada! 🦌' },
    ],
    perDay: 3, gold: 20, xp: 2,
  },
  // NOVO (E7): árvore de Natal, 3 níveis × (10 velas, 10 fitas, 10 doces, 1 estrela). Cada jogador manda só
  // 1 tipo (sorteado de forma fixa pelo id do jogador, sem aleatoriedade por pedido). A estrela não vem de amigo: sai na troca.
  build: {
    levels: [
      { needs: [['vela', 10], ['fita', 10], ['doce_natal', 10], ['estrela', 1]], prize: { gold: 150, xp: 40 } },
      { needs: [['vela', 10], ['fita', 10], ['doce_natal', 10], ['estrela', 1]], prize: { gold: 250, xp: 60 } },
      { needs: [['vela', 10], ['fita', 10], ['doce_natal', 10], ['estrela', 1]], prize: { gold: 400, xp: 100 } },
    ],
    friendItems: ['vela', 'fita', 'doce_natal'], perFriend: 1, // 1 material por amigo por dia
  },
  // NOVO (E5): 10 presentes por nível da árvore; o amigo pendura 1 por dia, de graça.
  gifts: {
    perLevel: 10, unlock: '12-25', // "Você não pode abrir os presentes até o Natal."
    kinds: ['bola_cristal', 'cesta_natal', 'cartao_natal', 'ursinho', 'almofada', 'copo_cafe', 'sobremesa_natal', 'gramofone'],
    prize: { gold: 30, xp: 5 }, // cada presente aberto
  },
  // NOVO (E4): boneco de neve. 10 amigos, 7 dias; prêmio 5.000 ouro e 700 XP × PACE.
  help: { id: 'boneco_neve', name: 'Boneco de neve', friends: 10, days: 7, prize: { gold: 500, xp: 350 } },
  // NOVO (E6): 24 meias, dia perdido por 3.000 de ouro × PACE.
  advent: {
    days: 24, recoverGold: 300,
    milestones: [[3, { gold: 100, items: [['adubo_forte', 2]] }], [7, { gold: 200, xp: 50 }], [12, { gold: 300, items: [['enfeite:natal', 1]] }],
      [18, { gold: 400, xp: 100 }], [24, { gold: 500, xp: 150, items: [['semente:pinheiro_natal', 3]] }]],
  },
  // Troca (aba "Presente de Natal"), com o custo em enfeites.
  trades: [
    { id: 'biscoitinho', give: 2, item: 'presente:biscoitinho_natal', qty: 1, kind: 'item' }, // 8 de popularidade
    { id: 'sino', give: 3, item: 'presente:sino_natal', qty: 1, kind: 'item' }, // 12
    { id: 'bala', give: 3, item: 'presente:bala_natal', qty: 1, kind: 'item' }, // 20
    { id: 'pacote', give: 5, item: 'presente:pacote_natal', qty: 1, kind: 'item' }, // 21
    { id: 'meia', give: 6, item: 'presente:meia_natal', qty: 1, kind: 'item' }, // 30
    { id: 'rena', give: 10, item: 'presente:rena_natal', qty: 1, kind: 'item' }, // 55
    { id: 'estrela', give: 5, item: 'estrela', qty: 1, kind: 'item' }, // a estrela do topo da árvore
    { id: 'cesta_rosas', give: 50, item: 'presente:cesta_rosas', qty: 1, kind: 'item' }, // 280
  ],
  // NOVO (E9): os presentes da troca vão para um amigo, com popularidade de 8 a 280.
  send: [
    { id: 'presente:biscoitinho_natal', name: 'Biscoitinho de Natal', charm: 8 },
    { id: 'presente:sino_natal', name: 'Sino de Natal', charm: 12 },
    { id: 'presente:bala_natal', name: 'Bala de Natal', charm: 20 },
    { id: 'presente:pacote_natal', name: 'Pacote de Natal', charm: 21 },
    { id: 'presente:meia_natal', name: 'Meia de Natal', charm: 30 },
    { id: 'presente:rena_natal', name: 'Rena de pelúcia', charm: 55 },
    { id: 'presente:cesta_rosas', name: 'Cesta de rosas', charm: 280 },
  ],
  items: [
    { id: 'vela', name: 'Vela', icon: 'produto_vela', emoji: '🕯️' },
    { id: 'fita', name: 'Fita', icon: 'produto_fita', emoji: '🎀' },
    { id: 'doce_natal', name: 'Doce de Natal', icon: 'produto_doce_natal', emoji: '🍭' },
    { id: 'estrela', name: 'Estrela', icon: 'produto_estrela', emoji: '⭐' },
    // Os 8 presentes que os amigos penduram
    { id: 'presente:bola_cristal', name: 'Bola de cristal', icon: 'presente_bola_cristal', emoji: '🔮' },
    { id: 'presente:cesta_natal', name: 'Cesta de Natal', icon: 'presente_cesta_natal', emoji: '🧺' },
    { id: 'presente:cartao_natal', name: 'Cartão de Natal', icon: 'presente_cartao_natal', emoji: '💌' },
    { id: 'presente:ursinho', name: 'Ursinho', icon: 'presente_ursinho', emoji: '🧸' },
    { id: 'presente:almofada', name: 'Almofada', icon: 'presente_almofada', emoji: '🛋️' },
    { id: 'presente:copo_cafe', name: 'Copo de café', icon: 'presente_copo_cafe', emoji: '☕' },
    { id: 'presente:sobremesa_natal', name: 'Sobremesa', icon: 'presente_sobremesa', emoji: '🍰' },
    { id: 'presente:gramofone', name: 'Gramofone', icon: 'presente_gramofone', emoji: '📯' },
    // Os presentes da troca
    { id: 'presente:biscoitinho_natal', name: 'Biscoitinho de Natal', icon: 'presente_biscoitinho_natal', emoji: '🍪' },
    { id: 'presente:sino_natal', name: 'Sino de Natal', icon: 'presente_sino_natal', emoji: '🔔' },
    { id: 'presente:bala_natal', name: 'Bala de Natal', icon: 'presente_bala_natal', emoji: '🍬' },
    { id: 'presente:pacote_natal', name: 'Pacote de Natal', icon: 'presente_pacote_natal', emoji: '🎁' },
    { id: 'presente:meia_natal', name: 'Meia de Natal', icon: 'presente_meia_natal', emoji: '🧦' },
    { id: 'presente:rena_natal', name: 'Rena de pelúcia', icon: 'presente_rena_natal', emoji: '🦌' },
    { id: 'presente:cesta_rosas', name: 'Cesta de rosas', icon: 'presente_cesta_rosas', emoji: '🌹' },
  ],
  // Molde B (missão em cadeia).
  missions: [
    { kind: 'plant', target: 1, title: 'Pinheiro sem decoração', text: 'Plante um pinheiro', reward: { gold: 100, xp: 25 } },
    { kind: 'checkin', target: 3, title: 'Super Pacote do Papai Noel', text: 'Assine o calendário de meias 3 vezes', reward: { gold: 100, xp: 25 } },
    { kind: 'build', target: 1, title: 'Existe uma árvore de Natal em cada casa', text: 'Decore o pinheiro para virar uma árvore de Natal', reward: { gold: 150, xp: 40 } }, // NOVO kind
    { kind: 'visit', target: 5, title: 'Visite os amigos', text: 'Visite 5 amigos', reward: { gold: 150, xp: 40 } }, // NOVO kind
    { kind: 'send', target: 1, title: 'Envie um presente de Natal', text: 'Envie 1 presente de Natal a um amigo', reward: { gold: 100, xp: 25 } },
    { kind: 'help', target: 1, title: 'Vamos fazer nevar', text: 'Ajude a montar o boneco de neve de um amigo', reward: { gold: 150, xp: 40 } }, // NOVO kind
    { kind: 'build', target: 2, title: 'Faça a sua contribuição!', text: 'Aprimore sua árvore de Natal', reward: { gold: 300, xp: 50 } },
    { kind: 'open', target: 7, title: 'Receber votos', text: 'Abra 7 presentes depois da chegada do Natal', reward: { gold: 500, xp: 100 } }, // NOVO kind
  ],
}

// ---------- Ano-Novo ----------
// Lótus-chiba, Flor-albízia, cartão para amigo e baú de flores diário aberto pelos amigos.
export const ANO_NOVO_SEEDS: OrigSeed[] = [
  { id: 'lotus_chiba', name: 'Lótus-chiba', seasons: 1, h: 16, out: 25, unit: 180, gold: 2000, level: 0, xp: 28, event: 'ano_novo', color: 0xf3a6c8, leaf: 0x3f8f35 }, // nível a confirmar
  { id: 'albizia', name: 'Flor-albízia', seasons: 2, h: 15.05, re: 6.55, out: 25, unit: 200, gold: 3500, level: 0, xp: 35, event: 'ano_novo', color: 0xff8fb0, leaf: 0x4f9f3f },
]

export const ANO_NOVO: EventDef = {
  id: 'ano_novo',
  name: 'Ano-Novo',
  tagline: 'Feliz Ano Novo!',
  calendar: { start: '12-29', end: '01-05' }, // vira o ano (o motor já aceita)
  art: { icon: 'event/ano_novo/hud_icon', banner: '/art/event/ano_novo/mural_banner.png', dir: '/art/event/ano_novo', text: { x: 25, y: 20, w: 50, h: 52, fs: 5, light: true } },
  seeds: ['lotus_chiba', 'albizia'],
  series: ['belo_ano_novo'],
  currency: { id: 'estrelinha', name: 'Estrelinha', plural: 'estrelinhas', icon: 'produto_estrelinha', emoji: '✨' },
  shop: [],
  harvestCandy: 2,
  graceH: 2,
  bowl: null,
  critters: null,
  // NOVO (E4): baú de flores diário, 5 amigos (base de jogadores pequena).
  help: { id: 'bau_flores', name: 'Baú de flores', friends: 5, days: 1, daily: true, prize: { gold: 100, xp: 50, items: [['semente:lotus_chiba', 2], ['semente:albizia', 1]] } },
  // NOVO (E9): cartão de Ano-Novo feito na troca e mandado a um amigo (popularidade para quem recebe).
  send: [{ id: 'cartao_ano_novo', name: 'Cartão de Ano-Novo', charm: 10 }],
  items: [
    { id: 'cartao_ano_novo', name: 'Cartão de Ano-Novo', icon: 'cartao_ano_novo', emoji: '💌' },
    { id: 'presente:bolo_ano_novo', name: 'Bolo de Ano-Novo', icon: 'presente_bolo_ano_novo', emoji: '🎂' },
  ],
  trades: [
    { id: 'cartao', give: 3, item: 'cartao_ano_novo', qty: 1, kind: 'item' },
    { id: 'bolo', give: 6, item: 'presente:bolo_ano_novo', qty: 1, kind: 'item' }, // bolo da Máquina de Creme, aqui por troca
    { id: 'adubo', give: 3, item: 'adubo_forte', qty: 1, kind: 'item' },
    { id: 'enfeite', give: 12, item: 'enfeite:belo_ano_novo', qty: 1, kind: 'decor' },
    { id: 'casinha', give: 16, item: 'casinha:belo_ano_novo', qty: 1, kind: 'decor' },
  ],
  missions: [
    { kind: 'harvest', target: 4, title: 'O Ano Novo está chegando', text: 'Colha 4 lótus-chiba', of: 'lotus_chiba', reward: { gold: 100, xp: 25, items: [['semente:albizia', 2]] } },
    { kind: 'harvest', target: 4, title: 'Presente dos amigos', text: 'Colha 4 flores-albízia', of: 'albizia', reward: { gold: 150, xp: 40, items: [['fundo:belo_ano_novo', 1]] } }, // "Cenário do Belo Ano Novo"
    { kind: 'visit', target: 1, title: 'Você já visitou seus amigos?', text: 'Visite 1 amigo', reward: { gold: 100, xp: 25 } },
    { kind: 'send', target: 1, title: 'Comece o ano com estilo', text: 'Envie 1 cartão de Ano-Novo a um amigo', reward: { gold: 150, xp: 40 } },
    { kind: 'help', target: 1, title: 'Baú de flores', text: 'Abra o seu baú de flores com a ajuda dos amigos', of: 'abrir', reward: { gold: 300, xp: 50 } },
    { kind: 'trade', target: 1, title: 'Bons votos', text: 'Troque estrelinhas por um prêmio', reward: { gold: 500, xp: 100 } },
  ],
}

// ---------- Carnaval ----------
// Árvore-de-serpentina, cabaceira e bichos fantasiados. A mecânica social é o "bloco" abaixo.
export const CARNAVAL_SEEDS: OrigSeed[] = [
  { id: 'serpentina', name: 'Árvore-de-serpentina', seasons: 3, h: 33, re: 12, out: 32, unit: 186, gold: 8900, level: 20, xp: 17, event: 'carnaval', color: 0xff5fa2, leaf: 0x3fbf5f },
  // cabaceira já existe em catalog.ts (greens: 6) → gold: 5000 e event: 'carnaval'.
]

export const CARNAVAL: EventDef = {
  id: 'carnaval',
  name: 'Carnaval',
  tagline: 'Abram alas pro bloco do Colheita Feliz!',
  calendar: { rule: 'pascoa', from: -58, to: -46 }, // NOVO (E1): da sexta, uma semana antes, até a Quarta-feira de Cinzas
  art: { icon: 'event/carnaval/hud_icon', banner: '/art/event/carnaval/mural_banner.png', dir: '/art/event/carnaval', bowl: 'saco', text: { x: 34, y: 28, w: 61, h: 52, fs: 4.4 } },
  seeds: ['serpentina', 'cabaceira'],
  series: ['folia'],
  currency: { id: 'confete', name: 'Confete', plural: 'confetes', icon: 'produto_confete', emoji: '🎊' },
  shop: [],
  harvestCandy: 2,
  graceH: 2,
  // "Bloco": a tigela vira um saco de confete. O amigo "joga confete" na sua fazenda (1 por dia) e os dois ganham.
  items: [{ id: 'saco_confete', name: 'Saco de confete', icon: 'produto_saco_confete', emoji: '🎊' }],
  bowl: {
    capacity: 10, refillItem: 'saco_confete', takeXp: 3, takerDaily: 10,
    prize: { gold: 100, xp: 25, items: [['semente:serpentina', 1]] },
  },
  // Os bichos fantasiados passam pela fazenda; um toque e eles dançam e soltam confete.
  critters: {
    kinds: [
      { id: 'gapirata', name: 'Gapirata', line: 'Arrr! 🏴‍☠️' },
      { id: 'porconfetti', name: 'Porconfetti', line: 'Confete pra todo lado!' },
      { id: 'vacalhaco', name: 'Vacalhaço', line: 'Muuu-hahaha! 🤡' },
      { id: 'ovelheira', name: 'Ovelheira', line: 'Olha o desfile!' },
    ],
    perDay: 3, gold: 20, xp: 2,
  },
  trades: [
    { id: 'semente', give: 2, item: 'semente:serpentina', qty: 1, kind: 'item' },
    { id: 'saco', give: 4, item: 'saco_confete', qty: 1, kind: 'item' },
    { id: 'enfeite', give: 12, item: 'enfeite:folia', qty: 1, kind: 'decor' }, // Jardim Trio Elétrico
    { id: 'casinha', give: 16, item: 'casinha:folia', qty: 1, kind: 'decor' },
  ],
  missions: [
    { kind: 'take', target: 3, title: 'Cair na folia', text: 'Jogue confete na fazenda de 3 amigos', reward: { gold: 100, xp: 25 } },
    { kind: 'plant', target: 4, title: 'Serpentina no pé', text: 'Plante 4 árvores-de-serpentina', of: 'serpentina', reward: { gold: 100, xp: 40 } },
    { kind: 'shoo', target: 3, title: 'Desfile na fazenda', text: 'Dance com 3 foliões que passarem pela sua fazenda', reward: { gold: 150, xp: 40 } },
    { kind: 'harvest', target: 4, title: 'Chuva de serpentina', text: 'Colha 4 árvores-de-serpentina', of: 'serpentina', reward: { gold: 150, xp: 40, candy: 3 } },
    { kind: 'fill', target: 1, title: 'Mais confete!', text: 'Encha o seu saco de confete de novo', reward: { gold: 300, xp: 50 } },
    { kind: 'trade', target: 1, title: 'Fim do bloco', text: 'Troque confetes por um prêmio', reward: { gold: 500, xp: 100 } },
  ],
}

// ---------- Páscoa ----------
// Coelho Mágico, ovos em 3 níveis com Corante, contador de aberturas 3/9/21/90, Ovo Gigante com os amigos,
// decoração de 5 peças ganha abrindo ovos, Coelho da Páscoa pelo conjunto completo, diploma.
// Sem sorte: cada peça sai num número fixo de ovos abertos.
export const PASCOA_SEEDS: OrigSeed[] = [
  { id: 'rabanete_verao', name: 'Rabanete-de-verão', seasons: 1, h: 6, out: 4, unit: 52, gold: 20, level: 0, xp: 1, event: 'pascoa', color: 0xe0405a, leaf: 0x4faf3f },
  { id: 'tomate_cereja', name: 'Tomate-cereja', seasons: 1, h: 6, out: 5, unit: 31, gold: 65, level: 0, xp: 1, event: 'pascoa', color: 0xe8322a, leaf: 0x3f8f35 },
  { id: 'cacau_pascoa', name: 'Cacau-de-páscoa', seasons: 3, h: 35, re: 13, out: 39, unit: 136, gold: 7900, level: 30, xp: 30, event: 'pascoa', color: 0x7a4321, leaf: 0x3f8f35 },
  { id: 'lirio_pascoa', name: 'Lírio-de-páscoa', seasons: 2, h: 35, re: 13, out: 62, unit: 140, gold: 9800, level: 10, xp: 42, event: 'pascoa', color: 0xf6f0ff, leaf: 0x3f8f35 },
]

export const PASCOA: EventDef = {
  id: 'pascoa',
  name: 'Páscoa',
  tagline: 'Traga materiais e eu criarei Ovos de Páscoa!',
  calendar: { rule: 'pascoa', from: -7, to: 6 }, // NOVO (E1)
  art: { icon: 'event/pascoa/hud_icon', banner: '/art/event/pascoa/mural_banner.png', dir: '/art/event/pascoa', text: { x: 22, y: 31, w: 55, h: 33, fs: 3.8 } },
  seeds: ['rabanete_verao', 'tomate_cereja', 'cacau_pascoa', 'lirio_pascoa'],
  series: ['pascoa'],
  currency: { id: 'corante', name: 'Corante', plural: 'corantes', icon: 'produto_corante', emoji: '🎨' },
  shop: [{ id: 'ovo_comum', name: 'Ovo de Páscoa comum', gold: 200, desc: 'Usado pelo Coelho Mágico para fazer ovos', icon: 'produto_ovo_comum', emoji: '🥚' }], // preço estimado
  harvestCandy: 0,
  // NOVO (E3): "Plante alguns Tomates Cereja, Tomates e Morangos e tenha a chance de receber Corantes": aqui 1 fixo por colheita.
  drops: [{ seed: 'tomate_cereja', qty: 1 }, { seed: 'tomate', qty: 1 }, { seed: 'morango', qty: 1 }],
  graceH: 2,
  bowl: null,
  critters: null,
  // NOVO (E8): oficina do Coelho Mágico. unlockAt = ovos abertos (o "Ponto de abertura de Ovos").
  workshop: {
    npc: 'coelho_magico',
    recipes: [
      { id: 'ovo_nv1', needs: [['ovo_comum', 1], ['corante', 1]], minutes: 2, unlockAt: 0, open: { gold: 30, xp: 5 } },
      { id: 'ovo_nv2', needs: [['ovo_nv1', 1], ['corante', 8]], minutes: 4, unlockAt: 3, open: { gold: 80, xp: 15 } },
      { id: 'ovo_nv3', needs: [['ovo_nv2', 1], ['corante', 10]], minutes: 6, unlockAt: 9, open: { gold: 150, xp: 30 } },
    ],
    // Decoração ganha abrindo ovos, sem sorte: a peça sai no N-ésimo ovo daquele nível.
    pieces: [['ovo_nv1', 3, 'casinha:pascoa'], ['ovo_nv2', 2, 'cerca:pascoa'], ['ovo_nv2', 4, 'enfeite:pascoa'], ['ovo_nv3', 1, 'casa:pascoa'], ['ovo_nv3', 2, 'fundo:pascoa']],
    setPrize: { gold: 350, xp: 250, items: [['bicho:coelho_pascoa', 1]] }, // conjunto completo → Coelho da Páscoa (E14)
    diplomaAt: 90, // "Certificado - Abridor de Ovos de Páscoa" (item no depósito; os amigos não veem)
  },
  // NOVO (E4): Ovo Gigante, que destrava com 21 aberturas; 10 amigos em 7 dias.
  help: { id: 'ovo_gigante', name: 'Ovo de Páscoa gigante', friends: 10, days: 7, unlockAt: 21, prize: { gold: 500, xp: 150, items: [['semente:lirio_pascoa', 2]] } },
  // Os amigos mandam corante como presente diário.
  // `free`: 1 corante por amigo por dia sem gastar o seu.
  send: [{ id: 'corante', name: 'Corante', charm: 0, free: true }],
  pets: [{ id: 'coelho_pascoa', name: 'Coelho da Páscoa', emoji: '🐰', line: 'Feliz Páscoa!' }],
  items: [
    { id: 'ovo_nv1', name: 'Ovo de Páscoa nível 1', icon: 'produto_ovo_nv1', emoji: '🥚' },
    { id: 'ovo_nv2', name: 'Ovo de Páscoa nível 2', icon: 'produto_ovo_nv2', emoji: '🥚' },
    { id: 'ovo_nv3', name: 'Ovo de Páscoa nível 3', icon: 'produto_ovo_nv3', emoji: '🥚' },
    { id: 'diploma_pascoa', name: 'Certificado - Abridor de Ovos de Páscoa', icon: 'diploma_pascoa', emoji: '📜' },
  ],
  trades: [
    { id: 'ovo_comum', give: 3, item: 'ovo_comum', qty: 1, kind: 'item' },
    { id: 'semente', give: 4, item: 'semente:cacau_pascoa', qty: 1, kind: 'item' },
  ],
  // Molde B (missão em cadeia).
  missions: [
    { kind: 'harvest', target: 3, title: 'Dia 1 de Páscoa', text: 'Colha 3 rabanetes-de-verão e conheça o Coelho Mágico', of: 'rabanete_verao', reward: { gold: 100, xp: 40 } },
    { kind: 'harvest', target: 3, title: 'Dia 2 de Páscoa', text: 'Colha 3 tomates-cereja', of: 'tomate_cereja', reward: { candy: 1, items: [['ovo_comum', 1]] } },
    { kind: 'craft', target: 3, title: 'Dia 3 de Páscoa', text: 'Faça 3 ovos de Páscoa de nível 1', of: 'ovo_nv1', reward: { gold: 150, xp: 75 } }, // NOVO kind
    { kind: 'craft', target: 3, title: 'Dia 4 de Páscoa', text: 'Faça 3 ovos de Páscoa de nível 2', of: 'ovo_nv2', reward: { xp: 90, candy: 3 } },
    { kind: 'craft', target: 2, title: 'Dia 5 de Páscoa', text: 'Faça 2 ovos de Páscoa de nível 3', of: 'ovo_nv3', reward: { xp: 100, candy: 5 } },
    { kind: 'open', target: 5, title: 'Decoração de Páscoa', text: 'Ganhe o conjunto completo da decoração de Páscoa', of: 'peca', reward: { gold: 350, xp: 125 } },
  ],
}

// ---------- Dia das Mães ----------
// Árvore Coração de Mãe, Orquídea-branca, missões dos cravos → buquê → Gata Mãe, baú diário dos amigos,
// "Presentes de Amor", Canil e Casa do Dia das Mães por missão.
export const MAES_SEEDS: OrigSeed[] = [
  { id: 'coracao_mae', name: 'Árvore Coração de Mãe', seasons: 1, h: 12, out: 30, unit: 260, gold: 3000, level: 0, xp: 150, event: 'maes', color: 0xff6f91, leaf: 0x3f8f35 }, // preço estimado
  { id: 'orquidea_branca', name: 'Orquídea-branca', seasons: 2, h: 31, re: 12, out: 39, unit: 252, gold: 12000, level: 10, xp: 30, event: 'maes', color: 0xfaf6ff, leaf: 0x3f8f35 },
  { id: 'cravo', name: 'Cravo', seasons: 1, h: 10, out: 20, unit: 150, gold: 1500, level: 0, xp: 20, event: 'maes', color: 0xe0335a, leaf: 0x4f9f3f }, // números estimados
]

export const MAES: EventDef = {
  id: 'maes',
  name: 'Dia das Mães',
  tagline: 'Um belo tema para celebrar as mães',
  calendar: { rule: 'domingo', month: 5, nth: 2, from: -6, to: 1 }, // NOVO (E1)
  art: { icon: 'event/maes/hud_icon', banner: '/art/event/maes/mural_banner.png', dir: '/art/event/maes', text: { x: 29, y: 28, w: 66, h: 54, fs: 4.4 } },
  seeds: ['coracao_mae', 'orquidea_branca', 'cravo'],
  series: ['maes'],
  currency: { id: 'petala', name: 'Pétala perfumada', plural: 'pétalas perfumadas', icon: 'produto_petala', emoji: '🌸' },
  shop: [],
  harvestCandy: 2,
  graceH: 2,
  bowl: null,
  critters: null,
  help: { id: 'coracao_agradecido', name: 'Coração agradecido', friends: 5, days: 1, daily: true, prize: { gold: 100, xp: 40, items: [['semente:cravo', 2]] } }, // baú diário
  send: [{ id: 'presente_amor', name: 'Presente de Amor', charm: 15 }],
  pets: [{ id: 'gata_mae', name: 'Gata Mãe', emoji: '🐈', line: 'Miau, mamãe chegou!' }],
  items: [
    { id: 'presente_amor', name: 'Presente de Amor', icon: 'presente_amor', emoji: '💝' },
    { id: 'presente:buque_cravos', name: 'Buquê de cravos', icon: 'presente_buque_cravos', emoji: '💐' },
  ],
  trades: [
    { id: 'presente', give: 3, item: 'presente_amor', qty: 1, kind: 'item' },
    { id: 'buque', give: 10, item: 'presente:buque_cravos', qty: 1, kind: 'item' }, // buquê de 20 cravos
    { id: 'casinha', give: 12, item: 'casinha:maes', qty: 1, kind: 'decor' },
    { id: 'casa', give: 20, item: 'casa:maes', qty: 1, kind: 'decor' },
  ],
  missions: [
    { kind: 'plant', target: 5, title: 'Dia das Mães -1', text: 'Plante 5 cravos', of: 'cravo', reward: { gold: 100, xp: 40 } },
    { kind: 'harvest', target: 3, title: 'Cravos para a mamãe', text: 'Colha 3 cravos', of: 'cravo', reward: { gold: 150, xp: 40 } },
    { kind: 'plant', target: 2, title: 'Votos de felicidade', text: 'Plante 2 orquídeas-brancas', of: 'orquidea_branca', reward: { gold: 150, xp: 40 } },
    { kind: 'send', target: 5, title: 'Presentes de Amor', text: 'Envie 5 Presentes de Amor a amigos', reward: { gold: 300, xp: 75 } },
    { kind: 'help', target: 1, title: 'Coração agradecido', text: 'Abra o baú com a ajuda dos amigos', of: 'abrir', reward: { gold: 300, xp: 50 } },
    { kind: 'trade', target: 1, title: 'Buquê de cravos', text: 'Troque pétalas por um buquê de cravos', reward: { gold: 500, xp: 100, items: [['bicho:gata_mae', 1]] } }, // Gata Mãe (E14)
  ],
}

// ---------- Dia dos Namorados ----------
// Sementes, decoração e o "correio do amor": presentes para amigos.
export const NAMORADOS_SEEDS: OrigSeed[] = [
  { id: 'arvore_coracao', name: 'Árvore-de-coração', seasons: 4, h: 31, re: 12, out: 45, unit: 196, gold: 9000, level: 20, xp: 46, event: 'namorados', color: 0xff3f6f, leaf: 0x3f8f35 }, // preço estimado; rebrota a confirmar
]

export const NAMORADOS: EventDef = {
  id: 'namorados',
  name: 'Dia dos Namorados',
  tagline: 'Dizem que pessoas apaixonadas veem pássaros azuis',
  calendar: { start: '06-05', end: '06-12' },
  art: { icon: 'event/namorados/hud_icon', banner: '/art/event/namorados/mural_banner.png', dir: '/art/event/namorados', text: { x: 31, y: 28, w: 64, h: 52, fs: 3.6 } },
  seeds: ['arvore_coracao'],
  series: ['namorados'],
  currency: { id: 'coracao', name: 'Coração', plural: 'corações', icon: 'produto_coracao', emoji: '💗' },
  shop: [],
  harvestCandy: 2,
  graceH: 2,
  bowl: null,
  critters: { kinds: [{ id: 'passaro_azul', name: 'Pássaro azul', line: 'Piu! 💙' }], perDay: 3, gold: 20, xp: 2 },
  // Presentes feitos na troca e mandados a amigos (popularidade para quem recebe).
  send: [
    { id: 'flores_namorados', name: 'Flores do Dia dos Namorados', charm: 8 },
    { id: 'eu_amo_voce', name: 'Eu amo você', charm: 12 },
    { id: 'urso_namorados', name: 'Ursinho do Dia dos Namorados', charm: 20 },
  ],
  items: [
    { id: 'flores_namorados', name: 'Flores do Dia dos Namorados', icon: 'flores_namorados', emoji: '💐' },
    { id: 'eu_amo_voce', name: 'Eu amo você', icon: 'eu_amo_voce', emoji: '💌' },
    { id: 'urso_namorados', name: 'Ursinho do Dia dos Namorados', icon: 'urso_namorados', emoji: '🧸' },
  ],
  trades: [
    { id: 'flores', give: 2, item: 'flores_namorados', qty: 1, kind: 'item' },
    { id: 'bilhete', give: 3, item: 'eu_amo_voce', qty: 1, kind: 'item' },
    { id: 'urso', give: 5, item: 'urso_namorados', qty: 1, kind: 'item' },
    { id: 'enfeite', give: 12, item: 'enfeite:namorados', qty: 1, kind: 'decor' },
  ],
  missions: [
    { kind: 'plant', target: 3, title: 'Ar apaixonante', text: 'Plante 3 árvores-de-coração', reward: { gold: 100, xp: 25 } },
    { kind: 'send', target: 3, title: 'Correio do amor', text: 'Envie 3 presentes de Dia dos Namorados a amigos', reward: { gold: 150, xp: 40 } },
    { kind: 'shoo', target: 3, title: 'Pássaros azuis', text: 'Encontre 3 pássaros azuis na sua fazenda', reward: { gold: 150, xp: 40 } },
    { kind: 'trade', target: 1, title: 'Eu amo você', text: 'Troque corações por um prêmio', reward: { gold: 300, xp: 75 } },
  ],
}

// ---------- Festa Junina ----------
// Galinha caipira, pamonha, pé-de-moleque, milho-caipira e fogueira.
// A barraca de pipoca reaproveita a tigela do Dia das Bruxas (pegar 1 por amigo por dia).
export const JUNINA_SEEDS: OrigSeed[] = [
  { id: 'pamonha', name: 'Pé-de-pamonha', seasons: 4, h: 34, out: 66, unit: 76, gold: 8655, level: 25, xp: 15, event: 'junina', color: 0xf2d35a, leaf: 0x5f9f2f }, // re a confirmar
  { id: 'pe_de_moleque', name: 'Pé-de-moleque', seasons: 3, h: 40, out: 56, unit: 132, gold: 12000, level: 55, minLevel: 15, xp: 28, event: 'junina', color: 0xb07a3a, leaf: 0x4f8f35 }, // nível 55 → 15
  { id: 'milho_caipira', name: 'Milho-caipira', seasons: 2, h: 33, out: 36, unit: 293, gold: 9000, level: 20, xp: 62, event: 'junina', color: 0xffd23a, leaf: 0x4f9f3f }, // preço estimado
]

export const JUNINA: EventDef = {
  id: 'junina',
  name: 'Festa Junina',
  tagline: 'Olha o arraiá na fazenda!',
  calendar: { start: '06-13', end: '06-29' },
  art: { icon: 'event/junina/hud_icon', banner: '/art/event/junina/mural_banner.png', dir: '/art/event/junina', bowl: 'pipoqueira', text: { x: 32, y: 30, w: 62, h: 52, fs: 4.4 } },
  seeds: ['pamonha', 'pe_de_moleque', 'milho_caipira'],
  series: ['arraia'],
  currency: { id: 'pipoca', name: 'Pipoca', plural: 'pipocas', icon: 'produto_pipoca', emoji: '🍿' },
  shop: [{ id: 'saco_milho', name: 'Saco de milho de pipoca', gold: 300, desc: 'Enche de novo a sua pipoqueira (10 pipocas para os amigos)', icon: 'produto_pipoca', emoji: '🌽' }],
  harvestCandy: 2,
  graceH: 2,
  bowl: { capacity: 10, refillItem: 'saco_milho', takeXp: 3, takerDaily: 10, prize: { gold: 100, xp: 25, items: [['semente:milho_caipira', 1]] } },
  critters: null,
  pets: [{ id: 'galinha_caipira', name: 'Galinha caipira', emoji: '🐔', line: 'Có-có-ri-có!' }],
  trades: [
    { id: 'semente', give: 2, item: 'semente:milho_caipira', qty: 1, kind: 'item' },
    { id: 'fogueira', give: 10, item: 'enfeite:arraia', qty: 1, kind: 'decor' }, // a fogueira
    { id: 'galinha', give: 20, item: 'bicho:galinha_caipira', qty: 1, kind: 'item' }, // E14
  ],
  missions: [
    { kind: 'take', target: 3, title: 'Arraiá dos amigos', text: 'Pegue pipoca na pipoqueira de 3 amigos', reward: { gold: 100, xp: 25 } },
    { kind: 'plant', target: 4, title: 'Milho pro arraiá', text: 'Plante 4 milhos-caipiras', of: 'milho_caipira', reward: { gold: 100, xp: 40 } },
    { kind: 'harvest', target: 4, title: 'Comidas típicas', text: 'Colha 4 pés-de-pamonha ou pés-de-moleque', reward: { gold: 150, xp: 40, candy: 3 } },
    { kind: 'fill', target: 1, title: 'Pipoca quentinha', text: 'Encha a sua pipoqueira de novo', reward: { gold: 300, xp: 50 } },
    { kind: 'trade', target: 1, title: 'Quermesse', text: 'Troque pipocas por um prêmio', reward: { gold: 500, xp: 100 } },
  ],
}

// ---------- Dia dos Pais ----------
// Semente e série por ouro, mais uma missão de presente a um amigo.
export const PAIS_SEEDS: OrigSeed[] = [
  { id: 'semente_papai', name: 'Árvore-do-papai', seasons: 1, h: 35, out: 1, unit: 17000, gold: 12000, level: 0, xp: 100, event: 'pais', color: 0x3f6fbf, leaf: 0x3f8f35 }, // 1 unidade de 17 mil; preço e XP estimados
]

export const PAIS: EventDef = {
  id: 'pais',
  name: 'Dia dos Pais',
  tagline: 'Uma homenagem aos pais da fazenda',
  calendar: { rule: 'domingo', month: 8, nth: 2, from: -6, to: 1 }, // NOVO (E1)
  art: { icon: 'event/pais/hud_icon', banner: '/art/event/pais/mural_banner.png', dir: '/art/event/pais', text: { x: 32, y: 30, w: 62, h: 50, fs: 4.4 } },
  seeds: ['semente_papai'],
  series: ['pais'],
  currency: null, // NOVO (E11)
  shop: [], harvestCandy: 0, graceH: 2, bowl: null, critters: null, trades: [],
  // Sem moeda: o cartão é de graça, 1 por amigo por dia.
  send: [{ id: 'cartao_pais', name: 'Cartão de Dia dos Pais', charm: 10, free: true }],
  items: [{ id: 'cartao_pais', name: 'Cartão de Dia dos Pais', icon: 'cartao_pais', emoji: '💌' }],
  missions: [
    { kind: 'plant', target: 1, title: 'Semente do papai', text: 'Plante 1 árvore-do-papai', reward: { gold: 100, xp: 25 } },
    { kind: 'send', target: 3, title: 'Feliz Dia dos Pais', text: 'Envie 3 cartões a amigos', reward: { gold: 200, xp: 50, items: [['enfeite:pais', 1]] } },
  ],
}

// ---------- Folclore ----------
export const FOLCLORE_SEEDS: OrigSeed[] = [
  { id: 'guine', name: 'Guiné', seasons: 1, h: 28, out: 31, unit: 320, gold: 2000, level: 10, xp: 49, event: 'folclore', color: 0xe8f0d8, leaf: 0x3f7f2f },
  { id: 'espada_sao_jorge', name: 'Espada-de-são-jorge', seasons: 2, h: 26, re: 10, out: 39, unit: 350, gold: 10000, level: 50, minLevel: 15, xp: 68, event: 'folclore', color: 0x9fbf3f, leaf: 0x2f6f2f },
  { id: 'comigo_ninguem_pode', name: 'Comigo-ninguém-pode', seasons: 3, h: 26, re: 10, out: 42, unit: 350, gold: 15000, level: 100, minLevel: 20, xp: 72, event: 'folclore', color: 0xd8e8b0, leaf: 0x2f7f3f },
]
export const FOLCLORE: EventDef = {
  id: 'folclore', name: 'Folclore', tagline: 'As lendas visitam a fazenda',
  calendar: { start: '08-16', end: '08-22' },
  art: { icon: 'event/folclore/hud_icon', banner: '/art/event/folclore/mural_banner.png', dir: '/art/event/folclore', text: { x: 33, y: 30, w: 62, h: 52, fs: 4.4 } },
  seeds: ['guine', 'espada_sao_jorge', 'comigo_ninguem_pode'], series: [],
  currency: { id: 'pena_uirapuru', name: 'Pena de uirapuru', plural: 'penas de uirapuru', icon: 'produto_pena_uirapuru', emoji: '🪶' },
  shop: [], harvestCandy: 1, graceH: 2, bowl: null,
  // Bichos do folclore (Boitatá, Boto, Boi-bumbá, Lobisomem, Sapo-cururu, Uirapuru) como visitantes.
  critters: {
    kinds: [
      { id: 'sapo_cururu', name: 'Sapo-cururu', line: 'Croac! 🐸' },
      { id: 'uirapuru', name: 'Uirapuru', line: '♪ ♫' },
      { id: 'boitata', name: 'Boitatá', line: 'Protejo a floresta!' },
    ],
    perDay: 3, gold: 20, xp: 2,
  },
  trades: [{ id: 'semente', give: 2, item: 'semente:guine', qty: 1, kind: 'item' }, { id: 'adubo', give: 3, item: 'adubo_forte', qty: 1, kind: 'item' }],
  missions: [
    { kind: 'shoo', target: 3, title: 'Lendas na fazenda', text: 'Encontre 3 visitantes do folclore', reward: { gold: 100, xp: 25 } },
    { kind: 'plant', target: 3, title: 'Plantas de proteção', text: 'Plante 3 guinés ou espadas-de-são-jorge', reward: { gold: 150, xp: 40 } },
    { kind: 'trade', target: 1, title: 'Dia do Folclore', text: 'Troque penas de uirapuru por um prêmio', reward: { gold: 300, xp: 75 } },
  ],
}

// ---------- Independência ----------
// Decoração "desfile de 7 de setembro" por ouro, na janela do evento (E11).
export const INDEPENDENCIA: EventDef = {
  id: 'independencia', name: 'Independência', tagline: 'Desfile de 7 de Setembro na fazenda',
  calendar: { start: '09-01', end: '09-07' },
  art: { icon: 'event/independencia/hud_icon', banner: '/art/event/independencia/mural_banner.png', dir: '/art/event/independencia', text: { x: 30, y: 28, w: 65, h: 54, fs: 4.2 } },
  seeds: [], series: ['desfile'], currency: null,
  shop: [], harvestCandy: 0, graceH: 2, bowl: null, critters: null, trades: [],
  missions: [{ kind: 'visit', target: 3, title: 'Desfile de 7 de Setembro', text: 'Visite 3 amigos', reward: { gold: 150, xp: 40 } }],
}

// ---------- Dia das Crianças ----------
export const CRIANCAS_SEEDS: OrigSeed[] = [
  { id: 'jujuba', name: 'Árvore-de-jujuba', seasons: 3, h: 33, re: 14, out: 45, unit: 112, gold: 6000, level: 10, xp: 38, event: 'criancas', color: 0xff6fcf, leaf: 0x4fbf4f }, // preço estimado
  { id: 'pirulito', name: 'Árvore-de-pirulito', seasons: 1, h: 40, out: 70, unit: 280, gold: 7000, level: 10, xp: 140, event: 'criancas', color: 0xff4f6f, leaf: 0x4fbf4f }, // preço estimado
]
export const CRIANCAS: EventDef = {
  id: 'criancas', name: 'Dia das Crianças', tagline: 'Bolos, doces e brincadeira na fazenda!',
  calendar: { start: '10-04', end: '10-12' },
  art: { icon: 'event/criancas/hud_icon', banner: '/art/event/criancas/mural_banner.png', dir: '/art/event/criancas', text: { x: 20, y: 31, w: 60, h: 29, fs: 3.8 } },
  seeds: ['jujuba', 'pirulito'], series: ['criancas'],
  currency: { id: 'biscoito', name: 'Biscoito', plural: 'biscoitos', icon: 'produto_biscoito', emoji: '🍪' }, // produto do Urso que faz Biscoito
  shop: [], harvestCandy: 2, graceH: 2, bowl: null,
  critters: { kinds: [{ id: 'urso_biscoito', name: 'Urso que faz biscoito', line: 'Quer um biscoito? 🍪' }], perDay: 3, gold: 20, xp: 2 },
  send: [{ id: 'bolo_facil', name: 'Bolo fácil', charm: 10 }],
  items: [{ id: 'bolo_facil', name: 'Bolo fácil', icon: 'bolo_facil', emoji: '🎂' }], // feito na troca
  trades: [
    { id: 'bolo', give: 4, item: 'bolo_facil', qty: 1, kind: 'item' },
    { id: 'semente', give: 2, item: 'semente:jujuba', qty: 1, kind: 'item' },
    { id: 'enfeite', give: 12, item: 'enfeite:criancas', qty: 1, kind: 'decor' },
  ],
  missions: [
    { kind: 'plant', target: 3, title: 'Pomar de doces', text: 'Plante 3 árvores-de-jujuba ou de pirulito', reward: { gold: 100, xp: 25 } },
    { kind: 'shoo', target: 3, title: 'Hora do lanche', text: 'Ganhe biscoito do urso 3 vezes', reward: { gold: 150, xp: 40 } },
    { kind: 'send', target: 2, title: 'Bolo para os amigos', text: 'Envie 2 bolos fáceis a amigos', reward: { gold: 150, xp: 40 } },
    { kind: 'trade', target: 1, title: 'Festa das crianças', text: 'Troque biscoitos por um prêmio', reward: { gold: 300, xp: 75 } },
  ],
}

// Ordem = prioridade de `activeEvent` (as janelas não se sobrepõem: teste E2).
export const EVENT_DEFS: EventDef[] = [HALLOWEEN, NATAL, PASCOA, ANO_NOVO, MAES, JUNINA, CARNAVAL, PAIS, FOLCLORE, INDEPENDENCIA, CRIANCAS, NAMORADOS]
export const EVENT_SEED_DEFS: OrigSeed[] = [
  ...HALLOWEEN_SEEDS, ...NATAL_SEEDS, ...PASCOA_SEEDS, ...ANO_NOVO_SEEDS, ...MAES_SEEDS, ...JUNINA_SEEDS, ...CARNAVAL_SEEDS,
  ...PAIS_SEEDS, ...FOLCLORE_SEEDS, ...CRIANCAS_SEEDS, ...NAMORADOS_SEEDS,
]
