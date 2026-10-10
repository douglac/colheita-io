'use client'
// Mini design system das janelas: Card, StatChip, Badge, Stepper, PrimaryButton, DialogHeader, ArtSeal.
// Só visual; as classes e os tokens (espaço, tipografia, cores do jogo) ficam em globals.css ("Design system").
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

type Tone = 'plain' | 'gold' | 'green' | 'red' | 'wood'

/** Caixa creme com borda de palha; `tone` muda o fundo (dourado = destaque, verde = convite/sucesso). */
export function Card({ tone = 'plain', className, children, ...rest }: { tone?: Tone; className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${tone !== 'plain' ? tone : ''} ${className ?? ''}`} {...rest}>{children}</div>
}

/** Selo curto: "Nível 6", "Já tem", "Novo". */
export function Badge({ tone = 'green', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return <span className={`badge ${tone}`} title={title}>{children}</span>
}

/**
 * Número com ícone e rótulo (mini-cartão da ficha). O detalhe vai no `hint`: aparece no title (mouse)
 * e, por `onHint`, na legenda da ficha (toque/teclado, onde não existe title).
 */
export function StatChip({ icon, label, value, hint, tone = 'plain', onHint }: {
  icon: ReactNode; label: string; value: ReactNode; hint?: string; tone?: Tone; onHint?: (hint: string | null) => void
}) {
  const show = hint && onHint ? () => onHint(hint) : undefined
  return (
    <div className={`stat ${tone !== 'plain' ? tone : ''}`} title={hint} tabIndex={hint ? 0 : undefined}
      aria-label={hint ? `${label}: ${typeof value === 'string' || typeof value === 'number' ? value : ''}. ${hint}` : undefined}
      onMouseEnter={show} onFocus={show} onClick={show}>
      <span className="stat-ic" aria-hidden>{icon}</span>
      <span className="stat-txt">
        <small className="t-label">{label}</small>
        <b className="t-num">{value}</b>
      </span>
    </div>
  )
}

/** − [n] + com alvos de 44 px; o campo aceita digitação e é limitado a [min, max]. */
export function Stepper({ value, min = 1, max, onChange, label = 'Quantidade' }: {
  value: number; min?: number; max: number; onChange: (n: number) => void; label?: string
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n))
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="step-btn" aria-label="Menos" disabled={value <= min} onClick={() => onChange(clamp(value - 1))}>−</button>
      <input type="number" inputMode="numeric" min={min} max={max} value={value} aria-label={label}
        onChange={(e) => onChange(clamp(Number(e.target.value) || min))} />
      <button type="button" className="step-btn" aria-label="Mais" disabled={value >= max} onClick={() => onChange(clamp(value + 1))}>+</button>
    </div>
  )
}

/** Botão principal (verde, ação que avança) ou dourado (destaque); `block` ocupa a linha toda. */
export function PrimaryButton({ tone = 'green', block, className, children, ...rest }: {
  tone?: 'green' | 'gold'; block?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`btn ${tone} primary ${block ? 'block' : ''} ${className ?? ''}`} {...rest}>{children}</button>
}

/** Cabeçalho de janela/ficha: ícone, título, selo e subtítulo; o × fecha (44 px no celular). */
export function DialogHeader({ icon, title, subtitle, badge, onClose, closeLabel = 'Fechar', big, ...rest }: {
  icon?: ReactNode; title: ReactNode; subtitle?: ReactNode; badge?: ReactNode; onClose?: () => void; closeLabel?: string; big?: boolean
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <header className={`dialog-title ${big ? 'big' : ''}`} {...rest}>
      {icon && <span className="dh-icon">{icon}</span>}
      <span className="dh-text">
        <span className="dh-row"><h2 className="t-title">{title}</h2>{badge}</span>
        {subtitle && <small className="t-sub">{subtitle}</small>}
      </span>
      {onClose && <button type="button" className="close" onClick={onClose} aria-label={closeLabel}>×</button>}
    </header>
  )
}

/** Selo com arte (public/art/ui) e conteúdo por cima: o número do nível no selo vermelho, a posição no ranking.
 *  Sem o arquivo, fica o desenho por CSS da `className` (classe `art` só quando a imagem carrega). */
export function ArtSeal({ src, className = '', children, label }: { src: string; className?: string; children: ReactNode; label?: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className={`${className}${failed ? '' : ' art'}`} aria-label={label}>
      {!failed && <img src={src} alt="" aria-hidden draggable={false} onError={() => setFailed(true)} />}
      <span className="seal-txt">{children}</span>
    </span>
  )
}
