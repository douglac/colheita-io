# Como contribuir

Obrigado pelo interesse! Issues e pull requests são bem-vindos, em **português** ou em **inglês**.

O que mais ajuda agora:

- 🐛 **bugs** (com passo a passo, aparelho e navegador);
- 📱 **desempenho no celular** (FPS, memória, tempo de carregar);
- ♿ **acessibilidade** (leitor de tela, contraste, teclado, botões do tamanho do dedo);
- 🌎 **traduções** (o jogo hoje é só em português do Brasil);
- 🧪 **testes** que faltam.

## As regras, em resumo

1. **Licença e CLA.** O projeto é **código aberto para uso não comercial (source-available)**: código sob PolyForm
   Noncommercial 1.0.0 (`LICENSE`), arte e mídia sob CC BY-NC-SA 4.0 (`LICENSE-ART.md`). Ao abrir um PR, você aceita
   o [acordo de contribuição (CLA)](#acordo-de-contribuição-cla) abaixo. Em linguagem simples: o trabalho continua
   seu, mas você dá ao titular do projeto permissão ampla para usá-lo, **inclusive para fins comerciais**, e declara
   que ele é original. Sem isso não dá para aceitar a contribuição.
2. **Só arte original.** Nada de sprites, sons, músicas, textos, logos ou identidade visual tirados de outros jogos,
   **inclusive do jogo de 2010**, nem arte "traçada" ou "inspirada pixel a pixel" a partir deles. Também não use
   marcas ou logos de terceiros. Arte gerada por IA vale, desde que você conte no PR a origem e a licença dos arquivos.
3. **Código com teste.** TypeScript estrito. Regra nova de jogo vem com teste. `npm run lint`, `npm run typecheck`,
   `npm test` e `npm run build` precisam passar.
4. **PR pequeno, com prova.** Um assunto por PR, com print ou vídeo curto quando mexer em tela.
5. **Respeito.** Este projeto segue o [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
6. **Falha de segurança não vai para issue pública.** Veja o [SECURITY.md](SECURITY.md).

## Fluxo

1. **Mudança grande?** Abra uma issue antes, contando a ideia, para combinarmos o caminho antes de você gastar tempo.
   Correção pequena pode ir direto para o PR.
2. Faça um fork e crie uma branch com nome curto (`corrige-zoom-celular`, `traducao-en`).
3. Rode o projeto (veja "Rodar localmente" no `README.md`) e faça a mudança.
4. Antes de abrir o PR:

   ```bash
   npm run lint
   npm run typecheck
   npm test
   npm run build
   ```

5. Abra o PR descrevendo **o que muda para quem joga**, com prints ou vídeo. Escreva no texto do PR:
   **"Li e concordo com o CLA do CONTRIBUTING.md."**
6. Alguém revisa. Pode ser que a gente peça ajustes; faz parte.

## Código

- **TypeScript estrito**, sem `any` solto. Siga o jeito do arquivo que você está mexendo (não há formatador
  automático).
- **Regras do jogo** ficam em `src/game/`, como funções puras, sem I/O: dá para testar sem banco. Mudou regra
  (preço, tempo, chance, limite)? Escreva ou ajuste um teste em `tests/`.
- **O servidor manda.** Toda ação do jogador é validada em `src/server/`; a tela só mostra. Nunca confie no cliente.
- **Fluxos de tela** (entrar, plantar, visitar, comprar) têm e2e em `e2e/` (Playwright, computador e celular). Mudou
  um fluxo? Ajuste ou crie o teste.
- **QA de tela:** confira no celular (360×640 e 390×844) e no computador (1280×800). Para prints e vídeos
  automáticos, use navegador **sem janela** (Playwright com `headless: true`) e com o som do jogo desligado.
- Textos do jogo em português do Brasil, curtos e diretos. Comentários explicam o porquê, não o quê.
- PR feito com ajuda de IA é bem-vindo. Vale a mesma regra para todo mundo: você revisou, testou e responde pelo que enviou.

## Arte

- PNG RGBA, luz de cima à esquerda, no estilo do resto do jogo.
- Otimize antes do commit: `python3 scripts/art/optimize_png.py --dir public/art/<pasta>`.
- Registre cada arquivo novo em `public/art/MANIFEST.md`: o que é, as âncoras (onde fica o "pé" do sprite) e as dimensões
  e a licença aplicável.
- Se a arte incluir material de terceiros com licença compatível, diga a origem e a licença no PR.

## Segredos

Nunca faça commit de `.env`, chaves ou tokens. Use `.env.local` (ignorado pelo git) e documente variáveis novas em
`.env.example`, sem valor.

## Acordo de contribuição (CLA)

Ao abrir um pull request, enviar um patch ou qualquer outro material para este repositório (a **contribuição**), você
concorda com os termos abaixo. Escreva no PR: **"Li e concordo com o CLA do CONTRIBUTING.md."**

1. **Licença ao titular.** Você concede ao titular do projeto (a pessoa indicada na linha `Required Notice` do
   `LICENSE` e quem vier a suceder seus direitos, inclusive uma empresa controlada por ele) uma licença mundial,
   perpétua, irrevogável, não exclusiva, gratuita e transferível para usar, copiar, modificar, distribuir, exibir,
   sublicenciar e relicenciar a contribuição, sob quaisquer termos, **inclusive para fins comerciais**.
2. **Patentes.** Se a contribuição for coberta por patente sua, você concede ao titular, a quem receber o software e
   a quem o usar uma licença de patente com o mesmo alcance do item 1, só para a contribuição e para o projeto com ela.
3. **Originalidade.** Você declara que a contribuição é obra original sua, ou que tem o direito de enviá-la nestes
   termos. Se ela incluir material de terceiros, você indica no PR a origem e a licença. Se fizer a contribuição como
   parte do trabalho para alguém (empregador, cliente), você declara que tem autorização dessa pessoa ou empresa.
4. **Seus direitos continuam seus.** Você mantém a autoria e os direitos sobre a contribuição. Esta licença não é
   cessão de direitos e não impede que você use o próprio trabalho como quiser.
5. **Sem obrigação.** O titular não é obrigado a aceitar nem a usar a contribuição. Ela é dada "no estado em que se
   encontra", sem garantia.
6. **Publicação.** A contribuição aceita é distribuída a todos sob as licenças do projeto (`LICENSE` e
   `LICENSE-ART.md`).

## Conduta

Este projeto segue o [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Para falhas de segurança, siga o
[SECURITY.md](SECURITY.md) (contato@colheita.io), sem abrir issue pública.
