'use client'
// Compartilhar: abre o menu nativo (WhatsApp, Instagram…); sem ele, copia o link e a página oferece o WhatsApp.
// O link é o convite pessoal (/c/<código>), que mostra a prévia com a fazenda de quem mandou.
import type { SharePlace } from '@/server/metrics'
import { SHARE_XP } from './config'

export function inviteLink(code: string | null | undefined) {
  return code ? `${window.location.origin}/c/${code}` : window.location.origin
}

/** Link do level-up: o convite com o nível (?n=). Quem abrir ganha SHARE_XP.xp (server/game.ts, claimShareXp). */
export function levelUpLink(code: string, level: number) {
  return `${inviteLink(code)}?n=${level}`
}

export const levelUpShareText = (level: number, game: string) =>
  `Subi para o nível ${level} no ${game}! 🎉 Abre o link e ganha ${SHARE_XP.xp} EXP na sua fazenda 🌱`

export const whatsappLink = (text: string, link: string) => `https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`

/** shared: o menu nativo enviou; cancelled: a pessoa fechou o menu; copied: sem menu nativo (ou ele falhou, como no
 *  Chrome do Mac na prévia de 09/10), o link foi copiado; failed: nem copiar deu. Nos dois últimos a página mostra
 *  "Link copiado!" com o botão do WhatsApp (abrir o WhatsApp depois do await cairia no bloqueio de pop-up). */
/** Métricas: avisa o nosso servidor que a pessoa tocou em compartilhar/convidar (só o lugar; nada vai para terceiros). */
export function noteShare(place: SharePlace) {
  try {
    void fetch('/api/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ place }), keepalive: true }).catch(() => {})
  } catch { /* métrica nunca atrapalha o compartilhar */ }
}

export type ShareResult = 'shared' | 'cancelled' | 'copied' | 'failed'

export async function share(text: string, link: string): Promise<ShareResult> {
  const data = { title: document.title, text, url: link }
  if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
    try { await navigator.share(data); return 'shared' } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled'
    }
  }
  return (await copyText(link)) ? 'copied' : 'failed'
}

async function copyText(text: string): Promise<boolean> {
  // Com a aba fora de foco o Chrome deixa o writeText pendente para sempre: 1,5 s e segue (o aviso sai mesmo assim).
  try {
    const late = new Promise<false>((r) => setTimeout(() => r(false), 1500))
    if (await Promise.race([navigator.clipboard.writeText(text).then(() => true as const), late])) return true
  } catch { /* sem permissão ou sem a API: tenta o jeito antigo */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch { return false }
}

/** Texto curto de compartilhar: o fato do momento + um convite nostálgico. */
export const nostalgic = (line: string) => `${line} Lembra da fazendinha? Voltou! Vem plantar comigo 🌱`

/** Cada gancho aparece no máximo 1 vez por dia (não vira spam). */
export function shareOnce(kind: string): boolean {
  const key = `cf:share:${kind}`, today = new Date().toISOString().slice(0, 10)
  if (localStorage.getItem(key) === today) return false
  localStorage.setItem(key, today)
  return true
}
