'use client'
// Lado do navegador das notificações: service worker + assinatura Web Push.

export type PushState = 'unsupported' | 'ios-install' | 'default' | 'granted' | 'denied'

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

export function pushState(): PushState {
  if (typeof window === 'undefined') return 'unsupported'
  // iPhone só recebe notificação de site instalado na tela inicial.
  if (isIOS() && !standalone()) return 'ios-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  return Notification.permission === 'granted' ? 'granted' : Notification.permission === 'denied' ? 'denied' : 'default'
}

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null
  try { return await navigator.serviceWorker.register('/sw.js') } catch { return null }
}

const b64 = (s: string) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** Pede permissão (precisa vir de um toque do jogador) e registra o aparelho no servidor. */
export async function enablePush(): Promise<PushState> {
  if (pushState() !== 'default' && pushState() !== 'granted') return pushState()
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return pushState()
  const reg = (await registerSW()) ?? (await navigator.serviceWorker.ready)
  const { key } = await fetch('/api/push').then((r) => r.json() as Promise<{ key: string }>)
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) }))
  await fetch('/api/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sub) })
  return 'granted'
}

export async function disablePush() {
  const reg = await navigator.serviceWorker?.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await fetch('/api/push', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) })
  await sub.unsubscribe()
}

/** Já assinado neste aparelho? */
export async function isSubscribed() {
  const reg = await navigator.serviceWorker?.getRegistration()
  return !!(await reg?.pushManager.getSubscription())
}
