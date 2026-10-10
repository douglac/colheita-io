// Envio de e-mail com provedor trocável por variável de ambiente (nenhuma chave no repo).
//   MAIL_PROVIDER=smtp     SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE=1 (porta 465)
//                          Em dev, sem nada configurado, cai no Mailpit do Docker (localhost:1025, caixa em :8025).
//   MAIL_PROVIDER=resend   RESEND_API_KEY
//   MAIL_PROVIDER=console  só escreve no log (útil sem Docker)
//   MAIL_PROVIDER=memory   guarda numa lista (testes)
//   MAIL_FROM              remetente, ex.: "Colheita Feliz <nao-responda@seudominio.com.br>"
import { GAME_NAME } from '@/game/config'

export type Mail = { to: string; subject: string; html: string; text: string }

const g = globalThis as unknown as { __cfOutbox?: Mail[]; __cfSmtp?: unknown }
/** Caixa de saída do provedor 'memory' (testes leem daqui). */
export const outbox: Mail[] = (g.__cfOutbox ??= [])

export function mailProvider(): 'smtp' | 'resend' | 'console' | 'memory' {
  const p = process.env.MAIL_PROVIDER
  if (p === 'smtp' || p === 'resend' || p === 'console' || p === 'memory') return p
  if (process.env.VITEST) return 'memory'
  return 'smtp'
}

const from = () => process.env.MAIL_FROM ?? `${GAME_NAME} <nao-responda@colheitafeliz.local>`

async function smtpTransport() {
  if (g.__cfSmtp) return g.__cfSmtp as import('nodemailer').Transporter
  if (process.env.NODE_ENV === 'production' && !process.env.SMTP_HOST) throw new Error('SMTP_HOST não configurado')
  const nodemailer = (await import('nodemailer')).default
  const port = Number(process.env.SMTP_PORT ?? 1025)
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'localhost',
    port,
    secure: process.env.SMTP_SECURE === '1' || port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' } : undefined,
  })
  g.__cfSmtp = t
  return t
}

export async function sendMail(m: Mail): Promise<void> {
  const provider = mailProvider()
  if (provider === 'memory') { outbox.push(m); return }
  if (provider === 'console') { console.log(`[mail] para ${m.to}: ${m.subject}\n${m.text}`); return }
  if (provider === 'resend') {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('RESEND_API_KEY não configurada')
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: from(), to: [m.to], subject: m.subject, html: m.html, text: m.text }),
    })
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`)
    return
  }
  await (await smtpTransport()).sendMail({ from: from(), to: m.to, subject: m.subject, html: m.html, text: m.text })
}
