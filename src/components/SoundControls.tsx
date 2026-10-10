'use client'
import { play, type Prefs } from '@/game/sfx'

/** Música e efeitos com mudo e volume separados (salvos por jogador em sfx.ts). */
export function SoundControls({ prefs, onChange }: { prefs: Prefs; onChange: (p: Partial<Prefs>) => void }) {
  const row = (label: string, volLabel: string, emoji: string, on: boolean, vol: number, onKey: 'music' | 'sfx', volKey: 'musicVol' | 'sfxVol') => (
    <div className="sound-row">
      <button className="btn" onClick={() => onChange({ [onKey]: !on })} aria-pressed={on} title={on ? `Desligar ${label.toLowerCase()}` : `Ligar ${label.toLowerCase()}`}>
        <span className="tab-emoji">{on ? emoji : '🔇'}</span> {label}
      </button>
      <input type="range" min={0} max={100} step={5} value={Math.round(vol * 100)} disabled={!on} aria-label={volLabel}
        onChange={(e) => onChange({ [volKey]: Number(e.target.value) / 100 })}
        // Solta o controle dos efeitos: amostra do volume novo.
        onPointerUp={() => { if (onKey === 'sfx') play('coin') }} />
    </div>
  )
  return (
    <div className="sound-controls">
      {row('Música', 'Volume da música', '🎵', prefs.music, prefs.musicVol, 'music', 'musicVol')}
      {row('Efeitos', 'Volume dos efeitos', '🔊', prefs.sfx, prefs.sfxVol, 'sfx', 'sfxVol')}
    </div>
  )
}
