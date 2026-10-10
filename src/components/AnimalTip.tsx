'use client'
import { itemName } from '@/game/catalog'
import { fmtHM, LIVESTOCK, type AnimalView } from '@/game/livestock'

// Balão do bicho:
// "Alimento 92/100", "status do crescimento: 22H58M para Estágio 3", "Resultado depois de 5H29M",
// "produzido 23, restam 23". Os tempos são de bicho alimentado: com fome, o relógio dele para.
export function AnimalTip({ a, x, y, now, at, visiting }: {
  a: AnimalView; x: number; y: number; now: number; at: number /* serverNow em que `a` foi lido */; visiting: boolean
}) {
  // Enquanto tem comida, o tempo anda junto com o relógio.
  const fedFor = a.food > 0 ? Math.max(0, now - at) : 0
  const l = LIVESTOCK[a.kind]
  const status = a.ready
    ? a.meat ? `plantado ${a.produced}, ainda restam ${a.left}` : `produzido ${a.produced}, restam ${a.left}`
    : a.nextStageMs != null
      ? `status do crescimento: ${fmtHM(a.nextStageMs - fedFor)} para Estágio ${a.stage + 1}`
      : `Resultado depois de ${fmtHM((a.cycleLeftMs ?? 0) - fedFor)}`
  return (
    <div className="plot-tip animal-tip" style={{ left: x + 16, top: y + 16 }} role="tooltip">
      <b>{a.name}{a.stage < a.stages ? ` (Estágio ${a.stage}/${a.stages})` : ''}</b>
      <span className="tip-row">Alimento <span className={`bar ${a.food < 25 ? 'health' : ''}`}><i style={{ width: `${a.food}%` }} /></span> {a.food}/100</span>
      <span>{status}</span>
      {a.hungry && <span className="warn">Com fome: não cresce nem produz{visiting ? '' : ` · dê ${itemName(l.feed)}`}</span>}
      {visiting && a.ready && !a.canSteal && <span>nada para você</span>}
    </div>
  )
}
