'use client'
import { VISIT_LINES } from '@/game/lines'

// Tela de carregamento ao visitar um amigo: frase própria (lines.ts) e três brotinhos nascendo em CSS.
// A frase vem do apelido (sem sorteio), então servidor e navegador desenham a mesma.
export function VisitLoading({ owner }: { owner: string }) {
  let h = 0
  for (const ch of owner) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const line = VISIT_LINES[h % VISIT_LINES.length](owner)
  return (
    <div className="visit-loading" role="status" aria-live="polite">
      <div className="vl-field" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="vl-sprout" style={{ animationDelay: `${i * 0.35}s` }}>
            <i className="vl-leaf l" /><i className="vl-leaf r" />
          </span>
        ))}
      </div>
      <p>{line}</p>
    </div>
  )
}
