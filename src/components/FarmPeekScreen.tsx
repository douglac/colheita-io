'use client'
// Fazenda em destaque em tela cheia (/espiar/[token]): a mesma cena e o mesmo enquadramento da fazenda do jogador,
// mas só para olhar (Evo-27b). Só a câmera anda (arrastar, pinça, roda, com os limites do jogo); nenhum objeto
// responde (sem roubar, ajudar, balão, ficha, cursor de mão nem som). Por cima, só a HUD mínima: iniciais, nível,
// fechar e a faixa que leva ao login. Nada de apelido, avatar com nome ou id: o token é o opaco da vitrine.
import { useEffect, useState } from 'react'
import { START_PLOTS } from '@/game/config'
import { PEEK_FROM, PEEK_JOIN, peekExit } from '@/game/vitrine-text'
import type { SceneDog, SceneLooks, ScenePlot } from '@/scene/FarmScene'
import type { AnimalId, Spots } from '@/game/pasture'
import type { DecorView } from '@/server/decor'
import { SceneView } from './SceneView'

type PeekFarm = { plots: ScenePlot[]; dog: SceneDog; animals: Spots; herd: AnimalId[]; looks: SceneLooks; decor: DecorView }
export type PeekBody = { initials: string; level: number; farm: PeekFarm }

const BADGE_MS = 3000
const noop = () => {}

/** Fecha a tela: volta no histórico se veio da LP (a rolagem volta junto); por link direto, abre a LP. */
export function leavePeek(token: string, join: boolean) {
  if (join) sessionStorage.setItem(PEEK_JOIN, '1')
  // Métricas: a conta que nascer deste navegador veio da vitrine (o cadastro manda e apaga a marca).
  if (join) try { localStorage.setItem('cf:origem', 'vitrine') } catch { /* sem armazenamento: conta como direta */ }
  const from = sessionStorage.getItem(PEEK_FROM)
  sessionStorage.removeItem(PEEK_FROM)
  if (peekExit(from, token) === 'back') history.back()
  else location.replace('/')
}

export function FarmPeekScreen({ token, body }: { token: string; body: PeekBody | null }) {
  const [shown, setShown] = useState(false)
  const [badge, setBadge] = useState(true)
  useEffect(() => {
    if (!shown) return
    const t = setTimeout(() => setBadge(false), BADGE_MS)
    return () => clearTimeout(t)
  }, [shown])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') leavePeek(token, false) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [token])
  const gesture = () => setBadge(false)

  return (
    <main className="game peek-screen">
      <header className="hud peek-hud">
        {body && (
          <div className="who peek-who">
            <strong>Fazenda de {body.initials}</strong>
            <span className="lvl">Nível {body.level}</span>
          </div>
        )}
        <button type="button" className="peek-close" onClick={() => leavePeek(token, false)} aria-label="Fechar e voltar">✕</button>
      </header>
      {body && (
        // Só a câmera responde: o modo vitrine desliga toque, hover e cursor de todos os objetos da cena.
        <div className="peek-scene" onPointerDown={gesture} onWheel={gesture}>
          <SceneView
            vitrine plots={body.farm.plots} visiting farm={token} dog={body.farm.dog} animals={body.farm.animals} herd={body.farm.herd}
            looks={body.farm.looks} decor={body.farm.decor} edit={null} onDecor={noop} onTap={noop} onHover={noop} onDogTap={noop}
            onPointer={noop} onShown={() => setShown(true)}
          />
        </div>
      )}
      {!body ? (
        <div className="peek-wait peek-gone" role="status">
          <p>Essa fazenda saiu da vitrine.</p>
          <button type="button" className="btn big" onClick={() => leavePeek(token, false)}>Voltar para o início</button>
        </div>
      ) : !shown && <p className="peek-wait" role="status">Abrindo a porteira…</p>}
      {body && shown && badge && <span className="peek-badge">👀 Só para olhar · arraste e dê zoom</span>}
      {body && (
        <footer className="peek-bar">
          <span>Gostou? A sua começa com {START_PLOTS} lotes e sementes de graça.</span>
          <button type="button" className="btn big" onClick={() => leavePeek(token, true)}>🌱 Entrar e plantar a sua</button>
        </footer>
      )}
    </main>
  )
}
