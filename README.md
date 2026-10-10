<p align="center">
  <img src="public/art/ui/logo_1x.png" alt="Colheita Feliz" width="360">
</p>

<h3 align="center">Plante, colha e (com jeitinho) pegue a colheita dos amigos. 🌽🐄🐶</h3>

<p align="center">
  <a href="https://colheita.io"><b>▶ JOGAR AGORA: colheita.io</b></a><br>
  <sub>De graça, no navegador do celular ou do computador. Sem instalar nada.</sub>
</p>

<p align="center">
  <a href="LICENSE"><img alt="Licença: PolyForm Noncommercial 1.0.0" src="https://img.shields.io/badge/c%C3%B3digo-PolyForm%20Noncommercial-orange"></a>
  <a href="LICENSE-ART.md"><img alt="Arte: CC BY-NC-SA 4.0" src="https://img.shields.io/badge/arte-CC%20BY--NC--SA%204.0-lightgrey"></a>
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs">
  <img alt="PixiJS 8" src="https://img.shields.io/badge/PixiJS-8-e72264">
  <img alt="TypeScript estrito" src="https://img.shields.io/badge/TypeScript-estrito-3178c6?logo=typescript&logoColor=white">
  <img alt="Testes: Vitest e Playwright" src="https://img.shields.io/badge/testes-Vitest%20%2B%20Playwright-6e9f18">
</p>

> **Código aberto para uso não comercial (source-available).** Pode jogar, ler, estudar, modificar e compartilhar à
> vontade, desde que **sem fins comerciais**. Uso comercial só com autorização. Detalhes em [Licença](#licença).

<p align="center">
  <img src="media/colheita-feliz-gameplay.gif" alt="Jogando: a mão marota pegando a colheita da vizinha, com o cachorro de guarda andando" width="720">
  <br>
  <a href="media/colheita-feliz-trailer.mp4">🎬 Ver o vídeo de 30 segundos (MP4)</a>
  <br>
  <a href="https://youtube.com/shorts/TfuNS-3d-nA">🎙️ Ver a prévia narrada (YouTube)</a>
</p>

Lembra da fazendinha que todo mundo jogava com os amigos, de olho no relógio para colher antes que alguém passasse
lá e levasse tudo? Ela voltou, feita do zero para o navegador de hoje. A roça é sua, os vizinhos são seus amigos de
verdade, e o cachorro está de olho.

## Multiplayer de verdade 👩‍🌾🤝👨‍🌾

O jogo é para jogar **com os amigos**:

- **Visite a fazenda deles.** Cada amigo vira vizinho na faixa de baixo, com um ✋ quando a horta dele está madura.
- **Ajude:** regue a terra seca, tire praga e erva daninha e dê o Fertilizante do Amor. Cada ajuda rende XP e ouro.
- **Pegue um pouquinho da colheita** com a mão marota. Sempre fica uma parte para o dono.
- **Cuidado com o cachorro.** De barriga cheia ele patrulha a horta e morde quem exagera, e o ladrão paga multa em
  ouro. Tem guarda de várias raças, e cada uma tem as suas chances.
- **Avisos em tempo real:** "fulano pegou 3 morangos da sua horta", "sua horta amadureceu". Com o jogo aberto, eles
  aparecem na hora; no celular, também chegam por notificação, se você deixar.
- **Convite por link:** mande pelo WhatsApp. Quem entra pelo seu link já chega como seu amigo, e os dois ganham ouro.
- **Ranking dos vizinhos** por experiência, dinheiro e popularidade, mais o ranking público das fazendas em destaque
  (só com as iniciais).
- **Presentes, flores e mural:** dê sementes e flores (flor dá popularidade a quem recebe) e deixe recado no mural da
  fazenda.

## Prints

| | |
|:---:|:---:|
| <img src="media/screenshots/fazenda.png" alt="Fazenda cheia no computador" width="420"><br>**A sua fazenda** | <img src="media/screenshots/visita.png" alt="Visita à vizinha com a mão de pegar e o cachorro de guarda" width="420"><br>**Visita com a mão marota** (e o cachorro de olho) |
| <img src="media/screenshots/celular.png" alt="O jogo no celular" width="420"><br>**Feito para o celular** | <img src="media/screenshots/amigos.png" alt="Ranking dos vizinhos" width="420"><br>**Ranking dos vizinhos** |
| <img src="media/screenshots/loja.png" alt="Loja com bichos, guardas e acessórios" width="420"><br>**Loja** | <img src="media/screenshots/evento.png" alt="Evento do Dia das Bruxas" width="420"><br>**Eventos da época** |

<p align="center">
  <img src="media/screenshots/lp.png" alt="Página inicial com o ranking público das fazendas" width="640"><br>
  <sub>A página inicial, com as fazendas em destaque.</sub>
</p>

<sub>Todos os prints e o vídeo foram feitos num servidor local com personagens de exemplo. Nenhum jogador real
aparece.</sub>

## O que tem no jogo

- 🌱 **Mais de 50 culturas e flores**, cada uma com tempo, safras, preço e XP próprios. Terra seca, praga e erva
  daninha aparecem com o tempo; adubo acelera.
- 🐄 **Bichos que andam pela fazenda:** vaca, ovelha, porco, galinha, pato, coelho, cabra, burro, pavão e abelhas.
  Eles crescem, dão produto e usam **acessórios** (sino, chapéu, coroa de flores…).
- 🏡 **Decoração:** casa, cerca, caminho e enfeites em séries completas, com modo de arrumar a fazenda.
- 🎃 **Eventos da época:** Dia das Bruxas, Natal, Páscoa, Festa Junina, Carnaval e outros, com sementes, missões,
  troca de itens e visitantes especiais.
- 📋 **Missões do dia**, níveis, terrenos novos para expandir a roça e um assistente que avisa o que está pronto.
- 📱 **Celular primeiro:** PWA (dá para pôr na tela inicial), pinça para zoom, arrastar para andar, menus em painel
  de baixo e botões do tamanho do dedo.
- 🔊 Música e efeitos sonoros gerados em código. A música começa desligada.

## Rodar localmente

Você precisa do **Node 24** (o mesmo do `Dockerfile`) e do npm. Docker é opcional.

```bash
git clone https://github.com/douglac/colheita-io.git colheita-feliz && cd colheita-feliz
npm ci
npm run dev        # http://localhost:3100
```

- O banco é o **PGlite** (Postgres embutido, gravado em `.data/`). Não precisa de Docker nem de configuração.
- Para entrar, abra **"Login de teste (só apelido)"** na página inicial e escolha um apelido. O login de teste só
  existe em desenvolvimento.
- Para as plantas crescerem mais rápido, use `GROWTH_SPEED=10 npm run dev` (10× mais rápido).
- Variáveis de ambiente: veja o [`.env.example`](.env.example) (copie para `.env.local`). Sem nenhuma, o jogo roda
  local com o login de teste, sem e-mail e sem cobrança com dinheiro real.
- Quer vizinhos para visitar? `npm run seed` cria uma fazenda cheia (`dev_max`) e seis vizinhos com a horta madura.
  Rode com o servidor parado (o PGlite só aceita um processo por vez).

### Testes

| Comando | O quê |
|---|---|
| `npm test` | testes unitários e de integração (Vitest, banco PGlite) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript estrito |
| `npm run build` | build de produção |
| `npm run e2e` | Playwright (computador e celular) contra o app em modo produção no Docker (veja abaixo) |
| `npm run ci` | tudo acima, com Docker |

### Postgres e e2e (opcional, com Docker)

```bash
npm run db:up      # Postgres 16 em localhost:5433 e Mailpit (e-mails) em http://localhost:8025
DATABASE_URL=postgres://colheita:colheita@localhost:5433/colheita npm run dev
npm run test:pg    # os mesmos testes no Postgres

docker compose --profile prod-local up -d --build --wait   # o app em modo produção em http://localhost:3200
npm run e2e
```

### Onde fica cada coisa

| Pasta | O quê |
|---|---|
| `src/game/` | regras puras do jogo (culturas, bichos, economia, eventos), sem I/O |
| `src/server/` | banco, sessões, e-mail, push, tempo real (SSE) |
| `src/app/` | páginas e rotas de API (Next.js App Router) |
| `src/scene/` | a fazenda isométrica em PixiJS |
| `src/components/` | interface React |
| `public/art/` | arte original do projeto (inventário técnico em `public/art/MANIFEST.md`) |
| `tests/`, `e2e/` | testes unitários, de integração e de ponta a ponta |

O servidor é a fonte da verdade: toda ação (plantar, colher, pegar do amigo) é validada lá, com limites de ritmo.
Esta é a base comunitária jogável: inventário, moedas ganhas no jogo, amigos e compras por essas moedas funcionam.
Compras com dinheiro real estão indisponíveis em todos os ambientes; não há provedores, recibos ou painel comercial.
As rotas de pagamento e administração respondem 404. O adaptador de eventos analíticos não coleta dados.
Logs técnicos, autenticação, limites de requisição e validações do servidor permanecem ativos.
Use um banco novo para esta edição; não conecte um banco de outra instalação.

## Como contribuir

Toda ajuda é bem-vinda: bugs, desempenho no celular, acessibilidade, traduções e testes. Leia o
[CONTRIBUTING.md](CONTRIBUTING.md) antes do primeiro PR. Ali estão as regras de arte (só arte original), de código e
o acordo de contribuição (CLA).

- Comportamento: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- Falha de segurança: siga o [SECURITY.md](SECURITY.md). **Não abra issue pública.**

## Licença

Este projeto é **source-available**, e não "open source" no sentido da OSI, porque as licenças proíbem uso comercial.
Em linguagem simples:

- ✅ **Pode:** jogar, ler o código, estudar, rodar no seu computador, modificar e compartilhar, **sem fins
  comerciais** (uso pessoal, estudo, pesquisa, hobby, escolas e organizações sem fins lucrativos).
- ❌ **Não pode sem autorização:** vender, hospedar uma versão para ganhar dinheiro, pôr anúncios ou usar a arte em
  produto comercial. Para isso, escreva para contato@colheita.io.
- 🎨 **A arte** segue a CC BY-NC-SA 4.0: dê o crédito, não use comercialmente e compartilhe derivados na mesma
  licença.

| O quê | Licença |
|---|---|
| Código (todo o repositório, menos o que está abaixo) | [PolyForm Noncommercial 1.0.0](LICENSE) |
| Arte, ícones, sons, mídia e documentação (`public/art/`, `public/icons/`, `media/`, `docs/`) | [CC BY-NC-SA 4.0](LICENSE-ART.md) |

O resumo acima não substitui o texto das licenças. Contribuições seguem o acordo de contribuição (CLA) do
[CONTRIBUTING.md](CONTRIBUTING.md).

## Aviso

Projeto independente de fãs, sem vínculo com os criadores ou detentores do jogo de 2010. Todo o código, a arte e os
sons foram criados para este projeto.

Privacidade: [colheita.io/privacidade](https://colheita.io/privacidade) · privacidade@colheita.io

Software feito utilizando [Stateroom.ai](https://stateroom.ai).

---

### In English

**Colheita Feliz** is a free, social farming game for the mobile and desktop browser: plant, harvest, raise animals,
decorate your farm and visit your friends' farms to help out, or to sneak a bit of their harvest while the guard dog
isn't looking. It's real multiplayer: friends, live notifications, invite links, neighbor rankings, gifts and
seasonal events. **Play now at [colheita.io](https://colheita.io)** (Brazilian Portuguese).

**Run it locally:** Node 24, then `npm ci && npm run dev` and open http://localhost:3100 (embedded PGlite database, no
Docker needed; use the "Login de teste" nickname login).

**License:** source-available for **non-commercial use only**. The code is under PolyForm Noncommercial 1.0.0 and the
art under CC BY-NC-SA 4.0. Commercial use requires permission (contato@colheita.io). Contributions are welcome under
the CLA in [CONTRIBUTING.md](CONTRIBUTING.md), and English is fine in issues and PRs.

*Independent fan project, not affiliated with the creators or rights holders of the 2010 game. All code, art and
sounds were created for this project.*
