// Link de level-up (/c/<código>?n=<nível>): quem abre ganha XP (game.claimShareXp). Quem ainda não tem conta
// leva o link num cookie até o cadastro; quem já joga ganha ao tocar em "Entrar na fazenda".
import type { NextResponse } from 'next/server'
import { claimShareXp, type ShareClaim } from './game'
import { cookieOptions } from './session'

export const SHARE_COOKIE = 'cf_share'

/** Nível do link (?n=), ou null se não for um nível válido. */
export function shareLevel(n: unknown): number | null {
  const v = Number(Array.isArray(n) ? n[0] : n)
  return Number.isInteger(v) && v >= 2 && v <= 9999 ? v : null
}

export const shareCookie = (code: string, level: number) => `${code.toLowerCase()}.${level}`

export function parseShareCookie(v: string | undefined): { code: string; level: number } | null {
  const m = v?.match(/^([a-z0-9]{4,12})\.(\d{1,4})$/)
  const level = m ? shareLevel(m[2]) : null
  return m && level ? { code: m[1], level } : null
}

export function rememberShare(res: NextResponse, code: string, level: number) {
  res.cookies.set(SHARE_COOKIE, shareCookie(code, level), cookieOptions(60 * 60 * 24 * 7))
}

/** Depois de entrar (cadastro ou login): usa o link guardado no cookie, se houver, e apaga o cookie. */
export async function claimSharedCookie(res: NextResponse, userId: string, value: string | undefined, inviteCode: string | undefined): Promise<ShareClaim | null> {
  const s = parseShareCookie(value)
  if (value) res.cookies.delete(SHARE_COOKIE)
  // Cookies antigos também podem ter sido gravados antes de trocar de convite.
  if (!s || s.code !== inviteCode?.toLowerCase()) return null
  try { return await claimShareXp(userId, s.code, s.level) } catch { return null } // XP de brinde nunca derruba o login
}
