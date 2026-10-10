import { NextResponse } from 'next/server'
import { GameError } from '@/game/rules'
import { captureError } from './observe'

export function fail(e: unknown, context: Record<string, unknown> = {}) {
  if (e instanceof GameError) return NextResponse.json({ error: e.message, code: e.code }, { status: 400 })
  captureError(e, context)
  return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
}

/** Endereço público do jogo (retorno do pagamento e webhook). Em produção vem de PUBLIC_URL. */
export const baseUrl = (req: Request) => (process.env.PUBLIC_URL ?? new URL(req.url).origin).replace(/\/$/, '')

