// Templates de e-mail no tom do jogo. HTML com tabelas e estilo inline (Gmail, Outlook e app de celular).
// Sem imagens externas: tudo desenhado com cor e emoji, para chegar bonito mesmo com imagem bloqueada.
import { GAME_NAME } from '@/game/config'
import type { Mail } from './mail'

export type TokenPurpose = 'login' | 'link' | 'delete'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const COPY: Record<TokenPurpose, { subject: (code: string) => string; title: string; intro: string; button: string; outro: string }> = {
  login: {
    subject: (code) => `${code} é o seu código para entrar no ${GAME_NAME}`,
    title: 'Sua fazenda está te esperando! 🌱',
    intro: 'Use este código para entrar (ou toque no botão logo abaixo):',
    button: 'Entrar na fazenda',
    outro: 'Não pediu para entrar? Pode ignorar este e-mail: sem o código, ninguém entra na sua conta.',
  },
  link: {
    subject: (code) => `${code} é o código para ligar este e-mail à sua fazenda`,
    title: 'Vamos ligar este e-mail à sua fazenda 🔗',
    intro: 'Com o e-mail ligado, você entra de qualquer aparelho. Seu código:',
    button: 'Confirmar este e-mail',
    outro: 'Não foi você? Ignore este e-mail e nada muda.',
  },
  delete: {
    subject: (code) => `Confirme a exclusão da sua conta no ${GAME_NAME} (${code})`,
    title: 'Você pediu para excluir sua conta 🥲',
    intro: 'Se confirmar, a fazenda, o celeiro, os bichos e as amizades são apagados para sempre. Código de confirmação:',
    button: 'Confirmar exclusão',
    outro: 'Mudou de ideia ou não foi você? Ignore este e-mail e a fazenda continua do jeitinho que está.',
  },
}

export function tokenMail(purpose: TokenPurpose, to: string, code: string, link: string, minutes: number): Mail {
  const c = COPY[purpose]
  const danger = purpose === 'delete'
  const btnBg = danger ? '#ff5a5f' : '#ffc93c'
  const btnInk = danger ? '#ffffff' : '#3b2a1a'
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${esc(c.subject(code))}</title></head>
<body style="margin:0;padding:0;background:#c9ecff;">
<div style="display:none;max-height:0;overflow:hidden;">Seu código: ${spaced}. Vale por ${minutes} minutos.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(#7cc8ff,#c9ecff);background-color:#a6dcff;">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
    <tr><td align="center" style="font-family:'Trebuchet MS',Verdana,sans-serif;font-size:34px;font-weight:900;color:#ffffff;text-shadow:0 3px 0 #8a5a2b;padding-bottom:10px;">
      🌻 ${esc(GAME_NAME)}
    </td></tr>
    <tr><td style="background:#fff8e7;border:4px solid #8a5a2b;border-radius:22px;padding:26px 24px;font-family:'Trebuchet MS',Verdana,sans-serif;color:#3b2a1a;">
      <h1 style="margin:0 0 10px;font-size:22px;">${esc(c.title)}</h1>
      <p style="margin:0 0 16px;font-size:16px;line-height:1.45;">${esc(c.intro)}</p>
      <div style="text-align:center;margin:0 0 18px;">
        <span style="display:inline-block;background:#ffffff;border:3px dashed #44c767;border-radius:16px;padding:12px 22px;font-size:34px;font-weight:900;letter-spacing:6px;font-family:'Courier New',monospace;color:#2d7a3e;">${spaced}</span>
      </div>
      <div style="text-align:center;margin:0 0 18px;">
        <a href="${esc(link)}" style="display:inline-block;background:${btnBg};color:${btnInk};text-decoration:none;font-weight:900;font-size:18px;padding:13px 26px;border:3px solid #8a5a2b;border-radius:16px;box-shadow:0 3px 0 #8a5a2b;">${esc(c.button)}</a>
      </div>
      <p style="margin:0 0 8px;font-size:14px;line-height:1.4;">⏰ O código e o botão valem por <b>${minutes} minutos</b> e só funcionam uma vez.</p>
      <p style="margin:0;font-size:13px;line-height:1.4;color:#7a6a58;">${esc(c.outro)}</p>
    </td></tr>
    <tr><td align="center" style="padding:14px 8px 0;font-family:'Trebuchet MS',Verdana,sans-serif;font-size:12px;color:#4d6b80;">
      🥕 🌽 🍓 &nbsp;Plante, colha e, com jeitinho, pegue a colheita dos amigos.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`
  const text = `${GAME_NAME}\n\n${c.title}\n\n${c.intro}\n\n    ${spaced}\n\n${c.button}: ${link}\n\nO código e o link valem por ${minutes} minutos e só funcionam uma vez.\n${c.outro}\n`
  return { to, subject: c.subject(code), html, text }
}
