'use client'
import { useState } from 'react'
import { iconUrl } from '@/game/catalog'

/** Ícone da arte do jogo (caminho em `iconUrl`); sem arquivo, mostra o emoji. */
export function Icon({ name, emoji, size = 28, className }: { name: string; emoji: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  const src = iconUrl(name)
  if (failed) return <span className={`icon emoji ${className ?? ''}`} style={{ fontSize: size * 0.8, width: size, height: size }} aria-hidden>{emoji}</span>
  return <img className={`icon ${className ?? ''}`} src={src} alt="" width={size} height={size} draggable={false} onError={() => setFailed(true)} />
}
