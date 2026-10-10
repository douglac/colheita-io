'use client'
import { useState } from 'react'
import { AVATARS, avatarSrc, type AvatarId } from '@/game/avatar'

/** Rosto do fazendeiro (lote Q, A9); sem o arquivo, volta a inicial do apelido. */
export function Avatar({ id, handle, className }: { id: AvatarId; handle: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <>{handle[0]?.toUpperCase()}</>
  return <img className={`av-img ${className ?? ''}`} src={avatarSrc(id)} alt="" draggable={false} onError={() => setFailed(true)} />
}

/** Grade de escolha dos 8 rostos (primeiro acesso e Minha conta). */
export function AvatarPicker({ value, onPick, disabled }: { value: AvatarId | null; onPick: (id: AvatarId) => void; disabled?: boolean }) {
  return (
    <div className="avatar-picker" role="radiogroup" aria-label="Escolha seu rosto de fazendeiro">
      {AVATARS.map((id) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} aria-label={`Rosto ${Number(id)}`}
          className={`avatar-opt ${value === id ? 'on' : ''}`} disabled={disabled} onClick={() => onPick(id)}>
          <img src={avatarSrc(id)} alt="" width={56} height={56} draggable={false} />
        </button>
      ))}
    </div>
  )
}
