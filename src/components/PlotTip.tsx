'use client'
import { SEED_BY_ID, stageFracs } from '@/game/catalog'
import { GROWTH_NAMES, ripeLine } from '@/game/lines'
import { growthName, type PlotView } from '@/game/rules'

export function fmtTime(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h ? `${h}h ${String(m).padStart(2, '0')}min` : m ? `${m}min ${String(sec).padStart(2, '0')}s` : `${sec}s`
}

/** Balão ao passar o mouse no lote (nome, estágio, saúde x/100 e tempo para o próximo estágio). */
/** `tipRef`: quem chama move o balão direto no DOM (seguir o mouse sem redesenhar a página). */
export function PlotTip({ plot, x, y, now, visiting, tipRef }: { plot: PlotView; x: number; y: number; now: number; visiting: boolean; tipRef?: React.Ref<HTMLDivElement> }) {
  const seed = plot.seedId ? SEED_BY_ID[plot.seedId] : undefined
  let body: React.ReactNode
  if (plot.state === 'empty') body = <span>Terra vazia{visiting ? '' : ' · escolha uma semente'}</span>
  else if (plot.state === 'withered') body = <span>Planta seca{visiting ? '' : ' · use a enxada'}</span>
  else {
    const ripe = plot.state === 'ripe'
    const g = growthName(plot.plantedAt!, plot.readyAt!, ripe ? Math.max(now, plot.readyAt!) : now, stageFracs(seed))
    const pct = ripe ? 100 : Math.round(((now - plot.plantedAt!) / (plot.readyAt! - plot.plantedAt!)) * 100)
    const health = plot.health ?? 100
    body = (
      <>
        <span className="tip-row">Saúde <span className="bar health"><i style={{ width: `${health}%` }} /></span> {health}/100</span>
        {!ripe && g.next == null ? (
          // O relógio local já passou da hora; o servidor confirma em instantes.
          <span>Amadurecendo…</span>
        ) : ripe ? (
          <span>{ripeLine(plot.yieldTotal ?? 0, plot.yieldLeft ?? 0)}{visiting && !plot.canSteal ? ' · nada para você' : ''}</span>
        ) : (
          <>
            <span className="tip-row"><span className="bar"><i style={{ width: `${pct}%` }} /></span></span>
            <span>{fmtTime(g.nextAt! - now)} para {g.next}{g.next !== GROWTH_NAMES.ripe ? ` · pronta em ${fmtTime(plot.readyAt! - now)}` : ''}</span>
          </>
        )}
        {(plot.pests || plot.weeds || plot.dry) ? (
          <span className="tip-care">
            {plot.dry ? <span>💧 seca</span> : null}
            {plot.pests ? <span>🐛 {plot.pests}</span> : null}
            {plot.weeds ? <span>🌿 {plot.weeds}</span> : null}
          </span>
        ) : null}
      </>
    )
  }
  return (
    <div ref={tipRef} className="plot-tip" style={{ left: x + 16, top: y + 16 }} role="tooltip">
      <b>{seed ? `${seed.name}${plot.state === 'growing' || plot.state === 'ripe' ? ` (${stageLabel(plot, now)})` : ''}` : 'Lote'}</b>
      {plot.seasons ? <span>{plot.season}/{plot.seasons} (temporada)</span> : null}
      {body}
    </div>
  )
}

function stageLabel(plot: PlotView, now: number) {
  return growthName(plot.plantedAt!, plot.readyAt!, plot.state === 'ripe' ? Math.max(now, plot.readyAt!) : now, stageFracs(SEED_BY_ID[plot.seedId ?? ''])).name
}

export type Fx = { id: number; x: number; y: number; text: string; kind: 'xp' | 'gold' | 'item' | 'bad' }

/** Números que sobem e somem (+2 XP, +15 de ouro). */
export function FxLayer({ fx }: { fx: Fx[] }) {
  return (
    <div className="fx-layer" aria-hidden>
      {fx.map((f, i) => (
        <span key={f.id} className={`fx ${f.kind}`} style={{ left: f.x, top: f.y - i * 4, animationDelay: `${(i % 3) * 120}ms` }}>{f.text}</span>
      ))}
    </div>
  )
}
