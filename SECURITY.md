# Segurança

## Como relatar uma falha

**Não abra issue pública.** Use o relato privado do GitHub (aba **Security** → **Report a vulnerability**) ou escreva
para **contato@colheita.io**. Descreva o problema, como reproduzir e o impacto (por exemplo: acesso à conta de outra
pessoa, mudar ouro ou itens sem jogar, pagamento creditado sem pagar, vazamento de e-mail).

Respondemos assim que possível. Pedimos que você não divulgue a falha antes da correção.

## Escopo

- Autenticação por e-mail (códigos e link mágico), sessões e cookies.
- Regras autoritativas do servidor: economia, roubo de colheita, eventos, limites de ritmo.
- Loja com dinheiro real (webhooks de pagamento, idempotência, estornos).
- Notificações push e e-mails.

## Fora do escopo

- Ataques de negação de serviço e testes de carga contra servidores que não são seus.
- Engenharia social.
- Falhas que exigem acesso físico ao aparelho da vítima.

## Rodar com segurança

Em produção, defina `AUTH_SECRET` e deixe desligados o login de teste e o pagamento falso. Veja `.env.example`.
