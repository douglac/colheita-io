'use client'
// Banner do evento sazonal (Mural e janela do evento): a frase fica na parte lisa da tábua de cada arte
// (`art.text` em event-content.ts), em no máximo 2 linhas. A fonte acompanha a largura do banner (cqw); se mesmo assim
// não couber (fonte do aparelho mais larga que a medida), encolhe até caber, sem cortar o texto.
import { useLayoutEffect, useRef, useState } from 'react'
import type { EventBannerText } from '@/game/event-types'

export const BANNER_MAX_LINES = 2

export function EventBanner({ src, text, box, onOpen }: { src: string; text: string; box: EventBannerText; onOpen?: () => void }) {
  const boxRef = useRef<HTMLSpanElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [k, setK] = useState(1)
  const sig = `${text}|${box.x},${box.y},${box.w},${box.h},${box.fs}` // o objeto `box` chega novo a cada atualização
  useLayoutEffect(() => setK(1), [sig])
  useLayoutEffect(() => {
    const b = boxRef.current, t = textRef.current
    if (!b || !t || k <= 0.6) return
    const lh = parseFloat(getComputedStyle(t).lineHeight) || 1
    const lines = Math.round(t.offsetHeight / lh)
    if (lines > BANNER_MAX_LINES || t.scrollWidth > b.clientWidth + 1 || t.offsetHeight > b.clientHeight + 1) setK((v) => v * 0.92)
  }, [k, sig])
  const style = {
    backgroundImage: `url(${src})`,
    '--tx': `${box.x}%`, '--ty': `${box.y}%`, '--tw': `${box.w}%`, '--th': `${box.h}%`, '--fs': `${box.fs * k}cqw`,
  } as React.CSSProperties
  const inner = (
    <span ref={boxRef} className="event-banner-text">
      <span ref={textRef}>{text}</span>
    </span>
  )
  const cls = `event-banner${box.light ? ' light' : ''}`
  return onOpen
    ? <button type="button" className={`${cls} as-button`} style={style} onClick={onOpen}>{inner}</button>
    : <div className={cls} style={style}>{inner}</div>
}
